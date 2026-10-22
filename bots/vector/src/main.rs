//! vctrtable Poker / Vector SDK 0.11.0 development-only DM transport.
//! Receives verified, decrypted Vector DMs and forwards them to a single
//! local, encrypted-journal Node dealer. NO WebXDC private-command bridge yet.
use serde::Deserialize;
use serde_json::{json,Value};
use std::error::Error;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufRead,AsyncBufReadExt,AsyncWriteExt,BufReader};
use tokio::process::{Child,ChildStdin,ChildStdout,Command};
use tokio::sync::Mutex;
use tokio::time::{timeout,MissedTickBehavior};
use vector_sdk::VectorBot;
mod delivery_guard;
use delivery_guard::DeliveryOrder;
mod writer_lock;
use writer_lock::DealerWriterLease;

type DynError=Box<dyn Error+Send+Sync>;
const HANDSHAKE_TIMEOUT:Duration=Duration::from_secs(10);
const REQUEST_TIMEOUT:Duration=Duration::from_secs(8);
const MAX_REQUEST_BYTES:usize=16*1024;
const MAX_REPLY_BYTES:usize=256*1024;
const MAX_READY_BYTES:usize=4096;

/// Read a SINGLE newline-terminated frame with a strict memory bound.
/// A disconnected child or an oversized/malformed JSON frame is not reusable.
async fn read_frame<R:AsyncBufRead+Unpin>(reader:&mut R,limit:usize)->Result<Vec<u8>,DynError>{
    let mut bytes=Vec::new();
    loop {
        let (used,found)={
            let buf=reader.fill_buf().await?;
            if buf.is_empty(){return Err("Dealer IPC closed before complete frame".into());}
            let end=buf.iter().position(|b|*b==b'\n');
            let used=end.map(|i|i+1).unwrap_or(buf.len());
            if bytes.len()+used>limit{return Err("Dealer frame exceeds byte limit".into());}
            bytes.extend_from_slice(&buf[..used]);
            (used,end.is_some())
        };
        reader.consume(used);
        if found{return Ok(bytes);}
    }
}

struct DealerChild {
    // kill_on_drop terminates a wedged process; no old state survives an
    // ambiguous IPC write. The next process restores the encrypted journal.
    _child:Child,
    stdin:ChildStdin,
    stdout:BufReader<ChildStdout>,
}
#[derive(Deserialize)]
struct Delivery {
    to:String,
    body:String,
}
#[derive(Deserialize)]
struct WorkerReply {
    ok:bool,
    #[serde(default)]
    code:Option<String>,
    #[serde(default)]
    deliveries:Vec<Delivery>,
    #[serde(default)]
    revision:Option<u64>,
}
impl DealerChild {
    async fn request(&mut self,input:Value)->Result<WorkerReply,DynError>{
        let encoded=serde_json::to_vec(&input)?;
        if encoded.len()>MAX_REQUEST_BYTES{return Err("Oversized dealer IPC request".into());}
        self.stdin.write_all(&encoded).await?;
        self.stdin.write_all(b"\n").await?;
        self.stdin.flush().await?;
        let frame=read_frame(&mut self.stdout,MAX_REPLY_BYTES).await?;
        Ok(serde_json::from_slice(&frame)?)
    }
}

async fn spawn_dealer()->Result<(DealerChild,u64),DynError>{
    // Rust and Node must have the same private environment; the Node worker
    // is NOT a HTTP service, and no identity keys appear in IPC JSON.
    let mut child=Command::new("node")
        .arg("bots/poker/dealer-worker.mjs")
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()?;
    let stdin=child.stdin.take().ok_or("Missing dealer stdin")?;
    let stdout=child.stdout.take().ok_or("Missing dealer stdout")?;
    let mut io=DealerChild{_child:child,stdin,stdout:BufReader::new(stdout)};
    let frame=read_frame(&mut io.stdout,MAX_READY_BYTES).await?;
    let ready:Value=serde_json::from_slice(&frame)?;
    if ready.get("kind").and_then(Value::as_str)!=Some("ready")||
       ready.get("ok").and_then(Value::as_bool)!=Some(true){
        return Err("Dealer failed to initialize".into());
    }
    let rev=ready.get("revision").and_then(Value::as_u64).ok_or("Missing dealer revision")?;
    Ok((io,rev))
}

