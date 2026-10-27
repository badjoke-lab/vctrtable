import test from "node:test";
import assert from "node:assert/strict";
import {chooseBotMove,chooseBotDecision} from "../packages/hanafuda/bot.js";
import {startRound,playCard,chooseTarget,decide,scoreCards} from "../packages/hanafuda/koikoi.js";
const random=seed=>()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);

test("Local rival blocks a publicly visible near-complete 猪鹿蝶",()=>{
 const move=chooseBotMove({
  hand:["6-4","2-4"],field:["6-1","2-3"],
  captured:[],opponentCaptured:["7-1","10-1"]
 });
 assert.equal(move.cardId,"6-4");
 assert.deepEqual(move.capturedCards,["6-4","6-1"]);
});
test("Local rival does not throw a unique yaku card into the field if safe alternative exists",()=>{
 const move=chooseBotMove({
  hand:["6-1","4-4"],field:["8-2","9-2"],
  captured:[],opponentCaptured:["7-1","10-1"]
 });
 assert.equal(move.cardId,"4-4");
 assert.equal(move.targetId,null);
});
test("When exactly two field cards match, the rival deliberately chooses the valuable target",()=>{
 const move=chooseBotMove({
  hand:["1-3"],field:["1-1","1-4"],
  captured:[],opponentCaptured:[]
 });
 assert.equal(move.cardId,"1-3");
 assert.equal(move.targetId,"1-1");
 assert.ok(move.capturedCards.includes("1-1"));
});
test("Local rival stops instead of gambling when opponent visibly needs one scoring card",()=>{
 assert.equal(chooseBotDecision({
  points:2,hand:["2-3","4-4","6-4","8-2"],captured:[],
  opponentCaptured:["7-1","10-1"]
 }),"stop");
 assert.equal(chooseBotDecision({
  points:2,hand:["2-3","4-4","6-4","8-2"],captured:[],
  opponentCaptured:[]
 }),"koi");
});
test("Rival can never read an opponent hand/deck even if poison getters are supplied",()=>{
 const options={
  hand:["1-3"],field:["1-1"],captured:[],opponentCaptured:[]
 };
 Object.defineProperty(options,"opponentHand",{get(){throw Error("private opponent hand accessed");}});
 Object.defineProperty(options,"deck",{get(){throw Error("private deck accessed");}});
 assert.equal(chooseBotMove(options).cardId,"1-3");
});
test("Fair bot makes legal decisions through 100 full rounds with no infinite turns",()=>{
 let completed=0;
 for(let seed=1;seed<=100;seed++){
  const s=startRound({rng:random(550+seed)});
  let steps=0;
  while(s.phase!=="ended"&&steps++<80){
   if(s.phase==="turn"){
    const seat=s.active;
    const move=chooseBotMove({
     hand:s.hands[seat],field:s.field,captured:s.captured[seat],
     opponentCaptured:s.captured[1-seat]
    });
    playCard(s,move.cardId);
    if(s.phase==="choose"&&s.pending.step==="hand")
     chooseTarget(s,move.targetId);
   }else if(s.phase==="choose"){
    chooseTarget(s,s.pending.choices[0]);
   }else if(s.phase==="decision"){
    decide(s,chooseBotDecision({
     points:scoreCards(s.captured[s.active]).points,
     hand:s.hands[s.active],
     captured:s.captured[s.active],opponentCaptured:s.captured[1-s.active]
    }));
   }else assert.fail("unexpected phase "+s.phase);
  }
  assert.equal(s.phase,"ended","seed "+seed+" got stuck");
  completed++;
 }
 assert.equal(completed,100);
});
