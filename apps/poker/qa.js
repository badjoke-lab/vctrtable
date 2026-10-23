// Single-device QA uses the real poker engine. Bot seats/chat are clearly simulated.
// Secret deck and hole cards stay local; never sent through WebXDC group updates.
import {legalActions,assertConservation} from "./engine.js";
import {createSession,startSessionHand,sessionAction,sessionRebuy,serializeSession,restoreSession} from "./session.js";
import {makeCard} from "./cards.js";
import {ChatViewModel,QUICK_REPLIES,cannedTranslation} from "./chat-view.js";
import {createPublicChatTransport} from "./public-chat.js";
import {bettingControls} from "./betting-controls.js";
import {settlementSummary} from "./showdown-summary.js";

const $=id=>document.getElementById(id);
const storageKey="vctrtable-poker-qa-v1",modeKey="vctrtable-poker-chat-mode-v1";
const readSave=()=>{try{return localStorage.getItem(storageKey);}catch{return null;}};
const readMode=()=>{try{return localStorage.getItem(modeKey)==="inline"?"inline":"drawer";}catch{return "drawer";}};
let locale="en",session=null,table=null,seconds=30,paused=false,deadline=0,remaining=0,lastTurnKey="",storageNotice="",chatterHand=0,chatId=0,toastTimer=null,chatFocused=false;
const demoChat=new ChatViewModel({mode:readMode()});
const vectorChat=new ChatViewModel({mode:readMode()});
let chat=demoChat;
const chatTransport=createPublicChatTransport({
 api:window.webxdc,
 receive(message){
  notifyChat(message.nickname,message.text,{
   target:vectorChat,
   id:"vector:"+String(message.sender??"unidentified")+":"+message.id,
   own:message.own,
   at:message.at,
   notify:Math.abs(Date.now()-message.at)<30_000
  });
 }
});
const strings={
 en:{title:"Poker",language:"Language",testLabel:"LOCAL QA · scripted opponents · not live PvP",back:"Create / Join Table",setup:"Start a session",setupHelp:"Play against scripted test seats. No other Vector users are required.",opponents:"Seats (2–6)",chips:"Starting chips",small:"Small blind",big:"Big blind",seconds:"Action time (0 = unlimited)",rebuy:"Allow rebuy between hands",start:"Start local session",board:"Community cards",hero:"Your cards",pause:"QA pause (simulated)",resume:"Resume QA",fold:"Fold",check:"Check",call:"Call",raiseTo:"Raise to",raise:"Raise",allin:"All-in",next:"Next hand",buy:"Rebuy busted seats",reset:"New session",history:"Hand history",footer:"Local game + sample chat only. Secure Vector PvP and real table chat are not yet active.",pot:"Pot",hand:"Hand",turn:"Your turn",wait:"Automated seat acting",done:"Hand complete",win:"You received",remaining:"Time remaining",unlimited:"No time limit",paused:"Paused (QA)",noChips:"Fewer than two seats have chips. Rebuy or start a new session.",invalid:"Invalid table settings.",toCall:"To call",balance:"Stack",folded:"Folded",button:"Dealer",saveTitle:"Local QA session / save",saveWarning:"Contains hidden cards and entire deck order without encryption. Do not share this saved test session.",save:"Save session",load:"Resume saved session",deleteSave:"Delete saved session",saved:"Saved on this device.",deleted:"Saved data deleted.",saveFailure:"Local storage is unavailable.",loadFailure:"Could not restore this saved game.",you:"You",chat:"Table chat",chatMode:"Chat view",drawer:"Drawer",inline:"Always on",closeChat:"Close",demo:"Demo chat",networkChat:"Share text via Vector group chat",networkWarning:"Opt-in. Everyone in this Vector chat can read text you send. This does not connect private cards or poker actions.",sharedChat:"Public Vector chat",networkUnavailable:"Public WebXDC chat is unavailable outside Vector.",networkSendFailed:"Could not send public chat message.",chatPlaceholder:"Message (local demo only)",send:"Send",translation:"Translate known demo phrases (no API)",min:"Min",half:"½ Pot",potPreset:"Pot",max:"Max",net:"Net",mainPot:"Main pot",allinCall:"(all-in)",wins:"wins",paidOut:"Paid out",showdown:"Showdown",received:"Received",betBy:"Bet",returnToGame:"Back to table",quickReplies:"Quick replies",chatSettings:"Chat options",chatHint:"Chat and play are separate on this screen"},
 ja:{title:"ポーカー",language:"言語",testLabel:"1人用テスト · 相手は自動操作 · 実際のPvPではありません",back:"卓作成・招待",setup:"セッション開始",setupHelp:"テスト用の自動席と対戦します。他のVectorユーザーは不要です。",opponents:"合計席数（2〜6）",chips:"初期チップ",small:"スモールブラインド",big:"ビッグブラインド",seconds:"行動時間（0=無制限）",rebuy:"ハンド間のチップ補充を許可",start:"端末内セッション開始",board:"共通カード",hero:"あなたのカード",pause:"QAポーズ（模擬）",resume:"QA再開",fold:"フォールド",check:"チェック",call:"コール",raiseTo:"レイズ後の合計",raise:"レイズ",allin:"オールイン",next:"次のハンド",buy:"チップ切れの席を補充",reset:"新規セッション",history:"ハンド履歴",footer:"ゲームと会話は端末内テストです。実際のVector PvPとテーブルチャットは未接続です。",pot:"ポット",hand:"ハンド",turn:"あなたの手番",wait:"自動席が操作中",done:"ハンド終了",win:"獲得チップ",remaining:"残り時間",unlimited:"時間制限なし",paused:"一時停止中（QA）",noChips:"チップを持つ席が2つ未満です。補充するか新規セッションを開始してください。",invalid:"テーブル設定が不正です。",toCall:"必要額",balance:"残高",folded:"降りた",button:"ディーラー",saveTitle:"端末内セッション保存",saveWarning:"全員の手札・山札が暗号化なしで含まれます。このテストデータを共有しないでください。",save:"セッションを保存",load:"保存した対戦を復元",deleteSave:"保存データを削除",saved:"端末内に保存しました。",deleted:"保存データを削除しました。",saveFailure:"端末内の保存領域を利用できません。",loadFailure:"保存データを復元できません。",you:"あなた",chat:"テーブルチャット",chatMode:"チャット表示",drawer:"ドロワー",inline:"常設",closeChat:"閉じる",demo:"模擬チャット",networkChat:"Vectorの公開チャットで文章を共有",networkWarning:"有効にするとこのVectorチャットの参加者全員が送信文を読めます。手札やゲーム操作は送信しません。",sharedChat:"Vector公開チャット",networkUnavailable:"Vectorの共有チャット機能を利用できません。",networkSendFailed:"公開チャットの送信に失敗しました。",chatPlaceholder:"メッセージ（この端末だけ）",send:"送信",translation:"定型文のみ翻訳（外部APIなし）",min:"最小",half:"半ポット",potPreset:"ポット",max:"最大",net:"収支",mainPot:"メインポット",allinCall:"（オールイン）",wins:"獲得",paidOut:"精算済み",showdown:"決着",received:"獲得",betBy:"投入",returnToGame:"テーブルに戻る",quickReplies:"定型文",chatSettings:"チャット設定",chatHint:"チャットを閉じて操作へ戻ります"}
};
const t=k=>strings[locale][k]||k;
const elem=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const fmt=n=>Number(n).toLocaleString(locale==="ja"?"ja-JP":"en-US");
function updateDockHeight(){
 if(!$("qa-table")||$("qa-table").hidden)return;
 const dock=$("qa-controls"),height=dock.hidden||chatStageActive()?0:dock.getBoundingClientRect().height;
 document.documentElement.style.setProperty("--dock-height",Math.ceil(height)+"px");
}
function chatStageActive(){return Boolean(table&&(chat.mode==="drawer"&&chat.opened||chatFocused));}
function syncChatStage(){
 const active=chatStageActive();
 $("qa-table").classList.toggle("chat-stage",active);
 document.querySelector(".qa-main").classList.toggle("qa-chatting",active);
 // The dock is never allowed to cover the chat input or keyboard.
 updateDockHeight();
}
function updateVisualViewport(){
 const viewport=window.visualViewport;
 // A mobile keyboard can pan OR resize the visual viewport. Fixed content
 // must follow BOTH coordinates, not assume layout viewport === visible area.
 const top=viewport?.offsetTop??0;
 const height=viewport?.height??window.innerHeight;
 document.documentElement.style.setProperty("--chat-vv-top",top+"px");
 document.documentElement.style.setProperty("--chat-vv-height",Math.max(180,height)+"px");
}
function handLog(h){
 const steps=h.events.map(e=>{
  if(e.kind==="blinds")return "SB "+h.players[e.sb].name+" "+e.paidSmall+", BB "+h.players[e.bb].name+" "+e.paidBig;
  if(e.kind==="street")return e.street.toUpperCase()+": "+e.board.join(" ");
  if(e.kind==="complete")return t("done")+" — "+h.players.map((p,i)=>p.name+": +"+e.awards[i]).join(", ");
  return h.players[e.seat].name+" "+e.action+(e.target!==null?" "+e.target:"");
 });
 $("qa-log").replaceChildren(...steps.slice(-50).reverse().map(s=>elem("li",s)));
}
function notifyChat(author,text,{target=demoChat,id="qa-chat-"+(++chatId),own=false,at=Date.now(),notify=true}={}){
 const newlyAdded=target.add({id,author,text,own,at,silent:!notify});
 if(!newlyAdded||target!==chat)return;
 if(!own&&!chat.visible()&&notify){
  const toast=$("qa-chat-toast");
  toast.textContent=author+": "+text.slice(0,65);
  toast.hidden=false;
  if(toastTimer!==null)clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{toast.hidden=true;toastTimer=null;},4700);
 }
 renderChat();
}
function renderChat(){
 const visible=chat.visible(),isDrawer=chat.mode==="drawer",panel=$("qa-chat"),bubble=$("qa-chat-bubble");
 syncChatStage();
 panel.className="qa-chat "+(isDrawer?"chat-drawer":"chat-inline")+(chat.opened?" open":"");
 bubble.hidden=!isDrawer||chat.opened;
 $("qa-unread").hidden=chat.unread===0;
 $("qa-unread").textContent=chat.unread>99?"99+":String(chat.unread);
 bubble.setAttribute("aria-label",t("chat")+(chat.unread?" ("+chat.unread+")":""));
 $("qa-chat-mode").value=chat.mode;
 $("qa-chat-translation").checked=chat.automaticTranslation;
 $("qa-chat-text").placeholder=t("chatPlaceholder");
 $("qa-chat-network").checked=chat===vectorChat;
 $("qa-chat-network").disabled=!chatTransport.available;
 $("qa-chat").querySelector(".chat-head small").textContent=t(chat===vectorChat?"sharedChat":"demo");
 const holder=$("qa-chat-messages"),wasBottom=holder.scrollHeight-holder.scrollTop-holder.clientHeight<45;
 holder.replaceChildren();
 for(const msg of chat.displayed(locale).slice(-80)){
  const line=elem("div",undefined,"chat-line"+(msg.own?" own":""));
  line.append(elem("b",msg.author),elem("span",locale==="ja"&&msg.id.startsWith("qa-demo-")?(cannedTranslation(msg.text,"ja")??msg.text):msg.text));
  if(msg.translated&&msg.translated.toLowerCase()!==msg.text.toLowerCase())line.append(elem("span",msg.translated,"chat-translated"));
  holder.append(line);
 }
 if(wasBottom)holder.scrollTop=holder.scrollHeight;
 const quick=$("qa-quick-replies");quick.replaceChildren();
 for(const phrase of QUICK_REPLIES){
  const value=locale==="ja"?(cannedTranslation(phrase,"ja")??phrase):phrase;
  const btn=elem("button",value);btn.type="button";btn.addEventListener("click",()=>sendChat(value));quick.append(btn);
 }
 $("qa-chat-close").hidden=!chatStageActive();
}
async function sendChat(message){
 const value=message.trim();
 if(!table||!value||value.length>500)return;
 if(chat===vectorChat){
  if(!chatTransport.available)return;
  try{
   await chatTransport.send(value);
   $("qa-chat-text").value="";
  }catch(error){window.alert(t("networkSendFailed"));return;}
 }else{
  chat.add({id:"local-"+(++chatId),author:t("you"),text:value,own:true});
  $("qa-chat-text").value="";
 }
 renderChat();
}
function setChatMode(mode){
 chatFocused=false;
 document.querySelector(".qa-main").classList.remove("qa-inline-reading");
 demoChat.setMode(mode);
 vectorChat.setMode(mode);
 try{localStorage.setItem(modeKey,mode);}catch{/* Memory-only fallback. */}
 $("qa-chat-toast").hidden=true;
 renderChat();updateDockHeight();
 requestAnimationFrame(updateInlineReading);
}
function setChatSource(useVector){
 if(useVector&&!chatTransport.available){
  $("qa-chat-network").checked=false;
  window.alert(t("networkUnavailable"));return;
 }
 chat=useVector?vectorChat:demoChat;
 // A user who enters the visible panel has read its messages.
 if(chat.visible())chat.unread=0;
 $("qa-chat-toast").hidden=true;
 renderChat();
}
function render(){
 document.documentElement.lang=locale;
 document.querySelectorAll("[data-l10n]").forEach(x=>x.textContent=t(x.dataset.l10n));
 $("qa-chat-text").placeholder=t("chatPlaceholder");
 const existing=Boolean(readSave());
 $("qa-save").disabled=!session;
 $("qa-load").disabled=!existing;
 $("qa-load-start").disabled=!existing;
 $("qa-delete").disabled=!existing;
 $("qa-storage-notice").textContent=storageNotice;
 renderChat();
 if(!table)return;
 const h=table.hand,L=legalActions(table),pot=h.players.reduce((sum,p)=>sum+p.total,0),end=h.status==="complete";
 // During live play keep chat immediately after the felt/info, as expected
 // by the viewport observer. At showdown move it BELOW the compact payout
 // actions; don't let an always-on chat push the primary result off-screen.
 // Only move on phase change so IntersectionObserver does not oscillate.
 const chatPanel=$("qa-chat");
 if(end){
  if(chatPanel.previousElementSibling!==$("qa-end"))$("qa-end").after(chatPanel);
 }else if(chatPanel.nextElementSibling!==$("qa-controls")){
  $("qa-controls").before(chatPanel);
 }
 const bets=bettingControls(L,{pot,currentBet:h.currentBet});
 $("qa-round").textContent=t("hand")+" "+h.number+" · "+(end?t("showdown"):h.streetName.toUpperCase());
 $("qa-street-label").textContent=end?t("showdown"):h.streetName.toUpperCase();
 $("qa-pot").textContent=t(end?"paidOut":"pot")+" "+fmt(pot);
 const names=["pos-top-left","pos-top","pos-top-right","pos-mid-left","pos-mid-right"];
 const layouts={
  1:["pos-top"],2:["pos-top-left","pos-top-right"],3:["pos-top-left","pos-top","pos-top-right"],
  4:["pos-top-left","pos-top-right","pos-mid-left","pos-mid-right"],5:names
 };
 const slots=layouts[h.players.length-1]||names;
 const seats=$("qa-players");seats.replaceChildren();
 h.players.slice(1).forEach((p,i)=>{
  const id=i+1;
  const seat=elem("div",undefined,"poker-seat "+slots[i]+(h.turn===id?" active":"")+(p.folded?" folded":"")+(p.stack===0&&p.inHand?" all-in":""));
  seat.append(elem("b",p.name,"poker-seat-name"),elem("span",fmt(p.stack),"poker-seat-stack"));
  const tags=elem("div",undefined,"poker-seat-tags");
  for(const [index,label,cls] of [[h.button,"D","d"],[h.sbSeat,"SB",""],[h.bbSeat,"BB","bb"]])
   if(index===id)tags.append(elem("span",label,"poker-seat-badge "+cls));
  seat.append(tags);
  const cards=elem("div",undefined,"poker-seat-cards");
  if(p.inHand){
   const revealed=end&&!p.folded&&h.board.length===5;
   for(const c of p.hole)cards.append(makeCard(c,{hidden:!revealed,small:true}));
  }
  seat.append(cards);
  if(p.total>0||end&&h.awards[id]>0){
   const payment=end&&h.awards[id]>0?t("received")+" +"+fmt(h.awards[id]):end?t("betBy")+" "+fmt(p.total):fmt(p.total)+(p.folded?" · "+t("folded"):h.turn===id?" · "+t("turn"):"");
   seat.append(elem("span",payment,"poker-seat-bet"+(end&&h.awards[id]>0?" payout":"")));
  }
  seats.append(seat);
 });
 $("qa-board-cards").replaceChildren(...Array.from({length:5},(_,i)=>makeCard(h.board[i],{empty:!h.board[i]})));
 $("qa-hero-cards").replaceChildren(...h.players[0].hole.map(c=>makeCard(c)));
 // Independent compact strip for drawer / keyboard entry; never hidden
 // under the chat panel, and never relies on the full felt being visible.
 $("qa-hud-cards").replaceChildren(...h.players[0].hole.map(c=>makeCard(c,{small:true})));
 $("qa-hud-stack").textContent=fmt(h.players[0].stack);
 $("qa-hud-turn").textContent=end?t("showdown"):h.turn===0?t("turn"):t("wait");
 $("qa-my-stack").textContent=fmt(h.players[0].stack);
 $("qa-end").hidden=!end;
 $("qa-controls").hidden=end;
 document.querySelector(".qa-main").classList.toggle("qa-playing",!end);
 $("qa-info").textContent=end?t("done")+" — "+t("win")+" "+fmt(h.awards[0])+" · "+t("net")+" "+(h.awards[0]-h.players[0].total>=0?"+":"")+fmt(h.awards[0]-h.players[0].total):paused?t("paused"):h.turn===0?t("turn")+" · "+t("toCall")+" "+fmt(L?.toCall??0):t("wait");
 const canAct=Boolean(L&&L.seat===0&&!paused);
 $("qa-fold").disabled=!canAct;
 $("qa-check").disabled=!canAct||!L?.canCheck;
 $("qa-call").disabled=!canAct||!L?.canCall;
 $("qa-call").textContent=t("call")+(L?.toCall?" "+fmt(bets.callAmount)+(bets.isAllInCall?" "+t("allinCall"):""):"");
 $("qa-raise").disabled=!canAct||!L?.canRaise;
 $("qa-allin").disabled=!canAct||!bets.allIn;
 const amount=$("qa-raise-amount");amount.disabled=!canAct||!L?.canRaise;
 for(const id of ["qa-min","qa-half","qa-pot-preset","qa-max"])$(id).disabled=!canAct||!L?.canRaise;
 if(L&&L.seat===0){
  const min=Math.min(L.minRaiseTo,L.maxRaiseTo);
  amount.min=String(min);amount.max=String(L.maxRaiseTo);
  if(document.activeElement!==amount||Number(amount.value)>L.maxRaiseTo||Number(amount.value)<min)amount.value=String(min);
 }
 $("qa-timer").hidden=end;
 $("qa-timer").textContent=end?"":paused?t("paused"):seconds===0?"∞":Math.ceil(remaining)+"s";
 $("qa-hud-timer").textContent=end?"—":$("qa-timer").textContent;
 $("qa-pause").textContent=t(paused?"resume":"pause");
 $("qa-next").disabled=table.players.filter(p=>p.stack>0).length<2;
 $("qa-buy").disabled=!table.settings.rebuy||!table.players.some(p=>p.stack===0);
 if(end){
  const summary=settlementSummary(table,{locale,heroId:h.players[0].id});
  $("qa-result").textContent=t("win")+" "+fmt(summary.hero.awarded)+" · "+t("net")+" "+(summary.hero.net>=0?"+":"")+fmt(summary.hero.net);
  const entries=[];
  for(const p of summary.pots){
   const line=elem("div",undefined,"qa-settlement-pot");
   line.append(elem("b",p.label+" · "+fmt(p.amount)));
   const payout=p.payout.map(w=>w.name+" "+t("wins")+" "+fmt(w.amount)).join(" · ");
   line.append(elem("span",payout));entries.push(line);
  }
  if(h.board.length===5){
   const ranks=elem("div",undefined,"qa-settlement-ranks");
   for(const p of summary.seats)if(p.handName)
     ranks.append(elem("span",p.name+": "+p.handName));
   entries.push(ranks);
  }
  $("qa-settlement").replaceChildren(...entries);
 }else{
  $("qa-result").textContent="";
  $("qa-settlement").replaceChildren();
 }
 handLog(h);
 updateDockHeight();
}
function resetClock(){
 const h=table?.hand,L=table?legalActions(table):null;
 if(!h||!L||L.seat!==0||paused)return;
 const key=h.number+"/"+h.events.length+"/"+h.turn;
 if(lastTurnKey!==key){lastTurnKey=key;remaining=seconds;deadline=Date.now()+seconds*1000;}
}
function drive(){
 if(!table||paused)return;
 let guard=0;
 while(table.hand.status==="betting"&&table.hand.turn!==0){
  if(++guard>90)throw new Error("Scripted seat progression stopped");
  const l=legalActions(table);if(!l)break;
  const opponent=table.hand.players[l.seat];
  if(l.canRaise&&Math.random()<.09&&l.maxRaiseTo>=l.minRaiseTo)
   sessionAction(session,opponent.id,"raise",Math.min(l.maxRaiseTo,l.minRaiseTo));
  else sessionAction(session,opponent.id,l.toCall?"call":"check");
  assertConservation(table);
 }
 if(table.hand.status==="complete"&&chatterHand!==table.hand.number){
  chatterHand=table.hand.number;
  if(table.hand.number<=3){
   const lines=["nice hand!","gg","ty!"];
   notifyChat("Seat "+(2+(table.hand.number-1)%Math.max(1,table.players.length-1)),lines[table.hand.number-1],{id:"qa-demo-end-"+table.hand.number});
  }
 }
 resetClock();render();
}
function move(kind,target){
 if(!table||paused)return;
 const l=legalActions(table);if(!l||l.seat!==0)return;
 try{sessionAction(session,l.playerId,kind,target);assertConservation(table);lastTurnKey="";drive();}
 catch(e){window.alert(e.message);render();}
}
function preset(which){
 const l=table?legalActions(table):null;if(!l||l.seat!==0||!l.canRaise)return;
 const h=table.hand,pot=h.players.reduce((sum,p)=>sum+p.total,0);
 const bets=bettingControls(l,{pot,currentBet:h.currentBet});
 if(!bets.presets||!(which in bets.presets))return;
 $("qa-raise-amount").value=String(bets.presets[which]);
}
function restore(){
 try{
  const raw=JSON.parse(readSave()||"null");
  if(!raw||raw.qaVersion!==1||!Number.isSafeInteger(raw.seconds)||raw.seconds<0||raw.seconds>3600)throw Error("Invalid save metadata");
  const saved=restoreSession(raw.journal);
  session=saved;table=saved.table;seconds=raw.seconds;paused=false;remaining=seconds;lastTurnKey="";storageNotice="";
  $("qa-setup").hidden=true;$("qa-table").hidden=false;
  chatFocused=false;drive();render();
 }catch(error){storageNotice=t("loadFailure")+" "+String(error.message||"");render();}
}
function newGame(){
 table=null;session=null;paused=false;chatterHand=0;lastTurnKey="";
 document.querySelector(".qa-main").classList.remove("qa-playing");
 $("qa-setup").hidden=false;$("qa-table").hidden=true;
 demoChat.messages.length=0;demoChat.unread=0;demoChat.opened=false;chatFocused=false;render();
}
$("qa-language").addEventListener("change",e=>{locale=e.target.value==="ja"?"ja":"en";render();});
// A fixed betting dock may not obscure the inline composer. Decide from
// the CURRENT visual viewport on scroll, not from an asynchronous observer:
// moving chat at showdown/return can invalidate old intersection snapshots.
function updateInlineReading(){
 const visible=Boolean(table&&chat.mode==="inline"&&!chatStageActive());
 const form=$("qa-chat-form"),rect=form.getBoundingClientRect();
 const top=window.visualViewport?.offsetTop??0;
 const bottom=top+(window.visualViewport?.height??window.innerHeight);
 const near=visible&&rect.width>0&&rect.height>0&&
   rect.top<bottom-2&&rect.bottom>top+2;
 document.querySelector(".qa-main").classList.toggle("qa-inline-reading",near);
}
window.addEventListener("scroll",updateInlineReading,{passive:true});
window.addEventListener("resize",updateInlineReading);
window.visualViewport?.addEventListener("scroll",updateInlineReading);
window.visualViewport?.addEventListener("resize",updateInlineReading);
$("qa-chat-form").addEventListener("pointerdown",updateInlineReading);
$("qa-chat-mode").addEventListener("change",e=>setChatMode(e.target.value));
$("qa-chat-network").addEventListener("change",e=>setChatSource(e.target.checked));
$(`qa-chat-bubble`).addEventListener("click",()=>{chatFocused=false;chat.setOpen(true);$("qa-chat-toast").hidden=true;renderChat();});
$("qa-chat-close").addEventListener("click",()=>{
 chatFocused=false;chat.setOpen(false);
 $("qa-chat-text").blur();
 renderChat();
});
$("qa-chat-text").addEventListener("focus",()=>{
 if(!table)return;
 chatFocused=true;
 if(chat.mode==="drawer")chat.setOpen(true);
 renderChat();
 // Keep the composer visible even after the OS keyboard has resized the
 // viewport; do not scroll the underlying felt or betting controls.
 requestAnimationFrame(()=>{$("qa-chat-text").scrollIntoView({block:"nearest"});});
});
window.addEventListener("resize",updateVisualViewport);
window.visualViewport?.addEventListener("resize",updateVisualViewport);
window.visualViewport?.addEventListener("scroll",updateVisualViewport);
updateVisualViewport();
$("qa-chat-translation").addEventListener("change",e=>{chat.setTranslation(e.target.checked);renderChat();});
$("qa-chat-form").addEventListener("submit",e=>{e.preventDefault();sendChat($("qa-chat-text").value);});
$("qa-form").addEventListener("submit",e=>{
 e.preventDefault();
 const n=Number($("qa-seats").value),chips=Number($("qa-chips").value),sb=Number($("qa-small").value),bb=Number($("qa-big").value);
 seconds=Number($("qa-seconds").value);
 try{
  if(!Number.isSafeInteger(n)||n<2||n>6||!Number.isSafeInteger(seconds)||seconds<0||seconds>3600)throw Error(t("invalid"));
  session=createSession({players:Array.from({length:n},(_,i)=>({id:"p"+i,name:i===0?t("you"):"Seat "+(i+1)})),startingChips:chips,smallBlind:sb,bigBlind:bb,rebuy:$("qa-rebuy").checked});
  table=session.table;startSessionHand(session);assertConservation(table);
  paused=false;chatterHand=0;lastTurnKey="";storageNotice="";
  demoChat.messages.length=0;demoChat.unread=0;demoChat.opened=false;chatFocused=false;
  $("qa-setup").hidden=true;$("qa-table").hidden=false;
  notifyChat("Seat 2","gl hf",{id:"qa-demo-start"});
  drive();render();
 }catch(error){window.alert(error.message||t("invalid"));}
});
$("qa-fold").addEventListener("click",()=>move("fold"));
$("qa-check").addEventListener("click",()=>move("check"));
$("qa-call").addEventListener("click",()=>move("call"));
$("qa-raise").addEventListener("click",()=>move("raise",Number($("qa-raise-amount").value)));
$("qa-allin").addEventListener("click",()=>{const L=table?legalActions(table):null;if(!L)return;const bet=bettingControls(L,{pot:table.hand.players.reduce((sum,p)=>sum+p.total,0),currentBet:table.hand.currentBet});if(bet.allIn)move(bet.allIn.kind,bet.allIn.target);});
for(const [id,kind] of [["qa-min","min"],["qa-half","half"],["qa-pot-preset","pot"],["qa-max","max"]])$(id).addEventListener("click",()=>preset(kind));
$("qa-next").addEventListener("click",()=>{
 if(!table)return;try{startSessionHand(session);lastTurnKey="";drive();}
 catch(e){window.alert(e.message);}
});
$("qa-buy").addEventListener("click",()=>{
 if(!table)return;try{for(const p of table.players)if(p.stack===0)sessionRebuy(session,p.id);assertConservation(table);render();}
 catch(e){window.alert(e.message);}
});
$("qa-reset").addEventListener("click",newGame);
$("qa-pause").addEventListener("click",()=>{
 if(!table||table.hand.status==="complete")return;
 paused=!paused;if(paused)remaining=seconds===0?0:Math.max(0,(deadline-Date.now())/1000);
 else if(seconds!==0)deadline=Date.now()+remaining*1000;
 render();
});
$("qa-save").addEventListener("click",()=>{
 if(!session)return;
 try{localStorage.setItem(storageKey,JSON.stringify({qaVersion:1,seconds,journal:serializeSession(session)}));storageNotice=t("saved");}
 catch(e){storageNotice=t("saveFailure")+" "+String(e.message||"");}render();
});
$("qa-load").addEventListener("click",restore);
$("qa-load-start").addEventListener("click",restore);
$("qa-delete").addEventListener("click",()=>{
 try{localStorage.removeItem(storageKey);storageNotice=t("deleted");}
 catch(e){storageNotice=t("saveFailure")+" "+String(e.message||"");}render();
});
if(typeof ResizeObserver!=="undefined")new ResizeObserver(updateDockHeight).observe($("qa-controls"));
setInterval(()=>{
 if(!table||paused||table.hand.status!=="betting")return;
 const l=legalActions(table);if(!l||l.seat!==0)return;
 resetClock();
 if(seconds>0){
  remaining=Math.max(0,(deadline-Date.now())/1000);
  if(remaining<=0){move(l.toCall?"fold":"check");return;}
 }
 $("qa-timer").textContent=seconds===0?"∞":Math.ceil(remaining)+"s";
 $("qa-hud-timer").textContent=$("qa-timer").textContent;
},250);
render();
if(chatTransport.available)chatTransport.subscribe();
