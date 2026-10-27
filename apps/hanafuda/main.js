import {capturePreview,matchingFieldCards,yakuProgress,publicYakuOutlook} from "../../packages/hanafuda/guide.js";
import {cardById,startRound,chooseInitialDealer,playCard,chooseTarget,drawNextCard,decide,scoreCards} from "../../packages/hanafuda/koikoi.js";
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
  hintsEnabled:"Hints: On",hintsDisabled:"Hints: Off",inspectTitle:"Card details",inspectClose:"Close",
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
  hintsEnabled:"ヒント：オン",hintsDisabled:"ヒント：オフ",inspectTitle:"札の詳しい情報",inspectClose:"閉じる",
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
// Japanese is the canonical identity in both languages. Full English descriptions
// always show Japanese > Hepburn pronunciation > English meaning.
const Y={
 goko:["五光","Gokō","Five Brights"],
 shiko:["四光","Shikō","Four Brights"],
 "ame-shiko":["雨四光","Ame-shikō","Rain Four Brights"],
 sanko:["三光","Sankō","Three Brights"],
 inoshikacho:["猪鹿蝶","Inoshikachō","Boar, Deer & Butterfly"],
 akatan:["赤短","Akatan","Red Poetry Ribbons"],
 aotan:["青短","Aotan","Blue Ribbons"],
 hanami:["花見で一杯","Hanami de Ippai","Sake Under the Blossoms"],
 tsukimi:["月見で一杯","Tsukimi de Ippai","Sake Under the Moon"],
 tane:["タネ","Tane","Seed Cards"],
 tan:["タン","Tan","Ribbon Cards"],
 kasu:["カス","Kasu","Plain Cards"]
};
const yName=key=>Y[key]?.[0]||key;
const yFullName=key=>lang==="ja"?yName(key):(
  Y[key]?Y[key][0]+" ("+Y[key][1]+" — "+Y[key][2]+")":key);
const TR={h:"bright",a:"animal",t:"ribbon",k:"plain"};
let lang="en",matchTotal=12,round=0,scores=[0,0],dealer=0,game=null;
let selected=null,selectedTarget=null,locked=false,guideOpen=false,hintsOn=false;
let inspectingCard=null,inspectOrigin=null,longPressHandled=false,pressTimer=null;
let revealedDraw=null,playbackPhase=null,playbackMessage="";
let introOpen=false,firstParentDraw=null,roleFlashActive=false;
let yakuSeen=[{points:0,yaku:[]},{points:0,yaku:[]}];
const tx = key => M[lang][key] || key;
const yakuText = who => {
  const y=scoreCards(game.captured[who]);
  return y.yaku.length ? y.yaku.map(v=>yName(v.key)+" "+v.points).join(" · "):tx("empty");
};
const format = n => n.toLocaleString(lang==="ja"?"ja-JP":"en-US");
function makeCard(id,{faceDown=false,compact=false,click=null,match=false,target=false,chosen=false,selectedCard=false,inspectable=false}={}) {
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
  if(click)e.addEventListener("click",()=>{
    if(longPressHandled){longPressHandled=false;return;}
    click();
  });
  else if(inspectable)e.addEventListener("click",()=>openInspect(id));
  else e.disabled=true;
  if(c&&inspectable){
    e.addEventListener("pointerdown",ev=>{
      if(ev.pointerType==="mouse")return;
      if(pressTimer)clearTimeout(pressTimer);
      pressTimer=setTimeout(()=>{pressTimer=null;longPressHandled=true;openInspect(id);},500);
    });
    const stop=()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}};
    for(const type of ["pointerup","pointerleave","pointercancel"])e.addEventListener(type,stop);
    e.addEventListener("contextmenu",ev=>ev.preventDefault?.());
  }
  if(compact)e.classList.add("compact");
  return e;
}
function fill(id,cards,opts) {
  const box=$(id),scrollX=box.scrollLeft,scrollY=box.scrollTop;
  box.replaceChildren();
  cards.forEach(cardId=>box.append(makeCard(cardId,opts(cardId))));
  // Re-rendering the whole hand must not jump a horizontally scrolled phone.
  if(Number.isFinite(scrollX))box.scrollLeft=scrollX;
  if(Number.isFinite(scrollY)&&id!=="field")box.scrollTop=scrollY;
}

