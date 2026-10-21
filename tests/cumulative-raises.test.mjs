import test from "node:test";
import assert from "node:assert/strict";
import {createTable,startHand,act,legalActions,fullDeck,assertConservation} from "../packages/poker/engine.js";
import {createSession,startSessionHand,sessionAction,serializeSession,restoreSession} from "../packages/poker/session.js";

const roster=()=>Array.from({length:4},(_,i)=>({id:"p"+i,name:"Seat "+i}));
function table(bbStack=18){
 const t=createTable({players:roster(),startingChips:100,smallBlind:1,bigBlind:2});
 t.players[1].stack=12;
 t.players[2].stack=bbStack;
 t.minted=100+12+bbStack+100;
 startHand(t,{deck:fullDeck()});
 return t;
}
function move(t,kind,target){
 const legal=legalActions(t);
 assert.ok(legal,"expected another action");
 act(t,legal.playerId,kind,target);
 assertConservation(t);
 return legal;
}
test("two cumulative short all-ins together reopen original raiser's betting rights",()=>{
 const t=table(18);
 // 4-handed: button 0, SB 1, BB 2, first acting UTG 3
 assert.equal(legalActions(t).seat,3);
 move(t,"raise",10); // 8 chip full raise over BB=2
 move(t,"call"); // button 0 has voluntarily acted at bet level 10
 assert.equal(legalActions(t).seat,1);
 move(t,"raise",12); // SB short all-in: +2, not a full raise
 assert.equal(legalActions(t).seat,2);
 move(t,"raise",18); // BB short all-in: +6, total new increase = 8
 const reconsider=legalActions(t);
 assert.equal(reconsider.seat,3);
 assert.equal(reconsider.toCall,8);
 assert.equal(reconsider.canRaise,true,"cumulative +8 must reopen betting");
 assert.equal(reconsider.minRaiseTo,26);
 move(t,"raise",26);
 const again=legalActions(t);
 assert.equal(again.seat,0);
 assert.equal(again.canRaise,true);
 assert.equal(again.minRaiseTo,34);
});
test("short all-ins whose cumulative increment is insufficient do not reopen an earlier raiser",()=>{
 const t=table(17);
 move(t,"raise",10);
 move(t,"call");
 move(t,"raise",12); // +2
 move(t,"raise",17); // +5, sum +7 < last full raise +8
 const raiser=legalActions(t);
 assert.equal(raiser.seat,3);
 assert.equal(raiser.toCall,7);
 assert.equal(raiser.canRaise,false);
 assert.throws(()=>act(t,raiser.playerId,"raise",27),/Invalid raise/);
 move(t,"call");
 const earlierCaller=legalActions(t);
 assert.equal(earlierCaller.seat,0);
 assert.equal(earlierCaller.canRaise,false);
 move(t,"call");
 assert.equal(t.hand.streetName,"flop");
 assert.deepEqual(t.hand.lastActedBet,[null,null,null,null],"next street must clear action history");
 assertConservation(t);
});
test("betting rights reset when street changes",()=>{
 const t=createTable({players:roster().slice(0,2),startingChips:100,smallBlind:1,bigBlind:2});
 startHand(t,{deck:fullDeck()});
 move(t,"call");
 assert.equal(legalActions(t).seat,1);
 assert.equal(legalActions(t).canRaise,true,"BB option remains when it has not voluntarily acted");
 move(t,"check");
 assert.equal(t.hand.streetName,"flop");
 assert.deepEqual(t.hand.lastActedBet,[null,null]);
 assert.equal(legalActions(t).canRaise,true);
});
test("session journal preserves the new per-street action tracking",()=>{
 const normal=createSession({players:roster(),startingChips:100,smallBlind:1,bigBlind:2,rebuy:true});
 startSessionHand(normal,fullDeck());
 let count=0;
 while(normal.table.hand.status==="betting"){
  if(++count>80)throw Error("betting did not finish");
  const legal=legalActions(normal.table);
  sessionAction(normal,legal.playerId,legal.toCall?"call":"check");
 }
 const restored=restoreSession(serializeSession(normal));
 assert.deepEqual(restored.table,normal.table);
 assertConservation(restored.table);
});
