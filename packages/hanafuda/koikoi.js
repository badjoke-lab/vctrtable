/**
 * Hanafuda (koi-koi) rules kernel for local QA, not an authenticated PvP dealer.
 * All card/deck state is private to this module's caller. NEVER send it over
 * WebXDC group status updates. Rule reference:
 * https://www.nintendo.com/jp/others/hanafuda_kabufuda/howtoplay/koikoi/
 */
const MONTHS = [
  ["Pine","松","🌲"],["Plum","梅","🌸"],["Cherry","桜","🌸"],
  ["Wisteria","藤","🪻"],["Iris","菖蒲","🌿"],["Peony","牡丹","🌺"],
  ["Bush clover","萩","🌿"],["Pampas","芒","🌾"],["Chrysanthemum","菊","🌼"],
  ["Maple","紅葉","🍁"],["Willow","柳","🌿"],["Paulownia","桐","🌿"]
];
// 4 cards for each month. h=bright, a=animal/seed, t=ribbon, k=plain.
const TYPES = [
  [["h","crane"],["t","red"],["k","plain1"],["k","plain2"]],
  [["a","warbler"],["t","red"],["k","plain1"],["k","plain2"]],
  [["h","curtain"],["t","red"],["k","plain1"],["k","plain2"]],
  [["a","cuckoo"],["t","plain"],["k","plain1"],["k","plain2"]],
  [["a","bridge"],["t","plain"],["k","plain1"],["k","plain2"]],
  [["a","butterfly"],["t","blue"],["k","plain1"],["k","plain2"]],
  [["a","boar"],["t","plain"],["k","plain1"],["k","plain2"]],
  [["h","moon"],["a","geese"],["k","plain1"],["k","plain2"]],
  [["a","cup"],["t","blue"],["k","plain1"],["k","plain2"]],
  [["a","deer"],["t","blue"],["k","plain1"],["k","plain2"]],
  [["h","rain"],["a","swallow"],["t","plain"],["k","plain"]],
  [["h","phoenix"],["k","plain1"],["k","plain2"],["k","plain3"]]
];
export const CARDS = Object.freeze(TYPES.flatMap((monthCards, m) =>
  monthCards.map(([type, name], i) => Object.freeze({
    id: `${m+1}-${i+1}`, month: m+1, index: i+1, type, name,
    monthEn: MONTHS[m][0], monthJa: MONTHS[m][1], symbol: MONTHS[m][2]
  }))
));
export const cardById = id => CARDS.find(c => c.id === id);
function has(ids, id) { return ids.includes(id); }

