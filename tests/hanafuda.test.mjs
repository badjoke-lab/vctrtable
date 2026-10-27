import test from "node:test";
import assert from "node:assert/strict";
import {
 CARDS,cardById,shuffleCards,scoreCards,startRound,chooseInitialDealer,initialBonusKind,playCard,chooseTarget,
 decide,drawNextCard,getPublicState
} from "../packages/hanafuda/koikoi.js";
const random = seed => () => ((seed = (seed*1664525 + 1013904223) >>> 0) / 4294967296);
test("48 unique cards, four of each month, correct type counts",()=>{
 assert.equal(CARDS.length,48);
 assert.equal(new Set(CARDS.map(c=>c.id)).size,48);
 for(let m=1;m<=12;m++) assert.equal(CARDS.filter(c=>c.month===m).length,4);
 for(const [type,n] of [["h",5],["a",9],["t",10],["k",24]])
   assert.equal(CARDS.filter(c=>c.type===type).length,n);
 assert.equal(cardById("9-1").name,"cup");
});
test("seeded shuffle preserves the full deck",()=>{
 const deck=shuffleCards(random(7));
 assert.deepEqual(deck.slice().sort(),CARDS.map(c=>c.id).sort());
 assert.deepEqual(deck,shuffleCards(random(7)));
});
test("bright roles are mutually exclusive",()=>{
 assert.deepEqual(scoreCards(["1-1","3-1","8-1"]).yaku.map(y=>y.key),["sanko"]);
 assert.deepEqual(scoreCards(["1-1","3-1","8-1","12-1"]).yaku.map(y=>y.key),["shiko"]);
 assert.deepEqual(scoreCards(["1-1","3-1","8-1","11-1"]).yaku.map(y=>y.key),["ame-shiko"]);
 assert.deepEqual(scoreCards(["1-1","3-1","8-1","11-1","12-1"]).yaku.map(y=>y.key),["goko"]);
});
test("traditional combos and sake cup dual-count",()=>{
 assert.equal(scoreCards(["7-1","10-1","6-1"]).points,5);
 assert.equal(scoreCards(["1-2","2-2","3-2"]).points,5);
 assert.equal(scoreCards(["6-2","9-2","10-2"]).points,5);
 assert.equal(scoreCards(["3-1","9-1"]).points,5);
 assert.equal(scoreCards(["8-1","9-1"]).points,5);
 const plain=CARDS.filter(c=>c.type==="k").slice(0,9).map(c=>c.id);
 const s=scoreCards([...plain,"9-1"]);
 assert.equal(s.counts.k,10);
 assert.ok(s.yaku.some(y=>y.key==="kasu"&&y.points===1));
});
test("initial hands and public view preserve the secrecy boundary",()=>{
 const s=startRound({rng:random(219)});
 assert.deepEqual(s.hands.map(h=>h.length),[8,8]);
 assert.equal(s.field.length,8);assert.equal(s.deck.length,24);
 assert.equal(new Set([...s.hands.flat(),...s.field,...s.deck]).size,48);
 const pub=getPublicState(s);
 for (const key of ["hands","deck","pending","log","offered"])
   assert.equal(Object.hasOwn(pub,key),false,key);
});
test("playing same-month card collects and hand move draws",()=>{
 const s=startRound({rng:random(1)});
 if(s.phase==="ended") return; // initial-bonus deal
 s.active=0;s.phase="turn";s.field=["2-1"];
 s.hands[0]=["2-2"];
 const deckCount=s.deck.length;
 playCard(s,"2-2");
 assert.equal(s.deck.length,deckCount-1);
 assert.ok(s.captured[0].includes("2-1"));
 assert.ok(s.captured[0].includes("2-2"));
});
test("two matching field cards require choosing an exact target",()=>{
 const s=startRound({rng:random(2)});
 s.phase="turn";s.active=0;s.field=["2-1","2-2"];
 s.hands[0]=["2-3"]; s.deck=["7-2",...s.deck];
 playCard(s,"2-3");
 assert.equal(s.phase,"choose");
 assert.deepEqual(s.pending.choices,["2-1","2-2"]);
 assert.throws(()=>chooseTarget(s,"3-1"),/Illegal/);
 chooseTarget(s,"2-1");
 assert.ok(s.captured[0].includes("2-3"));
 assert.ok(s.captured[0].includes("2-1"));
 assert.ok(!s.captured[0].includes("2-2"));
});
test("fourth same-month card collects all 4",()=>{
 const s=startRound({rng:random(3)});
 s.phase="turn";s.active=0;s.field=["4-1","4-2","4-3"];
 s.hands[0]=["4-4"];s.deck=["7-2",...s.deck];
 playCard(s,"4-4");
 for(const id of ["4-1","4-2","4-3","4-4"])
   assert.ok(s.captured[0].includes(id));
});
test("a completed yaku offers stop or koi; stop settles round",()=>{
 const s=startRound({rng:random(8)});
 s.active=0;s.phase="turn";s.field=["1-2"];
 s.hands[0]=["1-1"];s.captured[0]=["3-1","8-1"];
 s.deck=["7-2",...s.deck];
 playCard(s,"1-1");
 assert.equal(s.phase,"decision");
 decide(s,"stop");
 assert.equal(s.phase,"ended");assert.equal(s.winner,0);
 assert.equal(s.points,5);
});
test("koi-koi risks doubled counter score",()=>{
 const s=startRound({rng:random(9)});
 s.active=0;s.phase="decision";s.captured[0]=["1-1","3-1","8-1"];
 decide(s,"koi");
 assert.equal(s.phase,"turn");assert.equal(s.active,1);
 s.captured[1]=["1-2","2-2","3-2"];
 s.field=["4-1"]; s.hands[1]=["4-2"];s.deck=["7-2",...s.deck];
 playCard(s,"4-2");
 assert.equal(s.phase,"ended");assert.equal(s.winner,1);
 assert.equal(s.points,10);
});
test("scripted local rounds always finish with valid points",()=>{
 for(let seed=1;seed<=25;seed++) {
   const s=startRound({rng:random(seed)});
   for(let steps=0;s.phase!=="ended" && steps<100;steps++) {
     if(s.phase==="turn") playCard(s,s.hands[s.active][0]);
     else if(s.phase==="choose") chooseTarget(s,s.pending.choices[0]);
     else if(s.phase==="decision") decide(s,"stop");
     else assert.fail("unknown phase");
   }
   assert.equal(s.phase,"ended",`seed ${seed}`);
   assert.ok(s.winner===null||[0,1].includes(s.winner));
   assert.ok(s.points>=0);
 }
});

