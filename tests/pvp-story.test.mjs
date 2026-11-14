import test from "node:test";
import assert from "node:assert/strict";
import {describePokerTransition as event,stageFor,POKER_STAGES} from "../apps/poker/pvp-story.js";
const player=(id,extra={})=>({id,name:id,stack:990,street:0,total:10,folded:false,inHand:true,...extra});
const snap=(extra={})=>({seq:1,number:2,status:"betting",street:"preflop",board:[],turn:0,pot:20,
 players:[player("host"),player("guest")],awards:null,_room:"table-1",...extra});
test("new hand deals only on new hand; late replay is a sync",()=>{
 assert.equal(event(null,snap(),"guest").type,"deal");
 assert.deepEqual(event(null,snap(),"guest").newBoardIndices,[]);
 assert.equal(event(snap(),snap({number:3}),"host").dealHand,true);
 assert.equal(event(null,snap({board:["AS","2H","3D"],street:"flop"}),"host").type,"sync");
 assert.equal(event(snap(),snap({seq:2}),"guest"),null);
});
test("each actual street reveals only newly public card positions",()=>{
 const p=snap();
 const flop=snap({seq:2,street:"flop",board:["AS","2H","3D"]});
 assert.deepEqual(event(p,flop,"host").newBoardIndices,[0,1,2]);
 assert.equal(event(p,flop,"host").title,"FLOP");
 const turn=snap({seq:3,street:"turn",board:[...flop.board,"KH"]});
 assert.deepEqual(event(flop,turn,"host").newBoardIndices,[3]);
 assert.equal(event(flop,turn,"host").title,"TURN");
 const river=snap({seq:4,street:"river",board:[...turn.board,"4D"]});
 assert.deepEqual(event(turn,river,"host").newBoardIndices,[4]);
 assert.equal(event(turn,river,"host").title,"RIVER");
 assert.deepEqual(POKER_STAGES,["preflop","flop","turn","river","complete"]);
 assert.equal(stageFor(snap({status:"complete",street:"river"})),"complete");
});
test("money and folding cues rely on signed public state delta",()=>{
 const a=snap();
 const pot=snap({seq:2,pot:40,players:[player("host",{stack:970,total:30}),player("guest")]});
 const paid=event(a,pot,"guest");
 assert.equal(paid.title,"CHIPS IN");
 assert.equal(paid.potBump,true);
 assert.deepEqual(paid.changedSeats,["host"]);
 assert.match(paid.detail,/\+20/);
 const fold=snap({seq:2,players:[player("host"),player("guest",{folded:true})]});
 assert.equal(event(a,fold,"guest").title,"FOLD");
 assert.deepEqual(event(a,fold,"guest").changedSeats,["guest"]);
});
test("turn change, clocks and showdown do not invent bets or winners",()=>{
 const a=snap();
 const b=snap({seq:2,turn:1});
 assert.equal(event(a,b,"guest").title,"YOUR TURN");
 assert.equal(event(a,b,"host").title,"NEXT PLAYER");
 assert.equal(event(a,snap({seq:2,turnClock:{deadlineAt:123}}),"guest"),null);
 const complete=snap({seq:9,status:"complete",street:"river",
  board:["AS","2H","3D","4S","5C"],awards:[0,120]});
 const result=event(snap({seq:8,status:"betting",street:"river",board:complete.board}),complete,"guest");
 assert.equal(result.title,"SHOWDOWN");
 assert.match(result.detail,/guest/);
 assert.match(result.detail,/120/);
 const folded=snap({seq:8,status:"complete",street:"preflop",awards:[20,0],
  players:[player("host"),player("guest",{folded:true})]});
 assert.equal(event(a,folded,"host").title,"HAND WON");
});
