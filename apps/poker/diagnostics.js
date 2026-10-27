import {makePing,makeAck,ProbeTracker,hostCapabilities} from "./transport-probe.js";
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