test("koi-koi cannot forfeit points after all remaining turns are gone",()=>{
 const s=startRound({rng:random(33)});
 s.phase="decision";s.active=0;s.hands=[[],[]];
 s.captured[0]=["1-1","3-1","8-1"];
 assert.throws(()=>decide(s,"koi"),/No remaining turns/);
 decide(s,"stop");
 assert.equal(s.winner,0);assert.equal(s.points,5);
});

test("deferred draw separates hand play, visual beat and mandatory draw",()=>{
 const s=startRound({rng:random(81)});
 s.active=0;s.phase="turn";s.field=["2-1"];s.hands[0]=["2-2"];
 s.deck=["9-2",...s.deck.filter(id=>id!=="9-2")];
 const before=s.deck.length;
 playCard(s,"2-2",{deferDraw:true});
 assert.equal(s.phase,"draw-pending");
 assert.equal(s.deck.length,before);
 assert.ok(s.captured[0].includes("2-1"));
 assert.throws(()=>playCard(s,"2-2"),/Not waiting/);
 drawNextCard(s);
 assert.equal(s.deck.length,before-1);
});
test("deferred two-match hand choice waits to draw until selection",()=>{
 const s=startRound({rng:random(82)});
 s.active=0;s.phase="turn";s.field=["7-1","7-2"];s.hands[0]=["7-3"];
 s.deck=["9-2",...s.deck.filter(id=>id!=="9-2")];
 const before=s.deck.length;
 playCard(s,"7-3",{deferDraw:true});
 assert.equal(s.phase,"choose");assert.equal(s.pending.step,"hand");
 chooseTarget(s,"7-1",{deferDraw:true});
 assert.equal(s.phase,"draw-pending");
 assert.equal(s.deck.length,before);
 drawNextCard(s);
 assert.equal(s.deck.length,before-1);
});

