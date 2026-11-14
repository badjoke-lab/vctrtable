import {makePing,makeAck,nonce,validProbe,ProbeTracker,hostCapabilities} from "./transport-probe.js";
const api=window.webxdc;
const caps=hostCapabilities(api),$=id=>document.getElementById(id);
const tracker=caps.ready?new ProbeTracker(api.selfAddr):null;
$("probe-capability").textContent=caps.ready?
 "WebXDC shared update functions present / 共有更新APIあり":
 "WebXDC shared update API unavailable / 共有更新APIなし";
$("probe-limits").textContent="Advertised send interval: "+caps.sendUpdateInterval+
 " ms; max payload: "+caps.sendUpdateMaxSize+
 " bytes; realtime API present: "+(caps.realtimeAdvertised?"yes":"no")+
 ". Defaults shown if host provides no limits. / 未指定時は仕様の初期値を表示します。";
$("probe-send").disabled=!caps.ready;
function display(){
 $("probe-ack").disabled=!tracker?.peer;
 if(tracker?.peer)$("probe-inbound").textContent=
  "Remote public request received / 他端末からテスト受信（未認証）";
 if(tracker?.ack)$("probe-roundtrip").textContent=
  "Public round trip received / 共有更新往復成功: "+tracker.ack.roundTripMs+
  " ms (local clock; unverified peer / 相手本人未確認)";
}
function send(publicEnvelope){
 // Diagnostic only. Never embed private cards or anything from another
 // game screen. The host may delay or drop this shared update.
 const result=api.sendUpdate({payload:publicEnvelope,info:""},"");
 if(result&&typeof result.catch==="function")
  result.catch(err=>{ $("probe-outbound").textContent=
   "Host rejected update / ホストが拒否: "+String(err?.message||err);});
}
$("probe-send").addEventListener("click",()=>{
 if(!tracker)return;
 try{
  const ping=makePing(api.selfAddr);
  tracker.begin(ping);
  $("probe-roundtrip").textContent="Waiting for manual remote acknowledgement / 応答待ち";
  $("probe-outbound").textContent=
   "Test submitted to WebXDC host (delivery unconfirmed) / ホストへ送信要求（配送未確認）";
  send(ping);
 }catch(e){$("probe-outbound").textContent="Send failed / 送信エラー: "+String(e?.message||e);}
});
$("probe-ack").addEventListener("click",()=>{
 if(!tracker?.peer)return;
 try{
  const ack=makeAck(tracker.peer,api.selfAddr);
  send(ack);tracker.peer=null;
  $("probe-ack").disabled=true;
  $("probe-inbound").textContent=
   "Acknowledgement submitted (delivery unconfirmed) / 応答送信要求済（配送未確認）";
 }catch(e){$("probe-inbound").textContent="Ack failed / 応答エラー: "+String(e?.message||e);}
});
if(caps.ready){
 try{
  // Read-only replay. This page never shares the main lobby's listener,
  // because each standalone WebXDC document owns only one listener.
  api.setUpdateListener(update=>{
   const result=tracker.ingest(update?.payload,update?.serial);
   if(result)display();
  },0);
 }catch(e){$("probe-capability").textContent="Listener unavailable / 受信不可: "+String(e?.message||e);
  $("probe-send").disabled=true;}
}

/**
 * Vector 0.5 realtime peer channel diagnostic.
 * Only explicitly requested public nonce probes are sent. Never use this
 * ephemeral, unauthenticated Iroh transport to settle hands or transfer keys.
 * Local random peer IDs intentionally do not reveal Vector's selfAddr/npub.
 */
const rtMe=nonce();
let rtChannel=null,rtSerial=0,rtTracker=new ProbeTracker(rtMe),rtJoining=false;
const rtEncoder=new TextEncoder(),rtDecoder=new TextDecoder();
const rtLabel=$("probe-rt-capability");
$("probe-rt-join").disabled=!caps.realtimeAdvertised;
rtLabel.textContent=caps.realtimeAdvertised?
 "Realtime API advertised; not joined / 即時通信APIあり。未接続":
 "Realtime API unavailable on this host / 即時通信APIなし";
