import {cardById,scoreCards} from "../../packages/hanafuda/koikoi.js";
import {createAuthoritativeMatch,matchingTargets} from "../../packages/hanafuda/pvp-core.js";
import {publicYakuOutlook} from "../../packages/hanafuda/guide.js";
import {createEphemeralIdentity,deriveKey,pairingCode,sealMessage,openMessage} from "../../packages/hanafuda/pvp-crypto.js";

const $=id=>document.getElementById(id);
const encoder=new TextEncoder(),decoder=new TextDecoder();
const STR={
 en:{
  lobbyTitle:"Play a friend · PvP",warning:"FRIENDLY-HOST MODE: The player creating this table controls the shuffle and can know both hands. Use only with a person you trust. Compare the six-digit pairing code verbally; this is not cheat-proof ranked play.",
  unavailable:"This Vector/WebXDC host does not support realtime multiplayer. PvE remains available.",
  available:"Realtime multiplayer supported. Open this same Mini App in one Vector chat.",
  host:"Create table",join:"Join friend's table",rounds:"Rounds",
  instructions:"Open the SAME Mini App message in the SAME Vector chat. Two unrelated Notes are not connected. Both players must keep the game open during this QA test.",
  waiting:"Hosting · waiting for a second player to open this Mini App…",
  searching:"Searching for a host in this Mini App…",
  pairing:"Compare this code with the other player before accepting:",
  approval:"Codes match · Connect",waitingApproval:"Waiting for both players to confirm the same code…",
  connected:"Private channel established. The host can start a match.",
  start:"Start two-player match",you:"You",opponent:"Opponent",
  dealer:"Dealer",hand:"Your hand",oppHand:"Opponent's hidden hand",
  field:"Field · Match cards by month",draw:"Draw pile",
  yourCaptured:"Your captured cards",oppCaptured:"Opponent's captured cards",
  choose:"Tap a hand card, select a matching field target if required, then confirm.",
  wait:"Waiting for the other player…",selectTarget:"Choose one of the highlighted field cards.",
  drawPick:"The drawn card matches two field cards. Tap the field card you want to capture.",
  decision:"Yaku completed! Stop to score or declare Koi-Koi.",
  roundDone:"Round complete. Waiting for host to start the next round.",
  matchDone:"Match complete. Final scores above.",next:"Next round (host)",
  confirm:"Play this card",cancel:"Cancel",stop:"Stop & score",koi:"Koi-Koi",
  hintsOn:"Hints: On",hintsOff:"Hints: Off",guide:"Yaku guide",close:"Close",
  sync:"Resync",play:"Played",drew:"Drew",youAct:"Your turn",opponentAct:"Opponent's turn",
  noYaku:"No completed yaku yet", guideNote:"Only publicly captured cards and your own hand are used. The opponent's hidden hand and remaining deck are never inspected.",
  ownOutlook:"Your yaku",theirOutlook:"Opponent's public yaku",
  blocked:"Impossible (required card already captured)",held:"A required card is in your hand",
  soon:"One card away",ready:"Completed",progress:"In progress",
  reconnect:"Network reconnect requested. If the host was closed/reloaded, the current QA match cannot be recovered.",
  error:"Action rejected",trust:"The host still knows the full deck. Pairing encryption does not make dealing provably fair."
 },
 ja:{
  lobbyTitle:"友人と対戦 · PvP",warning:"【信頼型の親方式】卓を作る人が配札を管理するため、技術的には相手の手札も分かります。信頼できる友人同士で使用し、6桁の照合番号を互いに確認してください。公平性が証明された競技モードではありません。",
  unavailable:"このVector/WebXDC環境ではリアルタイム対戦に対応していません。PvEは引き続き遊べます。",
  available:"リアルタイム通信に対応しています。同じVectorチャットの同じMini Appを開いてください。",
  host:"卓を作る",join:"友人の卓に参加",rounds:"局数",
  instructions:"同じVectorチャットにある同じMini Appメッセージを2人で開きます。別のNoteでは接続されません。QA中は2人とも画面を開いたままにしてください。",
  waiting:"卓を作成済み · 相手が同じMini Appを開くのを待機中",
  searching:"同じMini App内の親を検索中…",
  pairing:"相手と口頭で照合する6桁の番号：",
  approval:"番号が一致した · 接続",waitingApproval:"双方の番号確認を待っています…",
  connected:"秘密通信を確立しました。親が対局を開始できます。",
  start:"2人対戦を開始",you:"あなた",opponent:"相手",
  dealer:"親",hand:"自分の手札",oppHand:"相手の手札（裏向き）",
  field:"場札 · 同じ月の札を合わせる",draw:"山札",
  yourCaptured:"自分の取り札",oppCaptured:"相手の取り札",
  choose:"手札を選択 → 必要なら場札を選択 → 確定してください。",
  wait:"相手の操作を待っています…",selectTarget:"光っている場札から取る札を選んでください。",
  drawPick:"山札の札に一致する場札が2枚あります。取る札を選んでください。",
  decision:"役が成立しました！ あがり、またはこいこいを選んでください。",
  roundDone:"この局が終了しました。親が次の局を開始するまで待機します。",
  matchDone:"全局終了です。最終得点を確認してください。",next:"次の局へ（親）",
  confirm:"この札を出す",cancel:"キャンセル",stop:"あがり",koi:"こいこい",
  hintsOn:"ヒント：オン",hintsOff:"ヒント：オフ",guide:"役のガイド",close:"閉じる",
  sync:"再同期",play:"出した札",drew:"めくった札",youAct:"あなたの手番",opponentAct:"相手の手番",
  noYaku:"成立済みの役なし",guideNote:"取り札と自分の手札だけから判定します。相手の裏向き手札や山札は参照しません。",
  ownOutlook:"自分の役",theirOutlook:"相手の役の状況",
  blocked:"成立不可（必要札が取られている）",held:"必要札をあなたが手札に所持",
  soon:"あと1枚",ready:"成立済み",progress:"進行中",
  reconnect:"再同期を要求しました。親が画面を閉じて再読み込みした場合、このQA対局は復元できません。",
  error:"操作エラー",trust:"親は山札全体を知っています。暗号化だけで公平な配札になるわけではありません。"
 }
};
const Y={
 goko:["五光","Gokō","Five Brights"],shiko:["四光","Shikō","Four Brights"],
 "ame-shiko":["雨四光","Ame-shikō","Rain Four Brights"],sanko:["三光","Sankō","Three Brights"],
 inoshikacho:["猪鹿蝶","Inoshikachō","Boar, Deer & Butterfly"],
 akatan:["赤短","Akatan","Red Poetry Ribbons"],aotan:["青短","Aotan","Blue Ribbons"],
 hanami:["花見で一杯","Hanami de Ippai","Sake Under the Blossoms"],
 tsukimi:["月見で一杯","Tsukimi de Ippai","Sake Under the Moon"],
 tane:["タネ","Tane","Seed Cards"],tan:["タン","Tan","Ribbon Cards"],
 kasu:["カス","Kasu","Plain Cards"]
};
let lang="en",mode=null,identity=null,peer=null,key=null,channel=null;
let room=null,me=null,approved=false,peerApproved=false,connected=false;
let hostMatch=null,visible=null,revision=-1,hostSeq=0,guestSeq=0,lastGuestSeq=0;
let outstanding=null,selected=null,target=null,hints=false,offeredCode="",lastSeen=Date.now();
let updating=false,interval=null,sessionLost=false;
const tx=k=>STR[lang][k]||k;
const yaku=key=>lang==="ja"?(Y[key]?.[0]||key):
 (Y[key]?Y[key][0]+" ("+Y[key][1]+" — "+Y[key][2]+")":key);
