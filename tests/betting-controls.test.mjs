import test from "node:test";
import assert from "node:assert/strict";
import {bettingControls} from "../packages/poker/betting-controls.js";
import {createTable,startHand,act,legalActions,fullDeck,assertConservation} from "../packages/poker/engine.js";
const people=()=>[{id:"a",name:"Alice"},{id:"b",name:"Bob"}];
test("Call button displays ACTUAL chips payable, not the full opponent bet",()=>{
 const t=createTable({players:people(),startingChips:100,smallBlind:1,bigBlind:2});
 t.players[0].stack=3;t.minted=103;
 startHand(t,{deck:fullDeck()});
 act(t,legalActions(t).playerId,"call"); // SB pays 1 more, remaining stack 1
 act(t,legalActions(t).playerId,"raise",8); // BB raises far above short stack
 const L=legalActions(t);
 assert.equal(L.playerId,"a");
 assert.equal(L.toCall,6);
 assert.equal(L.stack,1);
 const ui=bettingControls(L,{pot:t.hand.players.reduce((n,p)=>n+p.total,0),currentBet:t.hand.currentBet});
 assert.equal(ui.callAmount,1);
 assert.equal(ui.isAllInCall,true);
 assert.deepEqual(ui.allIn,{kind:"call",target:null});
 assert.equal(ui.presets,null);
 act(t,L.playerId,ui.allIn.kind);
 assert.equal(t.hand.status,"complete");
 assertConservation(t);
});
test("All-in button raises when legal and offers correct maximum street-total amount",()=>{
 const t=createTable({players:people(),startingChips:100,smallBlind:1,bigBlind:2});
 startHand(t,{deck:fullDeck()});
 const L=legalActions(t);
 const ui=bettingControls(L,{pot:3,currentBet:2});
 assert.equal(ui.callAmount,1);
 assert.equal(ui.isAllInCall,false);
 assert.deepEqual(ui.allIn,{kind:"raise",target:100});
 assert.deepEqual(ui.presets,{min:4,half:4,pot:6,max:100});
 act(t,L.playerId,ui.allIn.kind,ui.allIn.target);
 assert.equal(t.hand.players[0].stack,0);
 assertConservation(t);
});
test("Half-pot/pot presets use raise-to totals, clamp to legal min/max",()=>{
 const L={stack:30,toCall:5,canCall:true,canRaise:true,minRaiseTo:26,maxRaiseTo:35};
 const ui=bettingControls(L,{pot:100,currentBet:20});
 assert.deepEqual(ui.presets,{min:26,half:35,pot:35,max:35});
 const small=bettingControls({...L,maxRaiseTo:23,minRaiseTo:26},{pot:20,currentBet:20});
 assert.deepEqual(small.presets,{min:23,half:23,pot:23,max:23});
});
test("Cannot trigger All-in when there is neither a legal raise nor an all-in call",()=>{
 assert.deepEqual(bettingControls(null),{callAmount:0,isAllInCall:false,allIn:null,presets:null});
 const x=bettingControls({stack:5,toCall:3,canCall:true,canRaise:false,minRaiseTo:10,maxRaiseTo:5});
 assert.equal(x.callAmount,3);
 assert.equal(x.allIn,null);
 const y=bettingControls({stack:5,toCall:0,canCall:false,canRaise:false,minRaiseTo:10,maxRaiseTo:5});
 assert.equal(y.allIn,null);
});
