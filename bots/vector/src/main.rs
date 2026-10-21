//! vctrtable Poker / Vector SDK 0.11.0 development-only DM transport.
 //! No WebXDC commands yet. Client must send a JSON command DM to this bot.
 //! SDK decrypts NIP-17 DM; accept sender identity ONLY from SDK metadata.
 //! The Node dealer owns private cards and persistent state. Its process uses
 //! the same restricted local stdin/stdout channel as the Rust bot.
use serde::Deserialize;
use serde_json::{json, Value};
use std::error::Error;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt,AsyncWriteExt,BufReader};
use tokio::process::{Child,ChildStdin,ChildStdout,Command};
use tokio::sync::Mutex;
use vector_sdk::VectorBot;

type DynError = Box<dyn Error + Send + Sync>;

struct DealerChild {
    _child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}
#[derive(Deserialize)]
struct Delivery {
    to: String,
    body: String,
}
#[derive(Deserialize)]
struct WorkerReply {
    ok: bool,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    deliveries: Vec<Delivery>,
}
impl DealerChild {
    async fn request(&mut self, input: Value) -> Result<WorkerReply,DynError> {
        let encoded=serde_json::to_vec(&input)?;
        if encoded.len()>16*1024{return Err("oversize IPC request".into());}
        self.stdin.write_all(&encoded).await?;
        self.stdin.write_all(b"\n").await?;
        self.stdin.flush().await?;
        let mut response=String::new();
        let read=self.stdout.read_line(&mut response).await?;
        if read==0||read>256*1024{return Err("dealer IPC disconnected or invalid reply".into());}
        Ok(serde_json::from_str(&response)?)
    }
}

async fn spawn_dealer() -> Result<DealerChild,DynError> {
    // Explicit relative worker path, run from this repository root.
    // Never expose the dealer worker as a public HTTP service.
    let child=Command::new("node")
        .arg("bots/poker/dealer-worker.mjs")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()?;
    let mut child=child;
    let stdin=child.stdin.take().ok_or("missing dealer stdin")?;
    let stdout=child.stdout.take().ok_or("missing dealer stdout")?;
    let mut io=DealerChild{_child:child,stdin,stdout:BufReader::new(stdout)};
    let mut ready=String::new();
    let size=io.stdout.read_line(&mut ready).await?;
    if size==0||size>4096{return Err("dealer failed to initialize".into());}
    let ready:Value=serde_json::from_str(&ready)?;
    if ready.get("kind").and_then(Value::as_str)!=Some("ready")||ready.get("ok").and_then(Value::as_bool)!=Some(true){
        return Err("dealer not ready".into());
    }
    // Child handle remains owned by DealerChild: kill_on_drop protects worker lifetime.
    Ok(io)
}

async fn send_deliveries(bot:&VectorBot, reply:WorkerReply, requester:Option<&str>) {
    if !reply.ok {
        if let Some(sender)=requester {
            let code=reply.code.unwrap_or_else(||"REJECTED".to_string());
            // An expired action can trigger a persisted timeout before being
            // rejected as stale. Do not discard its recipient-specific state
            // deliveries: the other seats also need that new revision.
            let _=bot.dm(sender.to_owned()).send(&format!("poker error: {}",code)).await;
        }
    }
    for delivery in reply.deliveries {
        // Dealer has the configured roster; recipient-specific SDK DMs are
        // NIP-17 encrypted by Vector. Never send via a shared community chat.
        if !delivery.to.starts_with("npub1"){continue;}
        if let Err(_error)=bot.dm(delivery.to).send(&delivery.body).await {
            eprintln!("Private delivery failed; client must request a resync");
        }
    }
}

#[tokio::main]
async fn main() -> Result<(),DynError> {
    // Explicit identity is required. Do not mint a bot account inadvertently.
    let nsec=std::env::var("VECTOR_NSEC").map_err(|_|"VECTOR_NSEC not configured")?;
    let bot=VectorBot::builder().nsec(nsec).build().await?;
    let dealer=Arc::new(Mutex::new(spawn_dealer().await?));
    println!("Poker bot DM adapter is initialized as {}",bot.npub());

    // Timeout evaluation is run by the trusted Rust host's clock. It cannot
    // run while the authoritative room is in a unanimously approved pause.
    {
        let dealer=dealer.clone();
        let bot=bot.clone();
        tokio::spawn(async move {
            let mut interval=tokio::time::interval(Duration::from_secs(1));
            loop {
                interval.tick().await;
                let next={
                    let mut proc=dealer.lock().await;
                    proc.request(json!({"kind":"tick"})).await
                };
                match next {
                    Ok(reply)=>send_deliveries(&bot,reply,None).await,
                    Err(_)=>{eprintln!("Dealer connection lost; refusing further poker actions");break;}
                }
            }
        });
    }

    bot.on_message(move |bot,msg| {
        let dealer=dealer.clone();
        async move {
            if msg.is_mine() || msg.is_group || msg.is_file {return;}
            // SDK's decrypted, verified author is stored in Message.npub.
            // DM chat_id MUST match that author. Never use JSON-provided actor ID.
            let Some(author)=msg.message.npub.clone() else {return;};
            if !author.starts_with("npub1") || msg.chat_id!=author{return;}
            let text=msg.text().trim();
            if text.len()>8192 || !text.starts_with('{') {return;}
            let Ok(request)=serde_json::from_str::<Value>(text) else {return;};
            let next={
                let mut proc=dealer.lock().await;
                if request.get("kind").and_then(Value::as_str)==Some("sync") {
                    proc.request(json!({"kind":"sync","sender":author})).await
                } else {
                    proc.request(json!({"kind":"command","sender":author,"request":request})).await
                }
            };
            match next {
                Ok(reply)=>send_deliveries(&bot,reply,Some(&author)).await,
                Err(_)=>eprintln!("Dealer IPC failed; no message was acknowledged")
            }
        }
    }).await?;
    Ok(())
}