const ID=()=>{const v=crypto.getRandomValues(new Uint8Array(12));
 return Array.from(v,x=>x.toString(16).padStart(2,"0")).join("");};
function showStatus(message){$("connectionStatus").textContent=message;}
function setText(id,word){$(id).textContent=tx(word);}
function localize(){
 const ids={
  lobbyTitle:"lobbyTitle",hostingWarning:"warning",host:"host",
  join:"join",roundsLabel:"rounds",instructions:"instructions",
  pairingText:"pairing",approve:"approval",startMatch:"start",
  oppLabel:"opponent",youLabel:"you",opponentHandLabel:"oppHand",
  oppCapturedLabel:"oppCaptured",fieldLabel:"field",drawPileLabel:"draw",
  yourCapturedLabel:"yourCaptured",yourHandLabel:"hand",
  confirm:"confirm",cancel:"cancel",stop:"stop",koi:"koi",
  nextRound:"next",hints:hints?"hintsOn":"hintsOff",
  guide:"guide",closeGuide:"close",sync:"sync",guideNote:"guideNote"
 };
 for(const [id,k] of Object.entries(ids))setText(id,k);
 if(mode===null)$("supportStatus").textContent=isAvailable()?tx("available"):tx("unavailable");
 if(mode==="host"&&!connected)showStatus(peer?tx("waitingApproval"):tx("waiting"));
 if(mode==="guest"&&!connected)showStatus(peer?tx("waitingApproval"):tx("searching"));
 if(visible)render();
}
function isAvailable(){return typeof window.webxdc?.joinRealtimeChannel==="function"&&
 typeof crypto?.subtle!=="undefined";}
