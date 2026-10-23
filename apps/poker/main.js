/**
 * Same-chat WebXDC table lobby. Shared updates contain only public admission,
 * ready, proposals, votes and optional public chat. NEVER poker secrets.
 *
 * This is an unauthenticated roster prototype, not the SDK-authorized dealer:
 * payload.by is display metadata and cannot authorize game actions.
 */
import {TABLE_EVENT_KINDS,validTableEvent,deriveSharedTable,tableInvitationText} from "./table-lobby.js";
const strings={
en:{
 title:"Private Poker Table",language:"Language",warning:"SHARED LOBBY ONLY · No live betting or private dealing. Join the SAME Vector chat to share this table.",players:"Players",create:"Create Table",maxSeats:"Maximum players",join:"Join Table",joined:"Joined",leave:"Leave Table",close:"Close Table",ready:"I'm Ready",unready:"Not Ready",invite:"Invite Players",inviteHelp:"Invite friends to this same Vector group using Vector's native group invitation. A different DM/Note is NOT the same table.",inviteDraft:"Prepare invitation message",inviteResult:"Vector opened a message draft. Sending and joining are NOT confirmed.",inviteManual:"Open Vector's group invitation controls and invite friends to this chat, then share/open this same Poker Mini App message.",roomMissing:"No table yet. Create one here; other chat participants can then tap Join Table.",roomActive:"Shared table — same chat only",roomFull:"This table is full",host:"Host",status:"Waiting for players",readyCount:"Ready",rules:"Agree on table rules",rulesHelp:"Every seated player must approve the same proposal. Ready status does not start betting.",chips:"Starting chips",sb:"Small blind",bb:"Big blind",timer:"Action limit in seconds (0 = unlimited)",rebuy:"Allow chip rebuy between hands",propose:"Propose rules",pause:"Pause agreement",pauseHelp:"Unanimous pause/resume demonstration; no live game clock yet.",pauseRequest:"Request pause",resumeRequest:"Request resume",pending:"Pending approvals",approve:"Approve",approved:"Approved",paused:"Pause approved (demo)",notPaused:"Not paused",repropose:"Seats changed; propose again",chat:"Table chat",send:"Send",translation:"Chat here is a shared WebXDC prototype, not private dealing.",footer:"Recreational chips only. No money, no automatic private cards, no real PvP yet.",local:"Local preview — no network",shared:"WebXDC shared — not authenticated",two:"At least two seats are required",joinFirst:"Join this table first",invalid:"Check chips, blinds and time settings",confirmClose:"Close this shared table for everyone?",feedback:"Invite via Vector to this SAME chat; do not open a separate XDC in another DM."
},
ja:{
 title:"プライベートポーカー卓",language:"言語",warning:"共有ロビーの試作です。まだ実際のベットや非公開配札はありません。同じVectorチャット内で開いた参加者だけが卓を共有します。",players:"参加者",create:"卓を作成",maxSeats:"最大参加人数",join:"卓に参加",joined:"参加済み",leave:"退席",close:"卓を閉じる",ready:"準備完了",unready:"準備を解除",invite:"プレイヤーを招待",inviteHelp:"Vectorのグループ招待機能で、このチャットに相手を招待してください。別のDMやNoteでは同じ卓になりません。",inviteDraft:"招待文をメッセージに準備",inviteResult:"Vectorでメッセージ下書きを開きました。送信・入室の完了は確認できません。",inviteManual:"Vectorのグループ招待操作でこのチャットに友人を追加し、同じPoker Mini Appを開いてもらってください。",roomMissing:"卓がありません。卓を作れば、このチャットの参加者が参加できます。",roomActive:"同じチャットで共有する卓",roomFull:"卓は満員です",host:"ホスト",status:"参加者待機中",readyCount:"準備完了",rules:"卓のルールを合意",rulesHelp:"全着席者が同じ条件を承認します。準備完了にしてもベットは開始しません。",chips:"初期チップ",sb:"スモールブラインド",bb:"ビッグブラインド",timer:"行動制限（秒、0＝無制限）",rebuy:"ハンド間のチップ補充を許可",propose:"ルールを提案",pause:"ポーズ合意",pauseHelp:"全員承認のポーズ・再開の実演です。実際の手番タイマーはまだありません。",pauseRequest:"ポーズ申請",resumeRequest:"再開申請",pending:"承認待ち",approve:"承認",approved:"承認済み",paused:"ポーズ承認済み（試作）",notPaused:"ポーズなし",repropose:"参加者が変わりました。再提案してください",chat:"卓のチャット",send:"送信",translation:"ここは共有WebXDCの試作で、秘密の配札通信ではありません。",footer:"チップはゲーム専用。換金なし。実PvP・秘密の手札の自動配信は未実装です。",local:"端末内プレビュー（通信なし）",shared:"WebXDC共有（本人認証は未実装）",two:"2人以上必要です",joinFirst:"先に卓へ参加してください",invalid:"チップ・ブラインド・制限時間を確認してください",confirmClose:"全員の卓を閉じますか？",feedback:"同じVectorグループに招待してください。別のDMでXDCを開いても共有されません。"
}
};
const $=id=>document.getElementById(id),api=window.webxdc;
const live=Boolean(api&&typeof api.sendUpdate==="function"&&typeof api.setUpdateListener==="function");
const me=live&&api.selfAddr?api.selfAddr:"preview-"+Math.random().toString(36).slice(2);
const nick=live&&api.selfName?api.selfName:"You";
const events=new Map();
let lang="en",localSerial=0,feedback="";
const t=k=>strings[lang][k]||k;
const now=()=>Date.now();
const uid=()=>{
 if(globalThis.crypto?.randomUUID)return crypto.randomUUID().replaceAll("-","");
 const bytes=new Uint8Array(16);
 if(globalThis.crypto?.getRandomValues){crypto.getRandomValues(bytes);return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");}
 return now().toString(36)+Math.random().toString(36).slice(2);
};
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const validSeats=v=>Array.isArray(v)&&v.length>=2&&v.length<=6&&new Set(v).size===v.length&&v.every(id=>typeof id==="string"&&id.length>0&&id.length<=300);
function valid(e){
 if(validTableEvent(e))return true;
 if(!e||e.v!==1||e.app!=="poker"||!["rules","vote","pause","pause-vote","chat"].includes(e.kind))return false;
 if(typeof e.id!=="string"||e.id.length<6||e.id.length>100||
    typeof e.tableId!=="string"||e.tableId.length<6||e.tableId.length>100||
    typeof e.by!=="string"||e.by.length<1||e.by.length>300||
    !integer(e.at,0,Number.MAX_SAFE_INTEGER))return false;
 if(e.kind==="chat")return typeof e.text==="string"&&e.text.trim().length>0&&e.text.length<=500;
 if(e.kind==="rules"){
  const c=e.settings;
  return Boolean(c&&integer(c.chips,1,100000000)&&integer(c.sb,1,100000000)&&
    integer(c.bb,2,100000000)&&c.sb<c.bb&&c.bb<c.chips&&
    integer(c.timer,0,3600)&&typeof c.rebuy==="boolean"&&validSeats(e.seats));
 }
 if(e.kind==="pause")return ["pause","resume"].includes(e.action)&&validSeats(e.seats);
 return typeof e.target==="string"&&e.target.length>=6&&e.target.length<=100;
}
function ingest(e,serial){
 if(!valid(e)||events.has(e.id))return;
 events.set(e.id,{...e,_serial:Number.isSafeInteger(serial)&&serial>0?serial:++localSerial});
 draw();
}
function roomState(){
 return deriveSharedTable([...events.values()]
  .filter(e=>TABLE_EVENT_KINDS.includes(e.kind))
  .map(e=>({event:e,serial:e._serial})));
}
function ordered(kind,roomId){
 return [...events.values()]
  .filter(e=>(!kind||e.kind===kind)&&(!roomId||e.tableId===roomId))
  .sort((a,b)=>a._serial-b._serial||a.id.localeCompare(b.id));
}
function dispatch(kind,extra={}){
 const current=roomState().table;
 if(kind!=="table-create"&&!current)return;
 const e={v:TABLE_EVENT_KINDS.includes(kind)?2:1,app:"poker",kind,id:uid(),by:me,at:now(),
   tableId:kind==="table-create"?uid():current.id,...extra};
 if(!valid(e))return;
 if(live)api.sendUpdate({payload:e,info:kind==="table-create"?"Poker table created":kind==="seat-join"?"Player joined Poker":""},"");
 else ingest(e,++localSerial);
}
function seatsArray(){return [...roomState().seats.keys()].sort();}
const sameSeats=proposal=>JSON.stringify(proposal.seats.slice().sort())===JSON.stringify(seatsArray());
function latest(kind,id){return ordered(kind,id).at(-1);}
function votes(kind,target,id){
 return new Set(ordered(kind,id).filter(e=>e.target===target).map(e=>e.by));
}
function el(tag,text,cls){
 const node=document.createElement(tag);if(text!==undefined)node.textContent=text;
 if(cls)node.className=cls;return node;
}
function action(text,fn){
 const b=el("button",text,"secondary");b.type="button";b.addEventListener("click",fn);return b;
}
function draw(){
 const {table,seats,ready}=roomState(),member=seats.has(me);
 document.documentElement.lang=lang;
 document.querySelectorAll("[data-i18n]").forEach(n=>n.textContent=t(n.dataset.i18n));
 $("transport").textContent=t(live?"shared":"local");
 $("lobby-feedback").textContent=feedback;
 $("table-status").textContent=table?
   t("roomActive")+" · "+seats.size+"/"+table.maxPlayers+" · "+t("readyCount")+" "+ready.size+"/"+seats.size:
   t("roomMissing");
 $("table-create").hidden=Boolean(table);
 $("table-open").hidden=!table;
 $("max-players").disabled=Boolean(table);
 $("invite").disabled=!live||!table||!member||typeof api?.sendToChat!=="function";
 const list=$("seats");list.replaceChildren();
 for(const [id,name] of seats){
  let label=name+(id===table.host?" · "+t("host"):"")+(id===me?" ★":"")+
   (ready.has(id)?" ✓":"");
  list.append(el("span",label,"seat"));
 }
 $("join").disabled=!table||member||seats.size>=table.maxPlayers;
 $("join").textContent=t(member?"joined":table&&seats.size>=table.maxPlayers?"roomFull":"join");
 $("leave").hidden=!member;
 $("ready").hidden=!member;
 $("ready").textContent=t(ready.has(me)?"unready":"ready");
 $("close").hidden=!member||table?.host!==me;
 $("rules-form").querySelector("button").disabled=!member||seats.size<2;
 const rid=table?.id??"";
 const proposal=latest("rules",rid),area=$("proposal");area.replaceChildren();
 if(proposal&&table){
  const box=el("div",undefined,"status");
  box.append(el("div",t("chips")+": "+proposal.settings.chips+
   " | SB/BB "+proposal.settings.sb+"/"+proposal.settings.bb+
   " | "+t("timer")+": "+proposal.settings.timer+" | Rebuy: "+(proposal.settings.rebuy?"Yes":"No")));
  const agreed=votes("vote",proposal.id,rid),n=proposal.seats.filter(id=>agreed.has(id)).length;
  box.append(el("strong",n+"/"+proposal.seats.length+" "+t(n===proposal.seats.length?"approved":"pending")));
  if(!sameSeats(proposal))box.append(el("div",t("repropose")));
  else if(member&&!agreed.has(me))
   box.append(action(t("approve"),()=>dispatch("vote",{target:proposal.id})));
  area.append(box);
 }
 let paused=false,pending=null;
 for(const request of ordered("pause",rid)){
  if(!table||!sameSeats(request))continue;
  const n=request.seats.filter(id=>votes("pause-vote",request.id,rid).has(id)).length;
  if(n===request.seats.length){paused=request.action==="pause";pending=null;}
  else pending=request;
 }
 const pauseBox=el("div",undefined,"status");
 pauseBox.append(el("strong",t(paused?"paused":"notPaused")));
 if(pending&&table){
  const agree=votes("pause-vote",pending.id,rid);
  pauseBox.append(el("div",t("pending")+": "+pending.seats.filter(id=>agree.has(id)).length+"/"+pending.seats.length));
  if(member&&!agree.has(me))
   pauseBox.append(action(t("approve"),()=>dispatch("pause-vote",{target:pending.id})));
 }
 $("pause-status").replaceChildren(pauseBox);
 $("pause-request").disabled=!member||seats.size<2||Boolean(pending);
 $("pause-request").textContent=t(paused?"resumeRequest":"pauseRequest");
 $("pause-request").dataset.action=paused?"resume":"pause";
 const chat=$("messages");chat.replaceChildren();
 for(const msg of ordered("chat",rid).slice(-100)){
  const row=el("div",undefined,"message");row.append(el("small",seats.get(msg.by)||"Player"),el("div",msg.text));chat.append(row);
 }
 chat.scrollTop=chat.scrollHeight;
 $("chat-form").querySelector("button").disabled=!member;
}
$("locale").addEventListener("change",e=>{lang=e.target.value==="ja"?"ja":"en";draw();});
$("table-create").addEventListener("submit",e=>{
 e.preventDefault();if(roomState().table)return;
 const maxPlayers=Number($("max-players").value);
 if(integer(maxPlayers,2,6))dispatch("table-create",{name:nick,maxPlayers});
});
$("join").addEventListener("click",()=>{if(roomState().table)dispatch("seat-join",{name:nick});});
$("leave").addEventListener("click",()=>dispatch("seat-leave"));
$("ready").addEventListener("click",()=>dispatch("seat-ready",{ready:!roomState().ready.has(me)}));
$("close").addEventListener("click",()=>{
 if(roomState().table?.host===me&&confirm(t("confirmClose")))dispatch("table-close");
});
$("invite").addEventListener("click",()=>{
 if(!live||!api?.sendToChat){feedback=t("inviteManual");draw();return;}
 // sendToChat creates a USER-CONTROLLED draft; it never confirms delivery,
 // cannot join a remote user to a group, and may exit the app.
 feedback=t("inviteResult");draw();
 try{Promise.resolve(api.sendToChat({text:tableInvitationText(lang)}))
  .catch(()=>{feedback=t("inviteManual");draw();});}
 catch{feedback=t("inviteManual");draw();}
});
$("rules-form").addEventListener("submit",e=>{
 e.preventDefault();const room=roomState();
 if(!room.seats.has(me)||room.seats.size<2){alert(t("two"));return;}
 const settings={chips:Number($("chips").value),sb:Number($("sb").value),
   bb:Number($("bb").value),timer:Number($("timer").value),rebuy:$("rebuy").checked};
 if(!integer(settings.chips,1,100000000)||!integer(settings.sb,1,100000000)||
    !integer(settings.bb,2,100000000)||!integer(settings.timer,0,3600)||
    settings.sb>=settings.bb||settings.bb>=settings.chips){alert(t("invalid"));return;}
 dispatch("rules",{settings,seats:seatsArray()});
});
$("pause-request").addEventListener("click",()=>{
 const room=roomState();
 if(room.seats.size>=2&&room.seats.has(me))
  dispatch("pause",{seats:seatsArray(),action:$("pause-request").dataset.action});
});
$("chat-form").addEventListener("submit",e=>{
 e.preventDefault();if(!roomState().seats.has(me)){alert(t("joinFirst"));return;}
 const text=$("text").value.trim();
 if(text&&text.length<=500){dispatch("chat",{text});$("text").value="";}
});
if(live){
 // One listener per WebXDC app. Replay from serial 0 on every opening, so
 // reopening the XDC restores the public table without browser storage.
 api.setUpdateListener(update=>{
  if(update?.payload)ingest(update.payload,update.serial);
 },0);
}
draw();
