import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {createSession,startSessionHand,sessionAction} from "../packages/poker/session.js";
import {legalActions} from "../packages/poker/engine.js";
import {reconcileTurnClock,timeoutAction,validTurnClock} from "../packages/poker/pvp-turn-clock.js";
globalThis.crypto??=webcrypto;
const session=()=>{
 const s=createSession({players:[{id:"alice",name:"Alice"},{id:"bob",name:"Bob"}],
  startingChips:1000,smallBlind:5,bigBlind:10,rebuy:true});
 startSessionHand(s);
 return s;
};
test("host enforces fold on expired facing-bet turn, once",()=>{
 const s=session(),L=legalActions(s.table);
 assert.ok(L.toCall>0);
 const c=reconcileTurnClock(s,30,false,null,1000);
 assert.equal(c.deadlineAt,31000);
 assert.equal(timeoutAction(s,c,30999),null);
 assert.deepEqual(timeoutAction(s,c,31000),{playerId:L.playerId,action:"fold"});
 sessionAction(s,L.playerId,"fold");
 assert.equal(s.table.hand.status,"complete");
 assert.equal(timeoutAction(s,c,60000),null);
 assert.equal(reconcileTurnClock(s,30,false,c,60000),null);
});
test("expired free action checks, starts a distinct clock for the next turn",()=>{
 const s=session(),first=legalActions(s.table);
 sessionAction(s,first.playerId,"call");
 const L=legalActions(s.table);
 assert.equal(L.canCheck,true);
 const c=reconcileTurnClock(s,5,false,null,100);
 assert.deepEqual(timeoutAction(s,c,5100),{playerId:L.playerId,action:"check"});
 sessionAction(s,L.playerId,"check");
 const next=reconcileTurnClock(s,5,false,c,5100);
 assert.notEqual(next?.key,c.key);
 assert.equal(next?.deadlineAt,10100);
});
test("pending pause does not freeze; unanimous pause freezes and resume uses exact remainder",()=>{
 const s=session();
 let clock=reconcileTurnClock(s,30,false,null,10000);
 // No unanimous approval => the host must continue its current clock.
 assert.equal(reconcileTurnClock(s,30,false,clock,15000),clock);
 clock=reconcileTurnClock(s,30,true,clock,21000);
 assert.equal(clock.remainingMs,19000);
 assert.equal(clock.deadlineAt,null);
 assert.equal(timeoutAction(s,clock,999999),null);
 clock=reconcileTurnClock(s,30,false,clock,70000);
 assert.equal(clock.deadlineAt,89000);
 assert.equal(timeoutAction(s,clock,88999),null);
 assert.ok(timeoutAction(s,clock,89000));
});
test("unlimited actions, persisted clock shape and malformed clocks",()=>{
 const s=session();
 assert.equal(reconcileTurnClock(s,0,false,null,0),null);
 const c=reconcileTurnClock(s,12,false,null,1_000_000);
 assert.ok(validTurnClock(structuredClone(c)));
 assert.deepEqual(reconcileTurnClock(s,12,false,structuredClone(c),1000001),c);
 assert.equal(validTurnClock({...c,deadlineAt:"tomorrow"}),false);
 assert.equal(validTurnClock({...c,seconds:-1}),false);
 assert.throws(()=>reconcileTurnClock(s,3601,false,null,1000),/Invalid host clock/);
});