function sendPlain(packet){
 if(!channel)return;
 const bytes=encoder.encode(JSON.stringify(packet));
 if(bytes.length>128000)throw Error("Realtime packet too large");
 channel.send(bytes);
}
async function sendSecure(body){
 if(!key||!peer||!room)throw Error("No pairing key");
 const packet=await sealMessage(key,{room,from:me,to:peer.id},body);
 sendPlain(packet);
}
async function shareState(){
 if(mode!=="host"||!hostMatch||!connected)return;
 const result=hostMatch.snapshot(1);
 await sendSecure({kind:"snapshot",revision:result.revision,seq:++hostSeq,
  ack:lastGuestSeq,data:result});
 visible=hostMatch.snapshot(0);revision=visible.revision;
 selected=null;target=null;render();
}
function wire(){
 channel=window.webxdc.joinRealtimeChannel();
 channel.setListener(bytes=>{
  try{
   const packet=JSON.parse(decoder.decode(bytes));
   void received(packet).catch(e=>showStatus("Network: "+e.message));
  }catch(e){showStatus("Packet: "+e.message);}
 });
 interval=setInterval(()=>{
  if(mode==="host"){
   sendPlain({v:1,kind:"offer",room,from:me,pub:identity.publicKey});
   if(connected)void sendSecure({kind:"ping",n:Date.now()}).catch(()=>{});
  }else if(mode==="guest"){
   if(peer&&!connected)sendPlain({v:1,kind:"join",room,from:me,pub:identity.publicKey});
   if(connected){
    if(outstanding)void sendSecure(outstanding).catch(()=>{});
    else void sendSecure({kind:"ping",n:Date.now()}).catch(()=>{});
   }
  }
  if(connected&&Date.now()-lastSeen>16000){
   sessionLost=true;showStatus(lang==="ja"?
    "通信が途絶えています。再同期を試してください。":
    "Connection appears interrupted. Try Resync.");
  }
 },2000);
}
async function begin(modeChoice){
 if(mode||!isAvailable())return;
 mode=modeChoice;me=ID();identity=await createEphemeralIdentity();
 room=mode==="host"?ID():null;
 $("host").disabled=true;$("join").disabled=true;
 wire();
 if(mode==="host"){
  showStatus(tx("waiting"));
  sendPlain({v:1,kind:"offer",room,from:me,pub:identity.publicKey});
 }else showStatus(tx("searching"));
}
async function received(packet){
 if(!packet||packet.v!==1||packet.from===me)return;
 if(packet.kind==="offer"&&mode==="guest"&&!connected){
  if(peer&&peer.id!==packet.from)return; // first offer pinned
  if(typeof packet.pub!=="string"||typeof packet.room!=="string")return;
  room=packet.room;peer={id:packet.from,pub:packet.pub};
  key=await deriveKey(identity,peer.pub);
  offeredCode=await pairingCode(room,peer.pub,identity.publicKey);
  showPairing();
  sendPlain({v:1,kind:"join",room,from:me,pub:identity.publicKey});
  return;
 }
 if(packet.kind==="join"&&mode==="host"&&!connected){
  if(packet.room!==room||!packet.pub||peer&&peer.id!==packet.from)return;
  peer={id:packet.from,pub:packet.pub};
  key=await deriveKey(identity,peer.pub);
  offeredCode=await pairingCode(room,identity.publicKey,peer.pub);
  showPairing();
  return;
 }
 if(packet.kind!=="sealed"||!peer||!key||packet.from!==peer.id||
   packet.to!==me||packet.room!==room)return;
 let data;
 try{data=await openMessage(key,packet,{room,from:peer.id,to:me});}
 catch{return;} // Invalid authenticated messages cannot mutate match.
 lastSeen=Date.now();sessionLost=false;
 if(mode==="host")await onHostMessage(data);
 else await onGuestMessage(data);
}
function showPairing(){
 $("pairing").hidden=false;$("pairingCode").textContent=offeredCode;
 showStatus(tx("waitingApproval"));
}
async function hostConnectIfReady(){
 if(!approved||!peerApproved||connected||!key)return;
 connected=true;$("pairing").hidden=true;
 $("startMatch").hidden=false;
 showStatus(tx("connected"));
 await sendSecure({kind:"connected"});
}
async function onHostMessage(data){
 if(data?.kind==="ready"){
  peerApproved=true;await hostConnectIfReady();
 }else if(data?.kind==="sync"){
  if(connected&&hostMatch)await shareState();
  else if(connected)await sendSecure({kind:"connected"});
 }else if(data?.kind==="intent"&&connected&&hostMatch){
  const seq=data.seq;
  if(!Number.isSafeInteger(seq)||seq<1)return;
  if(seq<=lastGuestSeq){await shareState();return;} // duplicate replay
  if(seq!==lastGuestSeq+1){await shareState();return;}
  try{
   if(data.baseRevision!==hostMatch.snapshot(0).revision)
    throw Error("Stale turn. Resync and retry.");
   hostMatch.send(1,data.intent);
   lastGuestSeq=seq;
   await shareState();
  }catch(e){
   await sendSecure({kind:"rejected",seq,reason:e.message});
   await shareState();
  }
 }
}
async function onGuestMessage(data){
 if(data?.kind==="connected"){
  connected=true;$("pairing").hidden=true;
  showStatus(tx("connected"));
  await sendSecure({kind:"sync"});
 }else if(data?.kind==="snapshot"){
  if(!connected||!data.data||data.data.seat!==1||
     data.data.protocol!==1||data.revision<data.data.revision)return;
  if(data.data.revision<revision)return; // late packet
  if(data.ack>=guestSeq)outstanding=null;
  visible=data.data;revision=data.data.revision;
  selected=null;target=null;render();
  $("lobby").hidden=true;$("match").hidden=false;
 }else if(data?.kind==="rejected"){
  if(outstanding?.seq===data.seq){
   outstanding=null;showStatus(tx("error")+": "+data.reason);
  }
 }
}
async function commit(intent){
 if(!visible||updating||outstanding)return;
 updating=true;
 try{
  if(mode==="host"){
   hostMatch.send(0,intent);
   await shareState();
  }else{
   outstanding={kind:"intent",seq:++guestSeq,baseRevision:revision,intent};
   await sendSecure(outstanding);
   showStatus(lang==="ja"?"操作を送信しました。相手の確認待ち…":
    "Move sent. Waiting for host confirmation…");
  }
 }catch(e){showStatus(tx("error")+": "+e.message);}
 finally{updating=false;render();}
}
function freshBoard(){
 selected=null;target=null;
 $("lobby").hidden=true;$("match").hidden=false;
}
function createCard(id,{back=false,click=null,cls=""}={}){
 const button=document.createElement("button");button.type="button";
 button.className="card "+cls;
 const img=document.createElement("img");img.src="cards/"+(back?"back":id)+".svg";
 img.alt=back?"":id;img.draggable=false;button.append(img);
 if(id&&!back)button.dataset.cardId=id;
 if(click)button.addEventListener("click",click);
 else button.disabled=true;
 return button;
}
function refill(id,cards,build){
 const el=$(id);const x=el.scrollLeft;
 el.replaceChildren(...cards.map(build));el.scrollLeft=x;
}
function getTargets(){return selected&&visible?matchingTargets(visible.public.field,selected):[];}
function activeSeat(){return visible?.public?.active===visible?.seat;}
function statusText(){
 if(!visible)return "";
 const {public:p}=visible;
 if(p.phase==="ended"){
  return (visible.finished?tx("matchDone"):tx("roundDone"))+
   " "+(p.winner===null?"—":p.winner===visible.seat?tx("you"):tx("opponent"))+
   " · "+p.points+" points · "+p.endedReason;
 }
 if(!activeSeat())return tx("wait");
 if(p.phase==="decision")return tx("decision");
 if(p.phase==="choose")return tx("drawPick")+
  (p.revealedDraw?" ("+cardById(p.revealedDraw)?.monthEn+")":"");
 return tx("choose");
}
function render(){
 if(!visible)return;
 const p=visible.public,seat=visible.seat,host=seat===0;
 const mine=p.captured[seat],theirs=p.captured[1-seat],hand=visible.hand;
 $("lobby").hidden=true;$("match").hidden=false;
 $("yourScore").textContent=visible.scores[seat];
 $("oppScore").textContent=visible.scores[1-seat];
 $("roundLabel").textContent=lang==="ja"?
  "第"+visible.round+"局 / "+visible.rounds:
  "Round "+visible.round+" / "+visible.rounds;
 $("dealerLabel").textContent=tx("dealer")+": "+
  (p.dealer===seat?tx("you"):tx("opponent"));
 $("deckCount").textContent=p.deckCount;
 $("gameStatus").textContent=statusText();
 const matchTurn=activeSeat()&&p.phase==="turn"&&!outstanding;
 const options=getTargets();
 refill("opponentHand",Array.from({length:p.handCounts[1-seat]},()=>null),
  ()=>createCard(null,{back:true}));
 refill("yourHand",hand,id=>createCard(id,{
  click:matchTurn?()=>{selected=id;target=null;render();}:null,
  cls:selected===id?"selected":""
 }));
 refill("opponentCaptured",theirs,id=>createCard(id));
 refill("yourCaptured",mine,id=>createCard(id));
 const drawnChoice=activeSeat()&&p.phase==="choose"&&
  p.pendingStep==="draw"&&!outstanding;
 refill("field",p.field,id=>createCard(id,{
  click:drawnChoice&&p.pendingChoices.includes(id)?
   ()=>void commit({kind:"choose",targetId:id}):
   matchTurn&&options.length===2&&options.includes(id)?
    ()=>{target=id;render();}:null,
  cls:drawnChoice&&p.pendingChoices.includes(id)?"target":
    target===id?"chosen":
    options.includes(id)?"match":""
 }));
 const columns=window.innerWidth>=700?6:4;
 $("field").style.setProperty("--rows",String(Math.max(2,Math.ceil(p.field.length/columns))));
 $("playActions").hidden=!matchTurn;
 $("playHint").hidden=matchTurn||p.phase==="decision"&&activeSeat()||
   p.phase==="ended"&&host||drawnChoice;
 $("decisionActions").hidden=!(activeSeat()&&p.phase==="decision");
 $("drawPick").hidden=!drawnChoice;
 $("roundActions").hidden=!(host&&p.phase==="ended"&&!visible.finished);
 $("confirm").disabled=!selected||options.length===2&&!target||!!outstanding;
 $("confirm").textContent=tx("confirm");
 $("cancel").textContent=tx("cancel");
 $("stop").textContent=tx("stop");$("koi").textContent=tx("koi");
 $("nextRound").textContent=tx("next");
 $("drawPick").textContent=tx("drawPick");
 $("playHint").textContent=tx("choose");
 $("hints").textContent=tx(hints?"hintsOn":"hintsOff");
 if(hints)showCompactHints();
}
function showCompactHints(){
 if(!visible)return;
 const seat=visible.seat,p=visible.public;
 const near=publicYakuOutlook(p.captured[1-seat],p.captured[seat],visible.hand)
  .filter(x=>x.oneAway&&!x.impossible&&!x.superseded);
 if(!near.length)return;
 $("gameStatus").textContent+=" · "+tx("opponent")+
  ": "+near.slice(0,2).map(x=>Y[x.key]?.[0]||x.key).join(", ")+" 1/away";
}
function showGuide(){
 if(!visible)return;
 const seat=visible.seat,p=visible.public;
 const own=publicYakuOutlook(p.captured[seat],p.captured[1-seat]);
 const opp=publicYakuOutlook(p.captured[1-seat],p.captured[seat],visible.hand);
 $("outlooks").replaceChildren();
 for(const [title,entries] of [[tx("ownOutlook"),own],[tx("theirOutlook"),opp]]){
  const h=document.createElement("h3");h.textContent=title;$("outlooks").append(h);
  for(const e of entries.filter(e=>e.have>0&&!e.superseded)){
   const row=document.createElement("div");row.className="outlook-card";
   const label=document.createElement("strong");label.textContent=yaku(e.key);
   const status=document.createElement("span");
   status.textContent=e.have+"/"+e.need+" · "+
    tx(e.completed?"ready":e.impossible?"blocked":
    e.heldIds?.length?"held":e.oneAway?"soon":"progress");
   row.append(label,status);$("outlooks").append(row);
  }
 }
 $("guideDialog").showModal?.();
}
$("lang").addEventListener("change",()=>{lang=$("lang").value;localize();});
$("host").addEventListener("click",()=>{void begin("host").catch(e=>showStatus(e.message));});
$("join").addEventListener("click",()=>{void begin("guest").catch(e=>showStatus(e.message));});
$("approve").addEventListener("click",()=>{
 approved=true;$("approve").disabled=true;
 if(mode==="guest"){
  void sendSecure({kind:"ready"}).catch(e=>showStatus(e.message));
  showStatus(tx("waitingApproval"));
 }else void hostConnectIfReady().catch(e=>showStatus(e.message));
});
$("startMatch").addEventListener("click",()=>{
 if(mode!=="host"||!connected||hostMatch)return;
 try{
  hostMatch=createAuthoritativeMatch({rounds:Number($("rounds").value)});
  freshBoard();void shareState();
 }catch(e){showStatus(e.message);}
});
$("confirm").addEventListener("click",()=>{
 if(!selected||!visible)return;
 const targets=getTargets();
 if(targets.length===2&&!target)return;
 void commit({kind:"play",cardId:selected,targetId:target});
});
$("cancel").addEventListener("click",()=>{selected=null;target=null;render();});
$("stop").addEventListener("click",()=>{void commit({kind:"decide",choice:"stop"});});
$("koi").addEventListener("click",()=>{void commit({kind:"decide",choice:"koi"});});
$("nextRound").addEventListener("click",()=>{
 if(mode!=="host"||!hostMatch)return;
 try{hostMatch.nextRound();void shareState();}
 catch(e){showStatus(e.message);}
});
$("sync").addEventListener("click",()=>{
 showStatus(tx("reconnect"));
 if(mode==="guest"&&connected)void sendSecure({kind:"sync"});
 if(mode==="host"&&connected)void shareState();
});
$("hints").addEventListener("click",()=>{hints=!hints;render();});
$("guide").addEventListener("click",showGuide);
$("closeGuide").addEventListener("click",()=>$("guideDialog").close?.());
window.addEventListener("resize",()=>{
 if(!visible)return;
 const columns=window.innerWidth>=700?6:4;
 $("field").style.setProperty("--rows",String(Math.max(2,
  Math.ceil(visible.public.field.length/columns))));
});
window.addEventListener("pagehide",()=>{if(channel)channel.leave();if(interval)clearInterval(interval);});
$("host").disabled=!isAvailable();$("join").disabled=!isAvailable();
localize();