function relatedYaku(id){
 const card=cardById(id),keys=new Set();
 for(const [key,ids] of SETS.slice(0,6))if(ids.includes(id))keys.add(key);
 if(card.type==="h")keys.add("goko");
 if(card.type==="a")keys.add("tane");
 if(card.type==="t")keys.add("tan");
 if(card.type==="k"||id==="9-1")keys.add("kasu");
 return [...keys];
}
function openInspect(id){
 if(!game||!cardById(id)||locked)return;
 inspectingCard=id;
 $("cardInspectImage").src="cards/"+id+".svg";
 $("cardInspectImage").alt=cardName(id);
 $("cardInspectTitle").textContent=tx("inspectTitle");
 $("cardInspectClose").textContent=tx("inspectClose");
 $("cardInspectDescription").textContent=cardName(id)+
  (lang==="ja"?"。この札を含む役を確認できます。":
  ". This card can contribute to the scoring sets listed below.");
 const list=$("cardInspectYaku");list.replaceChildren();
 for(const key of relatedYaku(id)){
  const p=document.createElement("p");p.textContent=yFullName(key);list.append(p);
 }
 if(!list.children.length){
  const p=document.createElement("p");p.textContent=lang==="ja"?
   "同じ月の札と合わせて取り札にします。":
   "Match a card from the same month and add the pair to your captures.";
  list.append(p);
 }
 $("cardInspect").hidden=false;$("cardInspectClose").focus?.();
}
function closeInspect(){
 inspectingCard=null;longPressHandled=false;$("cardInspect").hidden=true;
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
const Y_DESC={
 inoshikacho:["Collect the boar (July), deer (October) and butterfly (June).","7月の猪・10月の鹿・6月の蝶を揃えます。"],
 akatan:["Collect red poetry ribbons from January, February and March.","1月・2月・3月の赤い文字入り短冊を揃えます。"],
 aotan:["Collect blue ribbons from June, September and October.","6月・9月・10月の青い短冊を揃えます。"],
 hanami:["Capture the cherry-blossom curtain and sake cup.","桜の幕と菊の盃を揃えます。"],
 tsukimi:["Capture the August moon and sake cup.","8月の月と菊の盃を揃えます。"],
 goko:["Collect all 5 Bright cards; smaller sets also score.","光札5枚を揃えます。3光・4光にも別の役があります。"],
 tane:["Capture 5 or more Seed cards.","タネ札を5枚以上集めます。"],
 tan:["Capture 5 or more Ribbon cards.","短冊を5枚以上集めます。"],
 kasu:["Capture 10 or more Plain cards. The sake cup counts too.","カス札を10枚以上集めます。盃もカスに数えます。"]
};

const cardName=id=>{
 const card=cardById(id);
 return (lang==="ja"?card.monthJa:card.monthEn)+" / "+tx(TR[card.type]);
};

function outlookLabel(p,isOpponent){
 if(p.completed)return lang==="ja"?"成立済み":"Completed";
 if(p.impossible)return lang==="ja"?"必要札が相手に取られ成立不可":"Blocked by captured cards";
 if(p.heldIds?.length&&isOpponent)return lang==="ja"?
   "必要札をあなたが手札に所持":"A required card is currently in your hand";
 return p.oneAway?(lang==="ja"?"あと1枚":"One card away"):
   (lang==="ja"?"進行中":"In progress");
}
function showOutlook(parentId,progress,isOpponent){
 const zone=$(parentId);zone.replaceChildren();
 const relevant=progress.filter(p=>p.have>0).sort((a,b)=>{
  if(a.completed!==b.completed)return a.completed?-1:1;
  if(a.impossible!==b.impossible)return a.impossible?1:-1;
  return (a.need-a.have)-(b.need-b.have);
 }).slice(0,8);
 if(!relevant.length){
  const p=document.createElement("p");p.textContent=lang==="ja"?
   "取り札が集まると、狙える役がここに表示されます。":
   "Potential sets appear as captured cards accumulate.";
  zone.append(p);
 }
 for(const item of relevant){
  const row=document.createElement("div");row.className="outlook-item"+
   (item.impossible?" outlook-blocked":"")+(item.oneAway?" outlook-near":"");
  const label=document.createElement("strong");label.textContent=yFullName(item.key);
  const status=document.createElement("span");status.textContent=item.have+"/"+item.need+
   " · "+outlookLabel(item,isOpponent);
  row.append(label,status);zone.append(row);
 }
}
function showGuide(){
 const progress=$("yakuProgress");progress.replaceChildren();
 if(!game)return;
 const own=yakuProgress(game.captured[0]);
 const opponent=publicYakuOutlook(game.captured[1],game.captured[0],game.hands[0]);
 const top=values=>values.filter(p=>p.have>0&&!p.impossible).sort(
  (a,b)=>(a.need-a.have)-(b.need-b.have))[0];
 if(hintsOn){
  const hintPairs=[
   [lang==="ja"?"自":"You",top(publicYakuOutlook(game.captured[0],game.captured[1]))],
   [lang==="ja"?"相":"Opp",top(opponent)]
  ];
  for(const [label,p] of hintPairs){
   const item=document.createElement("div");item.className="hint-inline";
   item.textContent=label+": "+(p?(yName(p.key)+" "+p.have+"/"+p.need):
    (lang==="ja"?"成立候補なし":"No set yet"));
   progress.append(item);
  }
 }else {
  const rows=own.filter(p=>p.have>0).slice(0,2);
  if(!rows.length){
   const item=document.createElement("p");item.textContent=lang==="ja"?
    "同じ月の札を取って役を集めましょう。":
    "Match the same month to build scoring sets.";
   progress.append(item);
  }
  for(const p of rows){
   const item=document.createElement("div");item.className="yaku-progress-item";
   const head=document.createElement("div");head.className="yaku-progress-head";
   const title=document.createElement("strong");title.textContent=yName(p.key);
   const count=document.createElement("span");count.textContent=p.have+"/"+p.need;
   head.append(title,count);
   const bar=document.createElement("div");bar.className="yaku-progress-track";
   const fill=document.createElement("span");
   fill.style.width=Math.round(p.have/p.need*100)+"%";
   bar.append(fill);item.append(head,bar);progress.append(item);
  }
 }
 $("hintsToggle").textContent=tx(hintsOn?"hintsEnabled":"hintsDisabled");
 $("hintsToggle").setAttribute("aria-pressed",String(hintsOn));
 $("guidePanel").hidden=!guideOpen;
 $("guideToggle").textContent=tx(guideOpen?"guideClose":"guideToggle");
 $("guideClose").textContent=lang==="ja"?"閉じる":"Close";
 $("guidePanelTitle").textContent=lang==="ja"?"役の一覧":"Scoring combinations (Yaku)";
 $("guideToggle").setAttribute("aria-expanded",String(guideOpen));
 if(!guideOpen)return;
 $("ownOutlookTitle").textContent=lang==="ja"?"自分の役の状況":"Your scoring sets";
 $("oppOutlookTitle").textContent=lang==="ja"?"相手の役の状況":"Opponent's public scoring outlook";
 $("outlookDisclaimer").textContent=lang==="ja"?
  "相手の裏向きの手札と山札は不明です。相手の取り札、あなたの取り札・手札だけをもとに判断します。":
  "The opponent's hidden hand and the deck are unknown. Only public captures and your own cards inform these hints.";
 $("yakuReferenceTitle").textContent=lang==="ja"?"役の種類と必要な札":"Scoring combinations and required cards";
 showOutlook("ownOutlook",publicYakuOutlook(game.captured[0],game.captured[1]),false);
 showOutlook("oppOutlook",opponent,true);
 const examples=$("guideExamples");examples.replaceChildren();
 for(const [key,ids] of SETS){
  const item=document.createElement("div");item.className="yaku-example";
  const title=document.createElement("strong");title.textContent=yFullName(key);
  const pictures=document.createElement("div");pictures.className="yaku-example-cards";
  for(const id of ids){
   const img=document.createElement("img");img.src="cards/"+id+".svg";
   img.alt=cardName(id);img.loading="lazy";pictures.append(img);
  }
  const description=document.createElement("p");
  description.textContent=Y_DESC[key][lang==="ja"?1:0];
  item.append(title,description,pictures);examples.append(item);
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
    (p.newYaku.length?" ("+p.newYaku.map(y=>yFullName(y.key)).join(" · ")+")":""):
   tx("noGain"));
  if(p.taken.length){
   const before=new Map(yakuProgress(game.captured[0]).map(v=>[v.key,v]));
   const after=yakuProgress([...game.captured[0],selected,...p.taken]);
   const improvements=after.filter(v=>v.have>(before.get(v.key)?.have||0))
    .sort((a,b)=>(a.need-a.have)-(b.need-b.have)).slice(0,3);
   if(improvements.length)explanation+=" "+improvements.map(v=>
    yName(v.key)+" "+(before.get(v.key)?.have||0)+"/"+v.need+
    " → "+v.have+"/"+v.need).join(" · ");
  }
 }
 return explanation;
}
function endReason(){
 if(!game)return "";
 const whoText=game.winner===null?tx("draw"):game.winner===0?tx("youLabel"):tx("oppLabel");
 const reasons={
  "initial-bonus":lang==="ja"?
    "配札時に「"+(game.initialBonus?.kind==="teshi"?"手四":"くっつき")+
    "」が成立しました。"+whoText+"に6点。通常の対局は行わず、この局を終了します。":
    whoText+" was dealt "+(game.initialBonus?.kind==="teshi"?
    "four cards from one month (Teshi)":"four pairs of months (Kuttsuki)")+
    ". The official opening rule awards 6 points and ends this round before play.",
  "stop":lang==="ja"?whoText+"が「あがり」を選んだため、この局は終了です。":
    whoText+" chose Stop & Score. The round ends immediately.",
  "koi-improvement":lang==="ja"?whoText+"が「こいこい」の後に新たな役・加点を成立させ、局が終了しました。":
    whoText+" improved a scoring set after declaring Koi-Koi, ending the round.",
  "koi-counter":lang==="ja"?whoText+"が相手の「こいこい」後に役を成立させました。逆転で2倍です。":
    whoText+" formed a set after the other player declared Koi-Koi. Counter score is doubled.",
  "exhausted":lang==="ja"?"双方の手札がなくなり、加点を確定せずに流局しました。":
    "Both hands are empty. No further scoring set was claimed; the round is a draw."
 };
 return reasons[game.endedReason]||"";
}
function renderIntro(){
 $("roundIntro").hidden=!introOpen;
 if(!introOpen)return;
 $("roundIntroEyebrow").textContent=lang==="ja"?"新しい局":"New round";
 $("roundIntroTitle").textContent=lang==="ja"?"第"+round+"局 / "+matchTotal+"局":
  "Round "+round+" of "+matchTotal;
 $("roundIntroParent").textContent=lang==="ja"?
  "親（先攻）："+(dealer===0?"あなた":"相手"):
  "Dealer / first turn: "+(dealer===0?"You":"Opponent");
 $("roundIntroScore").textContent=lang==="ja"?
  "合計点　あなた "+scores[0]+" ― 相手 "+scores[1]:
  "Match scores: You "+scores[0]+" — Opponent "+scores[1];
 const drawText=firstParentDraw?
  (lang==="ja"?
   "親決め：あなた "+firstParentDraw.monthBySeat[0]+"月 / 相手 "+
    firstParentDraw.monthBySeat[1]+"月。月の早い方が親です。":
   "First dealer draw: You drew month "+firstParentDraw.monthBySeat[0]+
    ", opponent month "+firstParentDraw.monthBySeat[1]+
    ". The earlier month goes first."):
  lang==="ja"?"前局の結果で親が決まりました。":
    "The previous round decided the first player.";
 const bonus=game.endedReason==="initial-bonus"?endReason():"";
 const normalRule=lang==="ja"?
  "1局は役ができて「あがり」すると手札が残っていても終了します。12局の合計点で勝負します。":
  "A round can finish with cards still in hand when someone scores and stops. The match is decided after all rounds.";
 $("roundIntroNote").textContent=(bonus?bonus+" ":"")+drawText+
  (game.phase==="ended"?"":" "+normalRule);
 $("beginRound").textContent=game.phase==="ended"?
  (lang==="ja"?"結果を見る":"View round result"):
  (lang==="ja"?"配札して開始":"Deal & start");
}
async function announceYaku(seat,{beforeDraw=false}={}){
 const now=scoreCards(game.captured[seat]),before=yakuSeen[seat];
 yakuSeen[seat]=now;
 const improved=now.points>before.points;
 if(!improved)return;
 const previous=new Map(before.yaku.map(y=>[y.key,y.points]));
 const changed=now.yaku.filter(y=>y.points>(previous.get(y.key)||0));
 const names=changed.map(y=>yFullName(y.key)).join(" · ");
 roleFlashActive=true;
 $("yakuFlashEyebrow").textContent=lang==="ja"?"役成立！":"Scoring set completed!";
 $("yakuFlashTitle").textContent=(seat===0?tx("youLabel"):tx("oppLabel"))+
  " — "+(names|| (lang==="ja"?"役が加点":"Scoring set improved"));
 $("yakuFlashDetails").textContent=(lang==="ja"?
  "今回 +"+(now.points-before.points)+"点分の役を獲得。役の合計 "+
  now.points+"点。":
  "+"+(now.points-before.points)+" points. Total scoring sets: "+
  now.points+" points.")+(beforeDraw?
   (lang==="ja"?" 続いて山札をめくってから、あがり／こいこいを判断します。":
   " The deck card must still be drawn before the Stop/Koi decision."):"");
 $("yakuFlash").hidden=false;
 await beatPause(1100);
 roleFlashActive=false;$("yakuFlash").hidden=true;
}
function render() {
 document.body.className=game?"in-game":"";
 renderLabels();
 $("setup").hidden=!!game;$("game").hidden=!game;
 if(!game)return;
 const fieldColumns=window.innerWidth>=700?6:4;
 $("field").style.setProperty?.("--field-rows",String(Math.max(2,
  Math.ceil(game.field.length/fieldColumns))));
 renderIntro();
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
  inspectable:true,
  match:legal.has(id),
  target:legal.has(id)||Boolean(pending?.choices.includes(id)),
  chosen:selectedTarget===id,
  click:!locked&&(pending?.choices.includes(id)||(selected&&legal.size===2&&legal.has(id)))?
   ()=>selectField(id):()=>openInspect(id)
 }));
 fill("yourHand",game.hands[0],id=>({
  click:!locked&&game.active===0&&game.phase==="turn"?()=>selectCard(id):null,
  selectedCard:selected===id,
  inspectable:true
 }));
 fill("opponentCaptured",game.captured[1],id=>({compact:true,click:()=>openInspect(id),inspectable:true}));
 fill("yourCaptured",game.captured[0],id=>({compact:true,click:()=>openInspect(id),inspectable:true}));
 $("oppYaku").textContent=yakuText(1);$("yourYaku").textContent=yakuText(0);
 $("selection").hidden=!selected||game.phase!=="turn"||game.active!==0;
 $("turnPrompt").hidden=!$("selection").hidden;
 $("turnPrompt").textContent=playbackMessage||
  (lang==="ja"?
   (game.active===0&&game.phase==="turn"?"手札を選んでください。":"盤面を確認してください。"):
   (game.active===0&&game.phase==="turn"?"Select a hand card to preview a move.":"Follow the cards on the table."));
 if(selected&&game.phase==="turn"&&game.active===0){
  $("selectedCardDetail").textContent=cardName(selected);
  $("selectedPreview").textContent=selectionText(p);
  $("selectedCardArt").replaceChildren(makeCard(selected));
  $("confirm").disabled=locked||!p?.ready;
  $("cancel").disabled=locked;
 }
 $("matchHint").textContent=selected?(
  legal.size?(lang==="ja"?legal.size+"枚一致":legal.size+" matches"):tx("noMatch")):"";
 $("decision").hidden=introOpen||game.phase!=="decision"||game.active!==0||locked;
 $("koi").disabled=locked||game.hands.every(h=>h.length===0);
 $("stop").disabled=locked;
 $("result").hidden=introOpen||game.phase!=="ended"||locked;
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
 updatePlaybackUI();
 if(game.phase==="decision")
  $("decisionSummary").textContent=yakuText(game.active)+" · "+tx("score")+": "+
   scoreCards(game.captured[game.active]).points+" "+tx("points")+". "+tx("decision");
 if(game.phase==="ended"){
  const who=game.winner;
  $("resultTitle").textContent=round===matchTotal?tx("matchOver"):tx("resultTitle");
  $("resultReason").textContent=endReason();
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
const beatPause=ms=>pause(reduced()?Math.min(160,ms):ms);
const say=(ja,en)=>lang==="ja"?ja:en;
const who=seat=>seat===0?tx("youLabel"):tx("oppLabel");
function setBeat(step,seat,kind,id=null,count=0){
 playbackPhase=step;
 const person=who(seat),card=id?cardName(id):"";
 const messages={
  hand:()=>say(person+"：手札から "+card+" を出します。",person+": plays "+card+" from hand."),
  compare:()=>say("同じ月の場札を確認中。"+count+"枚一致。",
   "Checking field cards of the same month. "+count+" match."),
  capture:()=>say(person+"："+count+"枚の札を取り札へ移動。",
   person+": "+count+" cards move to the captured pile."),
  place:()=>say("同じ月の札なし。場に残します。",
   "No matching month. This card remains on the field."),
  deck:()=>say(person+"：続けて山札を1枚めくります。",
   person+": next, flip one card from the draw pile."),
  flip:()=>say("山札は "+card+"。場札との一致を確認。",
   "Draw revealed "+card+". Checking for a field match."),
  pick:()=>say("山札は "+card+"。一致する場札が2枚。取る札を選んでください。",
   "Draw revealed "+card+". Two matches: choose one highlighted field card."),
  complete:()=>say("手札と山札の処理が完了しました。",
   "Hand card and drawn card resolved."),
  result:()=>count>0?say("山札は "+card+"。場札と合わせて"+(count+1)+"枚を取り札に加えました。",
   "Drawn card: "+card+". Captured "+(count+1)+" cards in total."):
   say("山札は "+card+"。一致がないため場札に残しました。",
   "Drawn card: "+card+". No match: it stays in the field.")
 };
 playbackMessage=(messages[kind]||messages.complete)();
 updatePlaybackUI();
}
function updatePlaybackUI(){
 const active=playbackPhase==="hand"?"hand":playbackPhase==="draw"?"draw":null;
 $("handStep").className="timeline-step"+(active==="hand"?" active":playbackPhase==="draw"?" done":"");
 $("drawStep").className="timeline-step"+(active==="draw"?" active":"");
 $("handStep").textContent=say("1 · 手札","1 · Hand");
 $("drawStep").textContent=say("2 · 山札","2 · Deck");
 const narration=$("actionNarration");
 narration.hidden=!playbackMessage;
 narration.textContent=playbackMessage;
 const reveal=$("drawReveal");
 reveal.hidden=!revealedDraw;
 if(revealedDraw){
  $("drawRevealHeading").textContent=say("② 山札をめくった結果","② Draw pile result");
  if(game?.phase==="choose"&&game.pending?.step==="draw"){
   $("drawRevealDescription").textContent=say(
    cardName(revealedDraw)+"。同じ月の場札が2枚あります。光る札から取る1枚を選んでください。",
    cardName(revealedDraw)+". Two field matches: tap one highlighted card.");
  }
 }
}
function showStage(id,seat){
 const s=$("playStage");
 s.hidden=false;s.className="play-stage awaiting";
 $("playStageLabel").textContent=say(
  seat===0?"手札から出す札":"相手が出した札",
  seat===0?"Played from your hand":"Opponent's played card");
 $("playStageCard").src="cards/"+id+".svg";
}
function stageVisible(){
 $("playStage").className="play-stage";
}
function hideStage(){$("playStage").hidden=true;}
function openDraw(id){
 revealedDraw=id;
 $("drawRevealCard").style.visibility="";
 $("drawReveal").hidden=false;
 $("drawReveal").className="draw-reveal awaiting";
 $("drawRevealCard").src="cards/back.svg";
 $("drawRevealDescription").textContent=say(
  "山札を裏向きで取りました。これから表に返します。",
  "A card has left the deck, face down. It will now flip.");
 updatePlaybackUI();
}
function clearDraw(){
 $("drawRevealCard").style.visibility="";
 revealedDraw=null;$("drawReveal").hidden=true;$("drawReveal").className="draw-reveal";
}
function cardElement(zone,id=null){
 const root=$(zone);
 if(!root)return null;
 if(zone==="playStage")return $("playStageCard");
 if(zone==="drawReveal")return $("drawRevealCard");
 if(zone==="deckBack")return root;
 if(zone==="opponentHand")return root.querySelector(".card")||root;
 if(id)return [...root.children].find(el=>el.dataset.cardId===id)||root;
 return root.querySelector(".card")||root;
}
function rect(zone,id=null,offset=0){
 const el=cardElement(zone,id);
 if(!el)return null;
 const r=el.getBoundingClientRect();
 if(zone==="field"&&!id){
  // New unmatched cards must land in the NEXT free grid slot,
  // never on an unrelated field card.
  const parent=$("field"),grid=parent.getBoundingClientRect();
  const n=parent.children.length;
  const cols=window.innerWidth>=700?6:4;
  const rows=Math.max(2,Math.ceil((n+1)/cols));
  const cellW=grid.width/cols,cellH=grid.height/rows;
  const w=Math.max(10,Math.min(cellW-5,(cellH-5)*976/1600));
  const h=w*1600/976;
  return {left:grid.left+(n%cols)*cellW+(cellW-w)/2,
   top:grid.top+Math.floor(n/cols)*cellH+(cellH-h)/2,
   width:w,height:h};
 }
 if(zone==="yourCaptured"||zone==="opponentCaptured"){
  const pile=$(zone),box=pile.getBoundingClientRect();
  const n=pile.children.length;
  const existing=pile.children[0]?.getBoundingClientRect();
  const h=existing?.height||Math.max(10,box.height-6);
  const w=existing?.width||h*976/1600;
  const left=box.left+Math.min(Math.max(0,box.width-w),
    (n+offset)*(w+3));
  return {left,top:box.top+(box.height-h)/2,width:w,height:h};
 }
 return r;
}
async function fly(id,fromZone,toZone,targetId=null,{faceDown=false,offset=0,sourceAnchor=null}={}){
 const from=rect(fromZone,sourceAnchor||id),to=rect(toZone,targetId,offset);
 if(reduced()||!from||!to||!from.width||!to.width)return;
 const ghost=document.createElement("img");
 ghost.className="flying-card";ghost.alt="";ghost.setAttribute("aria-hidden","true");
 ghost.src=faceDown?"cards/back.svg":"cards/"+id+".svg";
 Object.assign(ghost.style,{left:from.left+"px",top:from.top+"px",
  width:from.width+"px",height:from.height+"px"});
 document.body.append(ghost);
 // Hide the source while its moving image is visible; restores after state render.
 const original=sourceAnchor?null:cardElement(fromZone,id),prior=original?.style.visibility;
 if(original)original.style.visibility="hidden";
 const dx=to.left+(to.width-from.width)/2-from.left;
 const dy=to.top+(to.height-from.height)/2-from.top;
 try{
  if(typeof ghost.animate==="function"){
   const scale=to.width/from.width;
   const motion=ghost.animate([
    {transform:"translate(0px,0px) scale(1)",opacity:1},
    {transform:"translate("+dx+"px,"+dy+"px) scale("+scale+")",opacity:1}
   ],{duration:340,easing:"cubic-bezier(.2,.7,.2,1)",fill:"forwards"});
   await Promise.race([motion.finished.catch(()=>{}),pause(560)]);
   motion.cancel();
  }else await pause(120);
 }finally{
  ghost.remove();
  if(original)original.style.visibility=prior||"";
 }
}
function markMatches(ids){
 const cards=[...$("field").children];
 for(const el of cards)if(ids.includes(el.dataset.cardId))el.className+=" captured-now";
}
async function moveCapture(played,source,seat,taken){
 const dest=seat===0?"yourCaptured":"opponentCaptured";
 if(!taken.length){
  setBeat(source==="drawReveal"?"draw":"hand",seat,"place",played);
  await fly(played,source,"field"); // destination is the next empty field slot
  // No pause here: commit and render the new field card immediately after landing.
  return;
 }
 setBeat(source==="drawReveal"?"draw":"hand",seat,"compare",played,taken.length);
 markMatches(taken);
 await beatPause(330);
 // Move the just-played card TO its matching field card first.
 await fly(played,source,"field",taken[0]);
 // Keep the played card visibly paired ON the actual target until both fly
 // to captured, instead of teleporting back to its previous staging slot.
 let impact=null;
 const original=cardElement(source,played),oldVisibility=original?.style.visibility;
 if(!reduced()){
  const target=rect("field",taken[0]);
  impact=document.createElement("img");
  impact.className="impact-card";impact.alt="";
  impact.setAttribute("aria-hidden","true");
  impact.src="cards/"+played+".svg";
  Object.assign(impact.style,{left:target.left+"px",top:target.top+"px",
   width:target.width+"px",height:target.height+"px"});
  document.body.append(impact);
  if(original)original.style.visibility="hidden";
 }
 try {
  await beatPause(260);
  if(impact){impact.remove();impact=null;}
  setBeat(source==="drawReveal"?"draw":"hand",seat,"capture",played,taken.length+1);
  await Promise.all([
   ...taken.map((id,index)=>fly(id,"field",dest,null,{offset:index})),
   fly(played,"field",dest,null,{offset:taken.length,sourceAnchor:taken[0]})
  ]);
 }finally {
  if(impact)impact.remove();
  if(original)original.style.visibility=oldVisibility||"";
 }
}
async function showCapturedResult(seat,takenCount){
 if(!takenCount)return;
 const dest=$(seat===0?"yourCaptured":"opponentCaptured");
 // Capture rows scroll horizontally on small screens; reveal the newest cards
 // rather than letting freshly taken cards disappear off the right edge.
 if(Number.isFinite(dest.scrollWidth))dest.scrollLeft=dest.scrollWidth;
 dest.className="captured capture-flash";
 await beatPause(350);
 dest.className="captured";
}
async function animateHandCard(seat,id,taken){
 setBeat("hand",seat,"hand",id);
 showStage(id,seat);
 await fly(id,seat===0?"yourHand":"opponentHand","playStage",null,{faceDown:seat===1});
 stageVisible();
 await beatPause(320); // the newly played card stays visible on the table first
 await moveCapture(id,"playStage",seat,taken);
 hideStage();
}
async function flipDrawCard(id){
 const face=$("drawRevealCard");
 if(!reduced()&&typeof face.animate==="function"){
  const out=face.animate([{transform:"rotateY(0)"},{transform:"rotateY(90deg)"}],
   {duration:150,easing:"ease-in"});
  await Promise.race([out.finished.catch(()=>{}),pause(220)]);
 }
 face.src="cards/"+id+".svg";
 if(!reduced()&&typeof face.animate==="function"){
  const into=face.animate([{transform:"rotateY(-90deg)"},{transform:"rotateY(0)"}],
   {duration:170,easing:"ease-out"});
  await Promise.race([into.finished.catch(()=>{}),pause(250)]);
 }
}
function bestTarget(choices){
 const rank=id=>({h:20,a:8,t:5,k:1})[cardById(id).type];
 return choices.slice().sort((a,b)=>rank(b)-rank(a))[0];
}
/** Draw is compulsory after a confirmed hand play; if two targets, wait. */
/** Resolve a drawn card that required one of two field targets.
 * The reveal remains on-screen until the user deliberately chooses one. */
async function resolveDrawChoice(seat,target){
 if(game.phase!=="choose"||game.pending?.step!=="draw"||!revealedDraw)
  throw Error("The drawn card is not awaiting a field choice");
 const drawn=game.pending.cardId;
 if(target!==game.pending.choices[0]&&target!==game.pending.choices[1])
  throw Error("Not a legal field target");
 await moveCapture(drawn,"drawReveal",seat,[target]);
 chooseTarget(game,target);
 $("drawRevealCard").style.visibility="hidden";
 render();
 await showCapturedResult(seat,1);
 setBeat("draw",seat,"result",drawn,1);
 await beatPause(520);
 clearDraw();render();
 await announceYaku(seat);
}
/** Every turn's second step is mandatory and visually independent of the hand. */
async function compulsoryDraw(seat){
 if(game.phase!=="draw-pending")return;
 const drawn=game.deck[0];
 const matches=matchingFieldCards(game.field,drawn);
 setBeat("draw",seat,"deck");
 openDraw(drawn);
 // Travel while FACE DOWN. Never show the next deck card before it is drawn.
 await fly(drawn,"deckBack","drawReveal",null,{faceDown:true});
 $("drawReveal").className="draw-reveal";
 await beatPause(180);
 await flipDrawCard(drawn);
 $("drawReveal").className="draw-reveal "+(matches.length?"matched":"unmatched");
 setBeat("draw",seat,"flip",drawn);
 markMatches(matches);
 $("drawRevealDescription").textContent=matches.length?
  say(matches.length+"枚の場札と同じ月です。",matches.length+" same-month field card(s)."):
  say("同じ月の場札はありません。","No same-month field card.");
 await beatPause(650); // legible reveal before any match resolves
 if(matches.length===2){
  // Only a revealed card can enter the target-choice state. The card itself
  // remains beside the deck, NOT on the field or in the captured pile yet.
  drawNextCard(game);render();
  setBeat("draw",seat,"pick",drawn);
  if(seat===1){
   await beatPause(450);
   await resolveDrawChoice(seat,bestTarget(game.pending.choices));
  }
  return;
 }
 const taken=matches.length===3?matches:matches.slice(0,1);
 await moveCapture(drawn,"drawReveal",seat,taken);
 // The engine commits the mandatory draw once, after the visible result.
 drawNextCard(game);
 $("drawRevealCard").style.visibility="hidden";
 render();
 await showCapturedResult(seat,taken.length);
 setBeat("draw",seat,"result",drawn,taken.length);
 await beatPause(520);
 clearDraw();render();
 await announceYaku(seat);
}
async function actionSequence(seat,id,target=null){
 const matches=matchingFieldCards(game.field,id);
 if(matches.length===2&&!matches.includes(target))
  throw Error("Choose a matching field card first");
 const taken=matches.length===2?[target]:matches.length===3?matches:matches.slice(0,1);
 // The public HAND card lands, matches highlight, then move together to
 // captured (or it remains on the field). Only then is the deck touched.
 await animateHandCard(seat,id,taken);
 playCard(game,id,{deferDraw:true});
 if(game.phase==="choose"&&game.pending.step==="hand")
  chooseTarget(game,target,{deferDraw:true});
 if(seat===0){selected=null;selectedTarget=null;}
 render();
 await showCapturedResult(seat,taken.length);
 // If completing a scoring set with the played hand card, show it now;
 // the mandatory deck draw still follows, and Stop/Koi is offered only then.
 await announceYaku(seat,{beforeDraw:true});
 await beatPause(240); // clear visual boundary before the compulsory deck draw
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
   if(game.pending.step==="draw")await resolveDrawChoice(1,id);
   else {chooseTarget(game,id,{deferDraw:true});await compulsoryDraw(1);}
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
 if(locked||!game||game.phase!=="choose"||game.active!==0||
  game.pending?.step!=="draw")return;
 await withAction(async()=>{await resolveDrawChoice(0,id);});
}
$("guideToggle").addEventListener("click",()=>{
 guideOpen=!guideOpen;render();
 if(guideOpen)$("guideClose").focus?.();
});
$("hintsToggle").addEventListener("click",()=>{hintsOn=!hintsOn;render();});
$("cardInspectClose").addEventListener("click",closeInspect);
document.addEventListener?.("keydown",event=>{
 if(event.key==="Escape"){
  if(inspectingCard){closeInspect();return;}
  if(guideOpen){guideOpen=false;render();}
 }
});
$("guideClose").addEventListener("click",()=>{
 guideOpen=false;render();$("guideToggle").focus?.();
});
$("lang").addEventListener("change",()=>{lang=$("lang").value;render();if(inspectingCard)openInspect(inspectingCard);});
function newRound(){
 round++;
 game=startRound({dealer});
 selected=null;selectedTarget=null;locked=false;
 introOpen=true;roleFlashActive=false;
 yakuSeen=[scoreCards([]),scoreCards([])];
 playbackMessage="";playbackPhase=null;revealedDraw=null;
 $("yakuFlash").hidden=true;$("drawReveal").hidden=true;
 $("playStage").hidden=true;
 render();
 $("beginRound").focus?.();
}
async function enterRound(){
 if(!introOpen||locked||!game)return;
 introOpen=false;firstParentDraw=null;
 if(game.phase==="ended"){render();$("next").focus?.();return;}
 locked=true;
 playbackPhase="opening";
 playbackMessage=lang==="ja"?"場札・手札を配っています。":"Dealing field cards and both hands.";
 render();
 for(const [id,cls] of [["field","field"],["yourHand","your-hand"],
  ["opponentHand","opponent-hand"]])$(id).className=cls+" dealing";
 try{await beatPause(850);}
 finally{
  for(const [id,cls] of [["field","field"],["yourHand","your-hand"],
   ["opponentHand","opponent-hand"]])$(id).className=cls;
  playbackPhase=null;playbackMessage="";locked=false;
  render();
 }
 await withAction(async()=>{await runBot();});
}
$("beginRound").addEventListener("click",()=>{void enterRound();});
$("start").addEventListener("click",()=>{
 if(locked)return;
 matchTotal=Number($("rounds").value);scores=[0,0];round=0;
 firstParentDraw=chooseInitialDealer();
 dealer=firstParentDraw.dealer;
 newRound();
});
$("stop").addEventListener("click",()=>{void withAction(async()=>{decide(game,"stop");});});
$("koi").addEventListener("click",()=>{void withAction(async()=>{decide(game,"koi");});});
$("next").addEventListener("click",()=>{
 if(locked||!game||game.phase!=="ended"||round>=matchTotal)return;
 dealer=game.winner===null?1-game.dealer:game.winner;
 newRound();
});
$("new").addEventListener("click",()=>{
 if(locked)return;
 game=null;selected=null;selectedTarget=null;round=0;scores=[0,0];
 introOpen=false;firstParentDraw=null;playbackPhase=null;playbackMessage="";
 roleFlashActive=false;$("yakuFlash").hidden=true;render();
});
render();
