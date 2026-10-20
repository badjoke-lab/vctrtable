/* Lobby-only WebXDC updates: never broadcast card secrets or monetary data. */
(() => {
"use strict";
const words={
en:{title:"Poker table",language:"Language",warning:"Lobby prototype only — no dealing, betting or authenticated PvP. No real-money play.",players:"Players",join:"Join table",joined:"Joined",rules:"Agree on table rules",rulesHelp:"Each seated player must approve the same proposal.",chips:"Starting chips",sb:"Small blind",bb:"Big blind",timer:"Action limit in seconds (0 = unlimited)",rebuy:"Allow chip rebuy between hands",propose:"Propose rules",pause:"Pause agreement",pauseHelp:"Pause/resume requires unanimous approval. No gameplay timer exists in this prototype.",pauseRequest:"Request pause",resumeRequest:"Request resume",pending:"Pending approvals",approve:"Approve",approved:"Approved",paused:"Pause approved (demo)",notPaused:"Not paused",repropose:"Seats changed; propose again",chat:"Table chat",send:"Send",translation:"Original messages only; translation will be added after privacy review.",footer:"No real-money wagering. Poker hands are not active yet.",local:"Local preview",shared:"WebXDC shared",two:"At least two seats are required",joinFirst:"Join this table first",invalid:"Check chips, blinds and time settings"},
ja:{title:"ポーカーテーブル",language:"言語",warning:"現在はロビーの試作です。配札・ベット・本人確認は未実装です。現金でのプレイはありません。",players:"プレイヤー",join:"テーブルに参加",joined:"参加済み",rules:"テーブルルールを合意",rulesHelp:"着席した全員が同じ提案を承認します。",chips:"初期チップ",sb:"スモールブラインド",bb:"ビッグブラインド",timer:"行動制限（秒、0=無制限）",rebuy:"ハンド間のチップ補充を許可",propose:"ルールを提案",pause:"ポーズの合意",pauseHelp:"ポーズ・再開には全員の承認が必要です。手番タイマーは未実装です。",pauseRequest:"ポーズを申請",resumeRequest:"再開を申請",pending:"承認待ち",approve:"承認",approved:"承認済み",paused:"ポーズ承認済み（試作）",notPaused:"ポーズなし",repropose:"参加者が変わりました。再提案してください",chat:"テーブルチャット",send:"送信",translation:"現在は原文表示のみ。翻訳はプライバシー検討後に追加します。",footer:"現金での賭博なし。ポーカー対戦はまだ有効ではありません。",local:"端末内プレビュー",shared:"WebXDCで共有",two:"2人以上必要です",joinFirst:"先に参加してください",invalid:"チップ・ブラインド・時間を確認してください"}
};
const api=window.webxdc;
const live=Boolean(api&&typeof api.sendUpdate==="function"&&typeof api.setUpdateListener==="function");
const me=live&&api.selfAddr?api.selfAddr:"preview-"+Math.random().toString(36).slice(2);
const nick=live&&api.selfName?api.selfName:"You";
let language="en";
const logs=new Map();
const node=id=>document.getElementById(id);
const say=key=>words[language][key]||key;
const guid=()=>String(Date.now())+"-"+Math.random().toString(36).slice(2);
const int=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
function valid(e){
 if(!e||e.v!==1||e.app!=="poker"||!["join","rules","vote","pause","pause-vote","chat"].includes(e.kind))return false;
 if(typeof e.id!=="string"||e.id.length>90||typeof e.by!=="string"||e.by.length>300||!int(e.at,0,Number.MAX_SAFE_INTEGER))return false;
 if(e.kind==="join")return typeof e.name==="string"&&e.name.length<=60;
 if(e.kind==="chat")return typeof e.text==="string"&&e.text.length>0&&e.text.length<=500;
 if(e.kind==="rules"){
  const c=e.settings;
  return c&&int(c.chips,1,100000000)&&int(c.sb,1,100000000)&&int(c.bb,2,100000000)&&c.sb<c.bb&&c.bb<c.chips&&int(c.timer,0,3600)&&typeof c.rebuy==="boolean"&&validSeats(e.seats);
 }
 if(e.kind==="pause")return ["pause","resume"].includes(e.action)&&validSeats(e.seats);
 return typeof e.target==="string"&&e.target.length<=90;
}
function validSeats(v){return Array.isArray(v)&&v.length>=2&&v.length<=6&&new Set(v).size===v.length&&v.every(x=>typeof x==="string"&&x.length<=300);}
function ordered(kind){return [...logs.values()].filter(e=>!kind||e.kind===kind).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));}
function ingest(e){if(!valid(e)||logs.has(e.id))return;logs.set(e.id,e);draw();}
function send(kind,extra={}){
 const e={v:1,app:"poker",kind,id:guid(),at:Date.now(),by:me,...extra};
 if(!valid(e))return;
 if(live)api.sendUpdate({payload:e},"");
 else ingest(e);
}
function people(){
 const result=new Map();
 for(const e of ordered("join"))if(!result.has(e.by)&&result.size<6)result.set(e.by,e.name.trim()||"Player");
 return result;
}
function seats(){return [...people().keys()].sort();}
function seatMatch(s){return JSON.stringify(s.slice().sort())===JSON.stringify(seats());}
function last(kind){return ordered(kind).at(-1);}
function votes(kind,id){return new Set(ordered(kind).filter(e=>e.target===id).map(e=>e.by));}
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function click(text,cb){const b=element("button",text,"secondary");b.type="button";b.addEventListener("click",cb);return b;}
function draw(){
 document.documentElement.lang=language;
 document.querySelectorAll("[data-i18n]").forEach(e=>e.textContent=say(e.dataset.i18n));
 node("transport").textContent=say(live?"shared":"local");
 const roster=people(),list=node("seats");list.replaceChildren();
 for(const [id,n] of roster)list.append(element("span",n+(id===me?" ★":""),"seat"));
 const joined=roster.has(me);
 node("join").disabled=joined||roster.size>=6;node("join").textContent=say(joined?"joined":"join");
 node("rules-form").querySelector("button").disabled=!joined||roster.size<2;
 const area=node("proposal");area.replaceChildren();
 const p=last("rules");
 if(p){
  const div=element("div",undefined,"status");
  div.append(element("div",say("chips")+": "+p.settings.chips+" | SB/BB "+p.settings.sb+"/"+p.settings.bb+" | "+say("timer")+": "+p.settings.timer+" | Rebuy: "+(p.settings.rebuy?"Yes":"No")));
  const agree=votes("vote",p.id);
  const accepted=p.seats.filter(id=>agree.has(id)).length;
  div.append(element("strong",accepted+"/"+p.seats.length+" "+say(accepted===p.seats.length?"approved":"pending")));
  if(!seatMatch(p.seats))div.append(element("div",say("repropose")));
  else if(joined&&!agree.has(me))div.append(click(say("approve"),()=>send("vote",{target:p.id})));
  area.append(div);
 }
 const status=node("pause-status");status.replaceChildren();
 let paused=false,request=null;
 for(const r of ordered("pause").filter(e=>seatMatch(e.seats))){
  const count=r.seats.filter(id=>votes("pause-vote",r.id).has(id)).length;
  if(count===r.seats.length){paused=r.action==="pause";request=null;}else request=r;
 }
 const box=element("div",undefined,"status");
 box.append(element("strong",say(paused?"paused":"notPaused")));
 if(request){
  const approvals=votes("pause-vote",request.id);
  box.append(element("div",say("pending")+": "+request.seats.filter(id=>approvals.has(id)).length+"/"+request.seats.length));
  if(joined&&!approvals.has(me))box.append(click(say("approve"),()=>send("pause-vote",{target:request.id})));
 }
 status.append(box);
 const pb=node("pause-request");pb.disabled=!joined||roster.size<2||Boolean(request);pb.textContent=say(paused?"resumeRequest":"pauseRequest");pb.dataset.action=paused?"resume":"pause";
 const messages=node("messages");messages.replaceChildren();
 for(const msg of ordered("chat").slice(-100)){const row=element("div",undefined,"message");row.append(element("small",roster.get(msg.by)||"Player"));row.append(element("div",msg.text));messages.append(row);}
 messages.scrollTop=messages.scrollHeight;
 node("chat-form").querySelector("button").disabled=!joined;
}
node("locale").addEventListener("change",e=>{language=e.target.value==="ja"?"ja":"en";draw();});
node("join").addEventListener("click",()=>send("join",{name:nick}));
node("rules-form").addEventListener("submit",e=>{
 e.preventDefault();if(!people().has(me)||seats().length<2){alert(say("two"));return;}
 const settings={chips:Number(node("chips").value),sb:Number(node("sb").value),bb:Number(node("bb").value),timer:Number(node("timer").value),rebuy:node("rebuy").checked};
 if(!int(settings.chips,1,100000000)||!int(settings.sb,1,100000000)||!int(settings.bb,2,100000000)||!int(settings.timer,0,3600)||settings.sb>=settings.bb||settings.bb>=settings.chips){alert(say("invalid"));return;}
 send("rules",{settings,seats:seats()});
});
node("pause-request").addEventListener("click",()=>{if(seats().length>=2&&people().has(me))send("pause",{seats:seats(),action:node("pause-request").dataset.action});});
node("chat-form").addEventListener("submit",e=>{e.preventDefault();if(!people().has(me)){alert(say("joinFirst"));return;}const input=node("text"),text=input.value.trim();if(text&&text.length<=500){send("chat",{text});input.value="";}});
if(live)api.setUpdateListener(update=>{if(update&&update.payload)ingest(update.payload);},0);
draw();
})();
