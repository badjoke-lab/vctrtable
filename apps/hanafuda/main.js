import {cardById,startRound,playCard,chooseTarget,decide,scoreCards} from "../../packages/hanafuda/koikoi.js";
// Entire game, including hidden opponent cards, is intentionally local QA only.
// Nothing here calls webxdc.sendUpdate or uses a real Vector multiplayer channel.
const $ = id => document.getElementById(id);
const M={
 en:{
  title:"Hanafuda · Koi-Koi",languageLabel:"Language",
  qaWarning:"LOCAL QA · scripted opponent · NOT Vector PvP · prototype card labels, not final artwork",
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
  artistNote:"Temporary identification card: exact card art will replace these labels."
 },
 ja:{
  title:"花札・こいこい",languageLabel:"言語",
  qaWarning:"ローカルQA版・相手はテスト用自動操作・Vector対人戦ではありません・札の絵は仮表示",
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
  artistNote:"札の種類を識別する仮デザインです。最終的に正確な48枚の絵へ差し替えます。"
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
const tx = key => M[lang][key] || key;
const yakuText = who => {
  const y=scoreCards(game.captured[who]);
  return y.yaku.length ? y.yaku.map(v=>`${Y[v.key][lang==="ja"?1:0]} ${v.points}`).join(" · "):tx("empty");
};
const format = n => n.toLocaleString(lang==="ja"?"ja-JP":"en-US");
function makeCard(id,{faceDown=false,compact=false,click=null,match=false,target=false}={}) {
  const c=faceDown ? null:cardById(id);
  const e=document.createElement("button");
  e.type="button";e.className="card "+(c?c.type:"back")+(match?" match":"")+(target?" target":"")+(click?" selectable":"");
  if(faceDown) {
    e.textContent="花";e.setAttribute("aria-label",lang==="ja"?"伏せ札":"Face-down card");
  } else {
    const month=document.createElement("span");month.className="month";month.textContent=lang==="ja"?`${c.month}月 ${c.monthJa}`:`${c.month}. ${c.monthEn}`;
    const motif=document.createElement("span");motif.className="motif";motif.textContent=c.symbol;
    const kind=document.createElement("span");kind.className="kind";kind.textContent=tx(TR[c.type])+(c.type==="t"?(c.name==="red"?" ●":c.name==="blue"?" ◆":""):"");
    e.append(month,motif,kind);
    const label=`${c.monthJa} / ${c.monthEn} / ${c.name} / ${tx(TR[c.type])}`;
    e.title=label+" — "+tx("artistNote");e.setAttribute("aria-label",label);
  }
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
function render() {
  renderLabels();
  $("setup").hidden=!!game;$("game").hidden=!game;
  if(!game) return;
  settleOnce();
  $("oppScore").textContent=format(scores[1]);$("yourScore").textContent=format(scores[0]);
  $("roundLabel").textContent=lang==="ja"?`${tx("round")}${round}局 / ${matchTotal}局`:`${tx("round")} ${round} / ${matchTotal}`;
  $("dealerLabel").textContent=`${tx("dealer")}: ${game.dealer===0?tx("youLabel"):tx("oppLabel")}`;
  $("oppCount").textContent=`${game.hands[1].length} ${tx("hand")}`;
  $("yourCount").textContent=`${game.hands[0].length} ${tx("hand")}`;
  $("deckCount").textContent=game.deck.length;
  const pending=game.phase==="choose" && game.active===0 ? game.pending:null;
  const legalMonth=game.phase==="turn" && game.active===0 ? null:undefined;
  fill("opponentHand",game.hands[1],()=>({faceDown:true}));
  fill("field",game.field,id=>({
    target:!!pending?.choices.includes(id),
    click:pending?.choices.includes(id)?()=>takeField(id):null,
    match:game.active===0 && game.phase==="turn" && game.hands[0].some(h=>cardById(h).month===cardById(id).month)
  }));
  fill("yourHand",game.hands[0],id=>({
    click:game.phase==="turn" && game.active===0 ? ()=>play(id):null,
    match:game.field.some(f=>cardById(f).month===cardById(id).month)
  }));
  fill("opponentCaptured",game.captured[1],()=>({compact:true}));
  fill("yourCaptured",game.captured[0],()=>({compact:true}));
  $("oppYaku").textContent=yakuText(1);
  $("yourYaku").textContent=yakuText(0);
  $("decision").hidden=!(game.phase==="decision"&&game.active===0);
  $("result").hidden=game.phase!=="ended";
  let status="";
  if(game.phase==="ended")status=tx("roundOver");
  else if(game.active===1)status=tx("opponentTurn");
  else if(game.phase==="choose")status=tx("chooseTarget");
  else if(game.phase==="decision")status=tx("decision");
  else status=tx("chooseCard");
  if(game.koiedBy!==null && game.phase!=="ended")status+=" · "+tx("koiUsed");
  $("status").textContent=status;
  if(game.phase==="decision") {
    $("decisionSummary").textContent=`${yakuText(game.active)} · ${tx("score")}: ${scoreCards(game.captured[game.active]).points}`;
  }
  if(game.phase==="ended") {
    const who=game.winner;
    $("resultTitle").textContent=round===matchTotal ? tx("matchOver"):tx("resultTitle");
    $("resultSummary").textContent=(who===null?tx("draw"):who===0?tx("youWin"):tx("theyWin"))+
      ` · ${game.points} ${tx("points")}`+
      (who===null?"":` · ${yakuText(who)}`)+
      (round===matchTotal?` · ${tx("score")}: ${format(scores[0])} / ${format(scores[1])}`:"");
    $("next").hidden=round>=matchTotal;
  }
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