test("Parent is selected by earlier revealed month rather than unexplained random coin flip",()=>{
 for(let seed=1;seed<=80;seed++){
  const dealer=chooseInitialDealer(random(seed));
  assert.ok([0,1].includes(dealer.dealer));
  const [you,other]=dealer.monthBySeat;
  assert.notEqual(you,other);
  assert.equal(dealer.dealer,you<other?0:1);
 }
});
test("Six-point opening hands are classified for player-visible explanation",()=>{
 assert.equal(initialBonusKind(["1-1","1-2","1-3","1-4","2-1","3-1","4-1","5-1"]),"teshi");
 assert.equal(initialBonusKind(["1-1","1-2","2-1","2-2","3-1","3-2","4-1","4-2"]),"kuttsuki");
 assert.equal(initialBonusKind(["1-1","1-2","2-1","3-1","4-1","5-1","6-1","7-1"]),null);
});
test("After Koi-Koi, a new scoring point ENDS round instead of offering another Koi",()=>{
 const s=startRound({rng:random(81)});
 s.phase="decision";s.active=0;
 s.captured[0]=["2-1","4-1","5-1","6-1","7-1"]; // 5 seeds → 1 point
 decide(s,"koi");
 assert.equal(s.offered[0],1);
 s.active=0;s.phase="turn";
 s.field=["8-1"];s.hands[0]=["8-2"]; // 6th seed → 2 points
 s.deck=["9-2"];
 playCard(s,"8-2");
 assert.equal(s.phase,"ended");
 assert.equal(s.endedReason,"koi-improvement");
 assert.equal(s.winner,0);
 assert.equal(s.points,2);
 assert.ok(s.hands[0].length===0);
});
test("Exhausting both hands without claiming any score is no-game, not a silent win",()=>{
 const s=startRound({rng:random(82)});
 s.active=0;s.phase="turn";s.hands=[[ "4-3" ],[]];
 s.field=[];s.deck=["5-3"];s.captured=[[],[]];
 playCard(s,"4-3");
 assert.equal(s.phase,"ended");
 assert.equal(s.winner,null);
 assert.equal(s.points,0);
 assert.equal(s.endedReason,"exhausted");
});
test("Whole twelve-round match never silently truncates; only legal end reasons",()=>{
 const valid=new Set(["stop","koi-counter","koi-improvement","exhausted","initial-bonus"]);
 for(let match=1;match<=40;match++){
  let dealer=chooseInitialDealer(random(match*31)).dealer,scores=[0,0];
  for(let round=1;round<=12;round++){
   const s=startRound({dealer,rng:random(match*300+round)});
   let turns=0;
   while(s.phase!=="ended"&&turns++<110){
    if(s.phase==="turn")playCard(s,s.hands[s.active][0]);
    else if(s.phase==="choose")chooseTarget(s,s.pending.choices[0]);
    else if(s.phase==="decision"){
     const canContinue=s.hands.some(h=>h.length>0);
     decide(s,canContinue&&s.koiedBy===null&&round%2===0?"koi":"stop");
    }else assert.fail("Invalid phase "+s.phase);
   }
   assert.equal(s.phase,"ended","match "+match+" round "+round);
   assert.ok(valid.has(s.endedReason));
   if(s.winner!==null)scores[s.winner]+=s.points;
   dealer=s.winner===null?1-s.dealer:s.winner;
  }
  assert.ok(scores.every(v=>Number.isSafeInteger(v)&&v>=0));
 }
});