/// Single serializing supervisor: never retry an ambiguous command by itself.
/// The user may safely resend with the SAME requestId; journal receipts make
/// that idempotent even if the old process died after committing.
struct DealerSupervisor {
    child:Option<DealerChild>,
    recovery_pending:bool,
}
impl DealerSupervisor {
    async fn start()->Result<Self,DynError>{
        let (child,revision)=timeout(HANDSHAKE_TIMEOUT,spawn_dealer()).await??;
        // A process restart may have missed recipient DMs after persisting.
        // Broadcast private snapshots once if a nonempty journal was loaded.
        Ok(Self{child:Some(child),recovery_pending:revision>0})
    }
    async fn exchange(&mut self,input:Value)->Result<WorkerReply,DynError>{
        let child=self.child.as_mut().ok_or("No dealer child")?;
        Ok(timeout(REQUEST_TIMEOUT,child.request(input)).await??)
    }
    async fn request(&mut self,input:Value)->Result<WorkerReply,DynError>{
        if self.child.is_none(){
            let start=timeout(HANDSHAKE_TIMEOUT,spawn_dealer()).await;
            match start {
                Ok(Ok((child,_)))=>{
                    self.child=Some(child);
                    self.recovery_pending=true;
                }
                _=>return Err("Dealer restart failed; will retry later".into()),
            }
        }
        let mut reply=match self.exchange(input).await{
            Ok(response)=>response,
            Err(_)=>{
                self.child.take(); // SIGKILL a possibly wedged or broken worker
                self.recovery_pending=true;
                return Err("Dealer IPC failed; child reset to restore journal".into());
            }
        };
        if self.recovery_pending {
            // Send the LATEST committed snapshot to all 2–6 seats exactly
            // once after recovery. Replace, don't append, the current command
            // deliveries to avoid stale or duplicate private hand messages.
            match self.exchange(json!({"kind":"recover"})).await{
                Ok(recovered) if recovered.ok=>{
                    reply.deliveries=recovered.deliveries;
                    self.recovery_pending=false;
                }
                _=>{
                    self.child.take();
                    self.recovery_pending=true;
                    return Err("Dealer recovery snapshot failed; will retry".into());
                }
            }
        }
        Ok(reply)
    }
}

// Caller holds the delivery-order mutex for the entire batch. A concurrent
// timeout tick and a player action may complete network sends in a different
// order than their authoritative dealer revisions: older state is suppressed.
/// Serialize BATCHES across tick and player callbacks to prevent an old
/// snapshot from arriving after a newer one. Within a batch, send to all
/// recipients concurrently so a slow DM does not block the other five seats.
/// Actual relay delivery is not guaranteed; clients can resync explicitly.
async fn send_deliveries(
    bot:&VectorBot,reply:WorkerReply,requester:Option<&str>,order:&mut DeliveryOrder
){
    if !reply.ok {
        if let Some(sender)=requester{
            let code=reply.code.unwrap_or_else(||"REJECTED".to_string());
            let bot=bot.clone();
            let sender=sender.to_owned();
            let notice=format!("poker error: {}",code);
            let _=timeout(Duration::from_secs(5),
                async move {bot.dm(sender).send(&notice).await}).await;
        }
    }
    let mut pending=tokio::task::JoinSet::new();
    for delivery in reply.deliveries{
        // Private recipient and revision MUST agree with authenticated local
        // worker's reply and embedded seat snapshot. No public broadcast.
        if !order.eligible(&delivery.to,&delivery.body,reply.revision){
            eprintln!("Skipped invalid or stale private poker snapshot");
            continue;
        }
        let bot=bot.clone();
        pending.spawn(async move {
            let sent=matches!(timeout(Duration::from_secs(5),
                async {bot.dm(delivery.to.clone()).send(&delivery.body).await}).await,
                Ok(Ok(_)));
            (delivery.to,sent)
        });
    }
    while let Some(result)=pending.join_next().await{
        match result{
            Ok((recipient,true))=>order.record_success(&recipient,reply.revision.unwrap_or_default()),
            _=>eprintln!("Private delivery failed or timed out; recipient may resync"),
        }
    }
}