/** A yaku evaluator (counts the sake cup as both seed and plain for counting). */
export function scoreCards(captured) {
  const cards = captured.map(id => {
    const c = cardById(id);
    if (!c) throw new Error("Unknown card: " + id);
    return c;
  });
  const ids = cards.map(c => c.id);
  const h = cards.filter(c => c.type === "h").length;
  const a = cards.filter(c => c.type === "a").length;
  const t = cards.filter(c => c.type === "t").length;
  const k = cards.filter(c => c.type === "k").length + Number(has(ids,"9-1"));
  const yaku = [];
  const add = (key, points) => yaku.push({key, points});
  if (h === 5) add("goko",10);
  else if (h === 4) add(has(ids,"11-1") ? "ame-shiko":"shiko",has(ids,"11-1") ? 7:8);
  else if (h === 3 && !has(ids,"11-1")) add("sanko",5);
  if (["7-1","10-1","6-1"].every(id => has(ids,id))) add("inoshikacho",5);
  if (["1-2","2-2","3-2"].every(id => has(ids,id))) add("akatan",5);
  if (["6-2","9-2","10-2"].every(id => has(ids,id))) add("aotan",5);
  if (has(ids,"3-1") && has(ids,"9-1")) add("hanami",5);
  if (has(ids,"8-1") && has(ids,"9-1")) add("tsukimi",5);
  if (a >= 5) add("tane",a-4);
  if (t >= 5) add("tan",t-4);
  if (k >= 10) add("kasu",k-9);
  return {yaku, points:yaku.reduce((sum,y)=>sum+y.points,0), counts:{h,a,t,k}};
}
function assert(condition,reason) { if (!condition) throw new Error(reason); }
export function shuffleCards(rng=Math.random) {
  const ids=CARDS.map(c=>c.id);
  for (let i=ids.length-1;i>0;i--) {
    const r=rng();
    assert(Number.isFinite(r) && r>=0 && r<1,"RNG must return [0,1)");
    const j=Math.floor(r*(i+1));
    [ids[i],ids[j]]=[ids[j],ids[i]];
  }
  return ids;
}
function initialBonus(hand) {
  const counts=new Map();
  for (const id of hand) {
    const m=cardById(id).month;
    counts.set(m,(counts.get(m)||0)+1);
  }
  return [...counts.values()].includes(4) || [...counts.values()].filter(n=>n===2).length===4;
}
export function startRound({dealer=0,rng=Math.random}={}) {
  assert([0,1].includes(dealer),"Bad dealer");
  for(let attempt=0;attempt<1000;attempt++) {
    const shuffled=shuffleCards(rng);
    const hands=[shuffled.slice(0,8),shuffled.slice(8,16)];
    const field=shuffled.slice(16,24);
    const fieldMonths=field.map(id=>cardById(id).month);
    if (fieldMonths.some(m=>fieldMonths.filter(n=>m===n).length===4)) continue;
    const s={hands,field,deck:shuffled.slice(24),captured:[[],[]],active:dealer,
      dealer,phase:"turn",pending:null,koiedBy:null,offered:[0,0],winner:null,
      points:0,turns:0,endedReason:null,log:[]};
    const bonus=[initialBonus(hands[0]),initialBonus(hands[1])];
    if (bonus.some(Boolean)) {
      const winner=bonus[dealer] ? dealer:1-dealer;
      finish(s,winner,6,"initial-bonus");
    }
    return s;
  }
  throw new Error("Unable to deal a valid round");
}
function finish(s,winner,points,reason) {
  s.phase="ended";s.pending=null;s.winner=winner;s.points=points;
  s.endedReason=reason;
  s.log.push({kind:"end",winner,points,reason});
}
function captureOrPlace(s,cardId,step) {
  const c=cardById(cardId);
  const matching=s.field.filter(id=>cardById(id).month===c.month);
  if(matching.length===0) {s.field.push(cardId);return false;}
  if(matching.length===2) {
    s.pending={step,cardId,choices:matching.slice()};
    s.phase="choose";
    return true;
  }
  const takes=matching.length===3?matching:[matching[0]];
  s.field=s.field.filter(id=>!takes.includes(id));
  s.captured[s.active].push(cardId,...takes);
  return false;
}
function draw(s) {
  assert(s.deck.length>0,"Empty deck");
  const cardId=s.deck.shift();
  s.log.push({kind:"draw",seat:s.active,cardId}); // local-only QA log; never broadcast
  if(!captureOrPlace(s,cardId,"draw")) completeTurn(s);
}
function completeTurn(s) {
  s.turns++;
  const score=scoreCards(s.captured[s.active]).points;
  if(s.koiedBy!==null && s.koiedBy!==s.active && score>0) {
    settle(s,s.active,"koi-counter");return;
  }
  if(score>s.offered[s.active]) {s.phase="decision";return;}
  if(s.hands[0].length===0 && s.hands[1].length===0) {finish(s,null,0,"exhausted");return;}
  s.active=1-s.active;s.phase="turn";
}
function settle(s,winner,reason) {
  const base=scoreCards(s.captured[winner]).points;
  const multiplier=(base>=7?2:1)*(s.koiedBy!==null && s.koiedBy!==winner ? 2:1);
  finish(s,winner,base*multiplier,reason);
}
export function playCard(s,id) {
  assert(s.phase==="turn","Not waiting for card");
  assert(s.hands[s.active].includes(id),"Card is not in current hand");
  s.hands[s.active].splice(s.hands[s.active].indexOf(id),1);
  s.log.push({kind:"play",seat:s.active,cardId:id});
  if(!captureOrPlace(s,id,"hand")) draw(s);
  return s;
}
export function chooseTarget(s,id) {
  assert(s.phase==="choose" && s.pending,"Not selecting field card");
  assert(s.pending.choices.includes(id),"Illegal field target");
  const {step,cardId}=s.pending;
  s.pending=null;
  s.field.splice(s.field.indexOf(id),1);
  s.captured[s.active].push(cardId,id);
  s.log.push({kind:"target",seat:s.active,cardId:id});
  s.phase="turn";
  if(step==="hand") draw(s); else completeTurn(s);
  return s;
}
export function decide(s,choice) {
  assert(s.phase==="decision","No koi-koi decision");
  assert(choice==="stop"||choice==="koi","Expected stop or koi");
  if(choice==="stop") {settle(s,s.active,"stop");return s;}
  s.koiedBy=s.active;
  s.offered[s.active]=scoreCards(s.captured[s.active]).points;
  s.log.push({kind:"koi",seat:s.active,score:s.offered[s.active]});
  if(s.hands[0].length===0&&s.hands[1].length===0) finish(s,null,0,"exhausted");
  else {s.active=1-s.active;s.phase="turn";}
  return s;
}
export function getPublicState(s) {
  // Never send the private round object. This view excludes deck order / hand IDs.
  return {field:s.field.slice(),captured:s.captured.map(a=>a.slice()),
    handCounts:s.hands.map(a=>a.length),deckCount:s.deck.length,
    active:s.active,dealer:s.dealer,phase:s.phase,koiedBy:s.koiedBy,
    winner:s.winner,points:s.points,endedReason:s.endedReason,turns:s.turns};
}