function rtControls(){
 const joined=Boolean(rtChannel);
 $("probe-rt-join").disabled=!caps.realtimeAdvertised||joined||rtJoining;
 $("probe-rt-send").disabled=!joined;
 $("probe-rt-ack").disabled=!joined||!rtTracker.peer;
 $("probe-rt-leave").disabled=!joined;
}
function rtSend(packet){
 if(!rtChannel)throw Error("Realtime channel not joined");
 // Only the strictly allowlisted public diagnostic envelope may leave.
 if(!validProbe(packet))throw Error("Invalid public probe");
 const bytes=rtEncoder.encode(JSON.stringify(packet));
 if(bytes.length>1024)throw Error("Diagnostic exceeds 1 KB");
 return Promise.resolve(rtChannel.send(bytes));
}
async function rtReceive(data){
 try{
  const bytes=data instanceof Uint8Array?data:
   data instanceof ArrayBuffer?new Uint8Array(data):null;
  if(!bytes||bytes.length>1024||bytes.length===0)return;
  const packet=JSON.parse(rtDecoder.decode(bytes));
  if(!validProbe(packet))return;
  const result=rtTracker.ingest(packet,++rtSerial);
  if(result?.type==="peer-ping"){
   $("probe-rt-inbound").textContent=
    "Realtime test received / 即時テスト受信（本人未認証）";
   rtControls();
  }
  if(result?.type==="ack"){
   $("probe-rt-roundtrip").textContent=
    "Realtime round trip received / 即時往復成功: "+result.roundTripMs+
    " ms (local clock; unauthenticated / 本人未認証)";
  }
 }catch(_error){
  // Untrusted gossip payloads can be malformed. They do not affect gameplay
  // or the primary persistent-update diagnostics.
 }
}
$("probe-rt-join").addEventListener("click",async()=>{
 if(!caps.realtimeAdvertised||rtChannel||rtJoining)return;
 rtJoining=true;rtControls();
 rtLabel.textContent="Joining realtime channel; Vector may request permission / 接続中";
 try{
  const channel=await Promise.resolve(api.joinRealtimeChannel());
  if(!channel||typeof channel.send!=="function"||
     typeof channel.setListener!=="function"||typeof channel.leave!=="function")
   throw Error("Host did not return a WebXDC realtime channel");
  rtChannel=channel;
  channel.setListener(rtReceive);
  rtLabel.textContent=
   "Realtime channel opened locally; peer delivery unconfirmed / 端末内で参加済み。相手への配送は未確認";
 }catch(e){
  rtChannel=null;
  rtLabel.textContent="Realtime join failed / 接続失敗: "+String(e?.message||e);
 }finally{rtJoining=false;rtControls();}
});
$("probe-rt-send").addEventListener("click",async()=>{
 if(!rtChannel)return;
 try{
  const ping=makePing(rtMe);
  rtTracker.begin(ping);
  $("probe-rt-roundtrip").textContent=
   "Waiting for manual realtime acknowledgement / 即時応答待ち";
  await rtSend(ping);
  rtLabel.textContent=
   "Realtime probe accepted locally; waiting for peer / ローカル送信受付。相手の応答待ち";
 }catch(e){
  rtLabel.textContent="Realtime send failed / 即時送信失敗: "+String(e?.message||e);
 }
});
$("probe-rt-ack").addEventListener("click",async()=>{
 if(!rtChannel||!rtTracker.peer)return;
 try{
  const ack=makeAck(rtTracker.peer,rtMe);
  await rtSend(ack);
  rtTracker.peer=null;rtControls();
  $("probe-rt-inbound").textContent=
   "Realtime acknowledgement submitted; remote receipt unconfirmed / 応答送信済。配送未確認";
 }catch(e){
  $("probe-rt-inbound").textContent=
   "Realtime acknowledgement failed / 応答失敗: "+String(e?.message||e);
 }
});
$("probe-rt-leave").addEventListener("click",async()=>{
 if(!rtChannel)return;
 const channel=rtChannel;rtChannel=null;
 rtTracker=new ProbeTracker(rtMe);rtSerial=0;
 try{await Promise.resolve(channel.leave());}
 catch(e){rtLabel.textContent="Leave failed / 切断失敗: "+String(e?.message||e);}
 rtLabel.textContent="Left realtime channel / 切断済み";
 $("probe-rt-inbound").textContent="No realtime request seen / 未受信";
 $("probe-rt-roundtrip").textContent="No realtime acknowledgement / 応答なし";
 rtControls();
});
window.addEventListener("pagehide",()=>{
 if(rtChannel){try{rtChannel.leave();}catch(_error){}rtChannel=null;}
});
rtControls();