#[tokio::main]
async fn main()->Result<(),DynError>{
    // Acquire BEFORE starting the SDK or Node child. Only one Bot process
    // may own a journal, even if two supervisors race during restart.
    // Keep the descriptor alive until this process exits; OS frees on crash.
    let _journal_writer_lease=DealerWriterLease::from_env()?;
    let nsec=std::env::var("VECTOR_NSEC").map_err(|_|"VECTOR_NSEC not configured")?;
    let bot=VectorBot::builder().nsec(nsec).build().await?;
    let dealer=Arc::new(Mutex::new(DealerSupervisor::start().await?));
    let delivery_order=Arc::new(Mutex::new(DeliveryOrder::default()));
    println!("Poker Bot DM adapter initialized as {}",bot.npub());

    // Keep the timeout/supervision loop ALIVE after a dealer crash. A later
    // tick or private request can restore from disk and send a private resync.
    {
        let dealer=dealer.clone();
        let bot=bot.clone();
        let delivery_order=delivery_order.clone();
        tokio::spawn(async move{
            let mut interval=tokio::time::interval(Duration::from_secs(1));
            interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
            let mut failures=0u64;
            loop{
                interval.tick().await;
                let next={
                    let mut proc=dealer.lock().await;
                    proc.request(json!({"kind":"tick"})).await
                };
                match next{
                    Ok(reply)=>{
                        failures=0;
                        let mut order=delivery_order.lock().await;
                        send_deliveries(&bot,reply,None,&mut order).await;
                    }
                    Err(_)=>{
                        failures=failures.saturating_add(1);
                        // Avoid repeated logs that could drown out meaningful
                        // operational errors while a host is unavailable.
                        if failures==1||failures%60==0{
                            eprintln!("Dealer unavailable; supervising restart, not accepting stale state");
                        }
                    }
                }
            }
        });
    }

    bot.on_message(move |bot,msg|{
        let dealer=dealer.clone();
        let delivery_order=delivery_order.clone();
        async move{
            if msg.is_mine()||msg.is_group||msg.is_file{return;}
            // NIP-17 sender is obtained from authenticated Vector SDK metadata.
            let Some(author)=msg.message.npub.clone() else{return;};
            if !author.starts_with("npub1")||msg.chat_id!=author{return;}
            let text=msg.text().trim();
            if text.len()>8192||!text.starts_with('{'){return;}
            let Ok(request)=serde_json::from_str::<Value>(text) else{return;};
            let next={
                let mut proc=dealer.lock().await;
                if request.get("kind").and_then(Value::as_str)==Some("sync"){
                    proc.request(json!({"kind":"sync","sender":author})).await
                }else{
                    proc.request(json!({"kind":"command","sender":author,"request":request})).await
                }
            };
            match next{
                Ok(reply)=>{
                    let mut order=delivery_order.lock().await;
                    send_deliveries(&bot,reply,Some(&author),&mut order).await;
                },
                Err(_)=>{
                    // The command may have been committed before IPC failed.
                    // Never retry an unknown-mutating command automatically.
                    eprintln!("Dealer IPC failed; private action acknowledgement uncertain");
                    let _=bot.dm(author).send("poker error: DEALER_UNAVAILABLE_RETRY_SAME_REQUEST_ID_OR_SYNC").await;
                }
            }
        }
    }).await?;
    Ok(())
}

#[cfg(test)]
mod tests{
    use super::*;
    use tokio::io::duplex;

    #[tokio::test]
    async fn framed_reader_accepts_two_messages_in_sequence(){
        let (mut sender,receiver)=duplex(128);
        let write=tokio::spawn(async move{
            sender.write_all(b"{\"ok\":true}\n{\"ok\":false}\n").await.unwrap();
        });
        let mut reader=BufReader::new(receiver);
        assert_eq!(read_frame(&mut reader,20).await.unwrap(),b"{\"ok\":true}\n");
        assert_eq!(read_frame(&mut reader,20).await.unwrap(),b"{\"ok\":false}\n");
        write.await.unwrap();
    }

    #[tokio::test]
    async fn framed_reader_rejects_oversized_and_incomplete_messages(){
        let (mut sender,receiver)=duplex(128);
        let write=tokio::spawn(async move{
            sender.write_all(b"01234567890123456789\n").await.unwrap();
        });
        let mut reader=BufReader::new(receiver);
        assert!(read_frame(&mut reader,10).await.is_err());
        write.await.unwrap();

        let (mut sender,receiver)=duplex(128);
        sender.write_all(b"{\"ok\":true}").await.unwrap();
        drop(sender);
        let mut reader=BufReader::new(receiver);
        assert!(read_frame(&mut reader,128).await.is_err());
    }
}
