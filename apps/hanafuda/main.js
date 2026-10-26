import {capturePreview,matchingFieldCards,yakuProgress} from "../../packages/hanafuda/guide.js";
import {cardById,startRound,playCard,chooseTarget,drawNextCard,decide,scoreCards} from "../../packages/hanafuda/koikoi.js";
// Entire game, including hidden opponent cards, is intentionally local QA only.
// Nothing here calls webxdc.sendUpdate or uses a real Vector multiplayer channel.
const $ = id => document.getElementById(id);
const M={
 en:{
  title:"Hanafuda · Koi-Koi",languageLabel:"Language",
  qaWarning:"LOCAL QA · scripted opponent · NOT Vector PvP · traditional SVG card artwork",
  setupTitle:"New match",setupDescription:"Play 2-player Koi-Koi against a simple local test opponent. Nobody else can join this QA game.",
  roundsLabel:"Rounds",start:"Start",oppLabel:"Opponent",youLabel:"You",
  oppHandLabel:"Opponent's hand",oppTakenLabel:"Opponent's captured cards",
  yourTakenLabel:"Your captured cards",yourHandLabel:"Your hand",fieldLabel:"Field",
  deckLabel:"Draw pile",decisionTitle:"You made a yaku!",
  stop:"Stop & score",koi:"Koi-Koi — continue",resultTitle:"Round complete",
  next:"Next round",new:"New match",
  footer:"All gameplay stays on this device. The WebXDC shared-update API is not used for secret cards or turns.",
  round:"Round",dealer:"Dealer",hand:"cards",chooseCard:"Select a card from your hand.",
  chooseTarget:"Select one matching field card.",opponentTurn:"Opponent is playing.",
  decision:"A yaku is ready. Score now, or declare Koi-Koi.",
  roundOver:"Round over.",matchOver:"Match over.",
  youWin:"You win",theyWin:"Opponent wins",draw:"No score",points:"points",
  bright:"Bright",animal:"Seed",ribbon:"Ribbon",plain:"Plain",
  match:"Matching month",score:"Score",empty:"None",koiUsed:"Koi-Koi declared",
  selectionTitle:"Selected card",confirm:"Play this card",cancel:"Cancel / choose another",
  guideTitle:"Build scoring sets (Yaku)",guideIntro:"Match cards by month and collect combinations.",
  guideToggle:"Show all sets",guideClose:"Hide guide",
  guideHelp:"Play one hand card; the deck then draws automatically. Matched pairs go to your captured cards, not your hand.",
  noMatch:"No same-month card: this card stays on the field.",
  oneMatch:"One matching field card: capture both.",
  twoMatch:"Two matching field cards: tap ONE highlighted target before confirming.",
  threeMatch:"Three matching field cards: capture all four cards.",
  chosen:"Chosen target",pendingDraw:"The deck revealed a card. Choose a matching target; this draw cannot be cancelled.",
  working:"Cards moving…",gain:"Capture increases score",noGain:"No new points immediately; keep collecting toward a set.",
  artistNote:"Hanafuda SVG card artwork: Louie Mantia / すけじょ, CC BY-SA 4.0."
 },
 ja:{
  title:"花札・こいこい",languageLabel:"言語",
  qaWarning:"ローカルQA版・相手はテスト用自動操作・Vector対人戦ではありません・花札48枚の絵柄",
  setupTitle:"新しい対局",setupDescription:"1端末で2人用「こいこい」を試す画面です。相手は簡単なテスト用プログラムで、他のVector利用者とは接続しません。",
  roundsLabel:"対局数",start:"対局開始",oppLabel:"相手",youLabel:"あなた",
  oppHandLabel:"相手の手札",oppTakenLabel:"相手の取り札",
  yourTakenLabel:"あなたの取り札",yourHandLabel:"あなたの手札",fieldLabel:"場札",
  deckLabel:"山札",decisionTitle:"役ができました",
  stop:"勝負してあがる",koi:"こいこい（続行）",resultTitle:"局終了",
  next:"次の局",new:"新しい対局",
  footer:"このQA対局は端末内で完結します。秘密の手札や山札をWebXDCの共有更新で送ることはありません。",
  round:"第",dealer:"親",hand:"枚",chooseCard:"手札から1枚選択してください。",
  chooseTarget:"同じ月の場札から、取る1枚を選んでください。",opponentTurn:"相手の手番です。",
  decision:"役が成立しました。勝負するか、こいこいで続けるか選んでください。",
  roundOver:"この局は終了しました。",matchOver:"対局終了。",
  youWin:"あなたの勝ち",theyWin:"相手の勝ち",draw:"流局",points:"点",
  bright:"光",animal:"タネ",ribbon:"短冊",plain:"カス",
  match:"同じ月の札",score:"得点",empty:"なし",koiUsed:"こいこい宣言中",
  selectionTitle:"選択中の札",confirm:"この札を出す",cancel:"キャンセル・選び直す",
  guideTitle:"役の集め方",guideIntro:"同じ月を合わせ、取り札を集めて役を作ります。",
  guideToggle:"役の一覧を見る",guideClose:"役の一覧を閉じる",
  guideHelp:"手札を1枚出すと、続けて山札を1枚めくります。取った札は手札ではなく「取り札」に入ります。",
  noMatch:"一致する月がありません。この札は場に残ります。",
  oneMatch:"同じ月の札が1枚あります。2枚とも取れます。",
  twoMatch:"同じ月の札が2枚あります。光っている候補から1枚選んでください。",
  threeMatch:"同じ月の札が3枚あります。4枚すべて取れます。",
  chosen:"選んだ場札",pendingDraw:"山札からめくった札です。取る札を選んでください。山札はキャンセルできません。",
  working:"札を動かしています…",gain:"この取得で増える得点",noGain:"今は役が完成しませんが、役の材料になります。",
  artistNote:"花札画像：Louie Mantia / すけじょ、CC BY-SA 4.0。"
 }
};
const Y={
 goko:["Five Bright","五光"],shiko:["Four Bright","四光"],
 "ame-shiko":["Rain Four Bright","雨四光"],sanko:["Three Bright","三光"],
 inoshikacho:["Boar-Deer-Butterfly","猪鹿蝶"],akatan:["Red Ribbons","赤短"],
 aotan:["Blue Ribbons","青短"],hanami:["Flower Viewing","花見で一杯"],
 tsukimi:["Moon Viewing","月見で一杯"],tane:["Seeds","タネ"],tan:["Ribbons","タン"],kasu:["Plain Cards","カス"]
};
const TR={h:"bright",a:"animal",t:"ribbon",k:"plain"};
let lang="en",matchTotal=12,round=0,scores=[0,0],dealer=0,game=null;
let selected=null,selectedTarget=null,locked=false,guideOpen=false;
const tx = key => M[lang][key] || key;
const yakuText = who => {
  const y=scoreCards(game.captured[who]);
  return y.yaku.length ? y.yaku.map(v=>`${Y[v.key][lang==="ja"?1:0]} ${v.points}`).join(" · "):tx("empty");
};
const format = n => n.toLocaleString(lang==="ja"?"ja-JP":"en-US");
function makeCard(id,{faceDown=false,compact=false,click=null,match=false,target=false,chosen=false,selectedCard=false}={}) {
  const c=faceDown?null:cardById(id);
  const e=document.createElement("button");
  e.type="button";
  e.className="card"+(match?" match":"")+(target?" target":"")+(chosen?" chosen":"")+
    (selectedCard?" selected-card":"")+(click?" selectable":"");
  if(c)e.dataset.cardId=id; // Never add a hidden opponent hand ID to the DOM.
  const img=document.createElement("img");img.className="card-art";
  img.src=faceDown?"cards/back.svg":"cards/"+c.id+".svg";
  img.alt="";img.draggable=false;img.loading="eager";e.append(img);
  const label=c?(lang==="ja"?c.monthJa:c.monthEn)+" / "+tx(TR[c.type]):
    (lang==="ja"?"伏せ札":"Face-down card");
  e.setAttribute("aria-label",label);e.title=label;
  if(click)e.addEventListener("click",click);
  else e.disabled=true;
  if(compact)e.classList.add("compact");
  return e;
}
function fill(id,cards,opts) {
  const box=$(id);box.replaceChildren();
  cards.forEach(cardId=>box.append(makeCard(cardId,opts(cardId))));
}
function renderLabels() {
  document.documentElement.lang=lang;
  for(const id of ["title","languageLabel","qaWarning","setupTitle","setupDescription",
    "roundsLabel","start","oppLabel","youLabel","oppHandLabel","oppTakenLabel",
    "yourTakenLabel","yourHandLabel","fieldLabel","deckLabel","decisionTitle",
    "stop","koi","resultTitle","next","new","footer","selectionTitle","confirm",
    "cancel","guideTitle","guideIntro","guideHelp"])$(id).textContent=tx(id);
}
function settleOnce() {
  if(!game || game.phase!=="ended" || game.accounted) return;
  game.accounted=true;
  if(game.winner!==null) scores[game.winner]+=game.points;
}
const SETS=[
 ["inoshikacho",["7-1","10-1","6-1"]],
 ["akatan",["1-2","2-2","3-2"]],
 ["aotan",["6-2","9-2","10-2"]],
 ["hanami",["3-1","9-1"]],
 ["tsukimi",["8-1","9-1"]],
 ["goko",["1-1","3-1","8-1","11-1","12-1"]],
 ["tane",["2-1","4-1","5-1","6-1","7-1"]],
 ["tan",["1-2","2-2","3-2","4-2","5-2"]],
 ["kasu",["1-3","1-4","2-3","2-4","3-3","3-4","4-3","4-4","5-3","5-4"]]
];
const yName=key=>Y[key]?.[lang==="ja"?1:0]||key;
const cardName=id=>{
 const card=cardById(id);
 return (lang==="ja"?card.monthJa:card.monthEn)+" / "+tx(TR[card.type]);
};
function showGuide(){
 const progress=$("yakuProgress");progress.replaceChildren();
 if(!game)return;
 const rows=yakuProgress(game.captured[0]).filter(p=>p.have>0).slice(0,4);
 if(!rows.length){
  const p=document.createElement("p");
  p.textContent=lang==="ja"?"初心者ヒント：同じ月の4枚は絵が違っても組になります。":
   "Beginner tip: all four pictures from the same month can match.";
  progress.append(p);
 }
 for(const p of rows){
  const item=document.createElement("div");item.className="yaku-progress-item";
  const head=document.createElement("div");head.className="yaku-progress-head";
  const title=document.createElement("strong");title.textContent=yName(p.key);
  const count=document.createElement("span");count.textContent=p.have+" / "+p.need;
  const bar=document.createElement("div");bar.className="yaku-progress-track";
  const fill=document.createElement("span");fill.style.width=Math.round(100*p.have/p.need)+"%";
  bar.append(fill);head.append(title,count);item.append(head,bar);progress.append(item);
 }
 $("guidePanel").hidden=!guideOpen;
 $("guideToggle").textContent=tx(guideOpen?"guideClose":"guideToggle");
 $("guideToggle").setAttribute("aria-expanded",String(guideOpen));
 if(!guideOpen)return;
 const ex=$("guideExamples");ex.replaceChildren();
 for(const [key,ids] of SETS){
  const item=document.createElement("div");item.className="yaku-example";
  const title=document.createElement("strong");title.textContent=yName(key);
  const pictures=document.createElement("div");pictures.className="yaku-example-cards";
  for(const id of ids){
   const img=document.createElement("img");img.src="cards/"+id+".svg";
   img.alt=cardName(id);img.loading="lazy";pictures.append(img);
  }
  item.append(title,pictures);ex.append(item);
 }
}
function selectedPreview(){
 if(!game||!selected)return null;
 return capturePreview(game.captured[0],game.field,selected,selectedTarget);
}
function selectionText(p){
 if(!p)return "";
 const message=tx(["noMatch","oneMatch","twoMatch","threeMatch"][p.matches.length]);
 let explanation=message;
 if(selectedTarget)explanation+=" "+tx("chosen")+": "+cardName(selectedTarget)+".";
 if(p.ready){
  explanation+=" "+(p.addedPoints>0?
   tx("gain")+": +"+p.addedPoints+" "+tx("points")+
    (p.newYaku.length?" ("+p.newYaku.map(y=>yName(y.key)).join(" · ")+")":""):
   tx("noGain"));
 }
 return explanation;
}
function render() {
 renderLabels();
 $("setup").hidden=!!game;$("game").hidden=!game;
 if(!game)return;
 settleOnce();
 $("oppScore").textContent=format(scores[1]);$("yourScore").textContent=format(scores[0]);
 $("roundLabel").textContent=lang==="ja"?tx("round")+round+"局 / "+matchTotal+"局":
   tx("round")+" "+round+" / "+matchTotal;
 $("dealerLabel").textContent=tx("dealer")+": "+tx(game.dealer===0?"youLabel":"oppLabel");
 $("oppCount").textContent=game.hands[1].length+" "+tx("hand");
 $("yourCount").textContent=game.hands[0].length+" "+tx("hand");
 $("deckCount").textContent=game.deck.length;
 const pending=game.phase==="choose"&&game.active===0?game.pending:null;
 const p=selectedPreview();
 const legal=new Set(selected?matchingFieldCards(game.field,selected):[]);
 fill("opponentHand",game.hands[1],()=>({faceDown:true}));
 fill("field",game.field,id=>({
  match:legal.has(id),
  target:legal.has(id)||Boolean(pending?.choices.includes(id)),
  chosen:selectedTarget===id,
  click:!locked&&(pending?.choices.includes(id)||(selected&&legal.size===2&&legal.has(id)))?
   ()=>selectField(id):null
 }));
 fill("yourHand",game.hands[0],id=>({
  click:!locked&&game.active===0&&game.phase==="turn"?()=>selectCard(id):null,
  selectedCard:selected===id
 }));
 fill("opponentCaptured",game.captured[1],()=>({compact:true}));
 fill("yourCaptured",game.captured[0],()=>({compact:true}));
 $("oppYaku").textContent=yakuText(1);$("yourYaku").textContent=yakuText(0);
 $("selection").hidden=!selected||game.phase!=="turn"||game.active!==0;
 if(selected&&game.phase==="turn"&&game.active===0){
  $("selectedCardDetail").textContent=cardName(selected);
  $("selectedPreview").textContent=selectionText(p);
  $("selectedCardArt").replaceChildren(makeCard(selected));
  $("confirm").disabled=locked||!p?.ready;
  $("cancel").disabled=locked;
 }
 $("matchHint").textContent=selected?(
  legal.size?(lang==="ja"?legal.size+"枚一致":legal.size+" matches"):tx("noMatch")):"";
 $("decision").hidden=game.phase!=="decision"||game.active!==0||locked;
 $("koi").disabled=locked||game.hands.every(h=>h.length===0);
 $("stop").disabled=locked;
 $("result").hidden=game.phase!=="ended"||locked;
 let status;
 if(locked||game.phase==="draw-pending")status=tx("working");
 else if(game.phase==="ended")status=tx("roundOver");
 else if(game.active===1)status=tx("opponentTurn");
 else if(pending?.step==="draw")status=tx("pendingDraw");
 else if(game.phase==="choose")status=tx("chooseTarget");
 else if(game.phase==="decision")status=tx("decision");
 else status=tx("chooseCard");
 if(game.koiedBy!==null&&game.phase!=="ended")status+=" · "+tx("koiUsed");
 $("status").textContent=status;
 if(game.phase==="decision")
  $("decisionSummary").textContent=yakuText(game.active)+" · "+tx("score")+": "+
   scoreCards(game.captured[game.active]).points+" "+tx("points")+". "+tx("decision");
 if(game.phase==="ended"){
  const who=game.winner;
  $("resultTitle").textContent=round===matchTotal?tx("matchOver"):tx("resultTitle");
  $("resultSummary").textContent=(who===null?tx("draw"):who===0?tx("youWin"):tx("theyWin"))+
   " · "+game.points+" "+tx("points")+(who===null?"":" · "+yakuText(who))+
   (round===matchTotal?" · "+tx("score")+": "+format(scores[0])+" / "+format(scores[1]):"");
  $("next").hidden=round>=matchTotal;
 }
 showGuide();
}
function selectCard(id){
 if(locked||!game||game.active!==0||game.phase!=="turn")return;
 if(selected===id){selected=null;selectedTarget=null;}
 else {selected=id;selectedTarget=null;}
 render();
}
function selectField(id){
 if(locked||!game||game.active!==0)return;
 if(game.phase==="choose"&&game.pending?.choices.includes(id)){
  void chooseDrawTarget(id);return;
 }
 if(!selected)return;
 const candidates=matchingFieldCards(game.field,selected);
 if(candidates.length!==2||!candidates.includes(id))return;
 selectedTarget=selectedTarget===id?null:id;
 render();
}
const reduced=()=>Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function zoneRect(zone,cardId=null){
 const parent=$(zone);if(!parent)return null;
 const card=cardId?[...parent.children].find(e=>e.dataset.cardId===cardId):null;
 return (card||parent.querySelector(".card")||parent).getBoundingClientRect();
}
/** A purely visual effect. No gameplay mutation is tied to animation events. */
async function fly(cardId,fromZone,toZone,targetId=null){
 if(reduced())return;
 const from=zoneRect(fromZone,fromZone==="opponentHand"?null:cardId);
 const to=zoneRect(toZone,targetId);
 if(!from||!to||!from.width||!to.width)return;
 const ghost=document.createElement("img");ghost.className="flying-card";
 ghost.src="cards/"+cardId+".svg";ghost.alt="";ghost.setAttribute("aria-hidden","true");
 Object.assign(ghost.style,{
  left:from.left+"px",top:from.top+"px",width:from.width+"px",height:from.height+"px"
 });
 document.body.append(ghost);
 const dx=to.left+(to.width-from.width)/2-from.left;
 const dy=to.top+(to.height-from.height)/2-from.top;
 try{
  if(typeof ghost.animate==="function"){
   const motion=ghost.animate([
    {transform:"translate(0px,0px) scale(1)",opacity:1},
    {transform:"translate("+dx+"px,"+dy+"px) scale("+Math.max(.45,Math.min(1.4,to.width/from.width))+")",opacity:.93}
   ],{duration:230,easing:"cubic-bezier(.25,.7,.35,1)",fill:"forwards"});
   await Promise.race([motion.finished.catch(()=>{}),pause(370)]);
   motion.cancel();
  }else await pause(90);
 }finally{ghost.remove();}
}
async function visuallyCapture(cardId,origin,seat,matches,targetId=null){
 const taken=matches.length===2?[targetId]:matches.length===3?matches:matches.slice(0,1);
 const captured=seat===0?"yourCaptured":"opponentCaptured";
 await fly(cardId,origin,"field",taken[0]||null);
 if(!taken.length)return;
 for(const id of taken)await fly(id,"field",captured);
 await fly(cardId,origin,captured);
}
function bestTarget(choices){
 const rank=id=>({h:20,a:8,t:5,k:1})[cardById(id).type];
 return choices.slice().sort((a,b)=>rank(b)-rank(a))[0];
}
/** Draw is compulsory after a confirmed hand play; if two targets, wait. */
async function compulsoryDraw(seat){
 if(game.phase!=="draw-pending")return;
 const drawn=game.deck[0],matches=matchingFieldCards(game.field,drawn);
 if(matches.length===2)await fly(drawn,"deckBack","field",matches[0]);
 else await visuallyCapture(drawn,"deckBack",seat,matches);
 drawNextCard(game);render();
 if(game.phase==="choose"&&seat===1){
  const t=bestTarget(game.pending.choices);
  await fly(t,"field","opponentCaptured");
  await fly(drawn,"deckBack","opponentCaptured");
  chooseTarget(game,t);render();
 }
}
/** The rules engine commits only once, after the visual hand movement. */
async function actionSequence(seat,id,target=null){
 const matches=matchingFieldCards(game.field,id);
 if(matches.length===2&&!matches.includes(target))throw Error("Select one matching target");
 await visuallyCapture(id,seat===0?"yourHand":"opponentHand",seat,matches,target);
 playCard(game,id,{deferDraw:true});
 if(game.phase==="choose"&&game.pending.step==="hand")
  chooseTarget(game,target,{deferDraw:true});
 render();
 await compulsoryDraw(seat);
}
async function runBot(){
 for(let n=0;n<10&&game&&game.active===1&&game.phase!=="ended";n++){
  if(game.phase==="turn"){
   const value=id=>game.field.filter(f=>cardById(f).month===cardById(id).month)
    .reduce((sum,f)=>sum+({h:20,a:8,t:5,k:1})[cardById(f).type],0);
   const id=game.hands[1].slice().sort((a,b)=>value(b)-value(a))[0];
   const matches=matchingFieldCards(game.field,id);
   await actionSequence(1,id,matches.length===2?bestTarget(matches):null);
  }else if(game.phase==="decision"){
   const points=scoreCards(game.captured[1]).points;
   decide(game,points<5&&game.koiedBy===null&&game.hands[1].length>=4?"koi":"stop");
  }else if(game.phase==="choose"){
   const id=bestTarget(game.pending.choices);
   const step=game.pending.step,drawn=game.pending.cardId;
   await fly(id,"field","opponentCaptured");
   await fly(drawn,step==="draw"?"deckBack":"opponentHand","opponentCaptured");
   chooseTarget(game,id,{deferDraw:step==="hand"});
   await compulsoryDraw(1);
  }else if(game.phase==="draw-pending"){
   await compulsoryDraw(1);
  }else break;
  render();
 }
}
async function withAction(action){
 if(locked||!game)return;
 locked=true;render();
 try{await action();await runBot();}
 catch(err){$("status").textContent=String(err?.message||err);}
 finally{locked=false;render();}
}
$("confirm").addEventListener("click",()=>{
 if(locked||!selected||!game||game.active!==0||game.phase!=="turn")return;
 const p=selectedPreview();if(!p?.ready)return;
 const id=selected,target=selectedTarget;
 void withAction(async()=>{
  await actionSequence(0,id,target);
  selected=null;selectedTarget=null;
 });
});
$("cancel").addEventListener("click",()=>{
 if(locked)return;
 selected=null;selectedTarget=null;render();
});
async function chooseDrawTarget(id){
 if(locked||!game||game.phase!=="choose"||game.active!==0||game.pending?.step!=="draw")return;
 await withAction(async()=>{
  const drawn=game.pending.cardId;
  await fly(id,"field","yourCaptured");
  await fly(drawn,"deckBack","yourCaptured");
  chooseTarget(game,id);
 });
}
$("guideToggle").addEventListener("click",()=>{
 guideOpen=!guideOpen;render();
});
$("lang").addEventListener("change",()=>{lang=$("lang").value;render();});
async function newRound(){
 round++;game=startRound({dealer});
 selected=null;selectedTarget=null;
 locked=true;render();
 try{await runBot();}
 catch(err){$("status").textContent=String(err?.message||err);}
 finally{locked=false;render();}
}
$("start").addEventListener("click",()=>{
 if(locked)return;
 matchTotal=Number($("rounds").value);scores=[0,0];round=0;
 dealer=Math.random()<.5?0:1;
 void newRound();
});
$("stop").addEventListener("click",()=>{void withAction(async()=>{decide(game,"stop");});});
$("koi").addEventListener("click",()=>{void withAction(async()=>{decide(game,"koi");});});
$("next").addEventListener("click",()=>{
 if(locked||!game||game.phase!=="ended"||round>=matchTotal)return;
 dealer=game.winner===null?1-game.dealer:game.winner;
 void newRound();
});
$("new").addEventListener("click",()=>{
 if(locked)return;
 game=null;selected=null;selectedTarget=null;round=0;scores=[0,0];render();
});
render();
