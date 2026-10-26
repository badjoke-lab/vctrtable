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
    "stop","koi","resultTitle","next","new","footer"])$(id).textContent=tx(id);
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
function runBot() {
  // Deliberately transparent scripted QA behavior, not an AI opponent.
  for(let n=0;n<8&&game.phase!=="ended"&&game.active===1;n++) {
    if(game.phase==="choose"){
      const best=game.pending.choices.slice().sort((a,b)=>{
        const val=c=>({h:20,a:8,t:5,k:1})[cardById(c).type];
        return val(b)-val(a);
      })[0];
      chooseTarget(game,best);
    }else if(game.phase==="decision"){
      const points=scoreCards(game.captured[1]).points;
      decide(game,points<5 && game.koiedBy===null && game.hands[1].length>=4?"koi":"stop");
    }else if(game.phase==="turn") {
      const score=id=>game.field.filter(f=>cardById(f).month===cardById(id).month)
        .reduce((sum,f)=>sum+({h:20,a:8,t:5,k:1})[cardById(f).type],0);
      const sorted=game.hands[1].slice().sort((a,b)=>score(b)-score(a));
      playCard(game,sorted[0]);
    }else break;
  }
}
function apply(action) {
  try{action();runBot();render();}
  catch(err){$("status").textContent=String(err.message||err);}
}
function play(id){if(game?.active===0)apply(()=>playCard(game,id));}
function takeField(id){if(game?.active===0)apply(()=>chooseTarget(game,id));}
function newRound() {
  round++;
  game=startRound({dealer});
  runBot();render();
}
$("lang").addEventListener("change",e=>{lang=e.target.value;render();});
$("start").addEventListener("click",()=>{
  matchTotal=Number($("rounds").value);scores=[0,0];round=0;
  dealer=Math.random()<.5?0:1;newRound();
});
$("stop").addEventListener("click",()=>apply(()=>decide(game,"stop")));
$("koi").addEventListener("click",()=>apply(()=>decide(game,"koi")));
$("next").addEventListener("click",()=>{
  if(!game||game.phase!=="ended"||round>=matchTotal)return;
  dealer=game.winner===null?1-game.dealer:game.winner;newRound();
});
$("new").addEventListener("click",()=>{game=null;round=0;scores=[0,0];render();});
render();
