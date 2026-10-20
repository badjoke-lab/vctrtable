import test from "node:test";
import assert from "node:assert/strict";
import {AuthoritativeRoom,RoomError} from "../packages/poker/dealer-room.js";
import {fullDeck, assertConservation, legalActions} from "../packages/poker/engine.js";

const seats=n=>Array.from({length:n},(_,i)=>({id:"player-"+i,name:"Player "+i}));
function setup(n=2,actionSeconds=12){
 let now=1000,serial=0;
 const room=new AuthoritativeRoom({roomId:"private-test-room",players:seats(n),clock:()=>now,dealDeck:()=>fullDeck()});
 const send=(seat,op,opts={})=>room.command({
  actorId:"player-"+seat,
  requestId:opts.id??"req-"+(++serial),
  expectedRevision:opts.revision??room.revision,
  op,now
 });
 const time=t=>{now=t;};
 send(0,{type:"propose",settings:{startingChips:100,smallBlind:1,bigBlind:2,rebuy:true,actionSeconds}});
 for(let i=1;i<n;i++)send(i,{type:"approve",proposalId:1});
 return {room,send,time};
}
test("proposal unanimous, config remains flexible, start produces authoritative hand",()=>{
 const {room,send}=setup(3,0);
 assert.equal(room.table.settings.actionSeconds,0);
 assert.deepEqual(room.members.map(p=>p.id),["player-0","player-1","player-2"]);
 send(1,{type:"startHand"});
 assert.equal(room.table.hand.status,"betting");
 assert.equal(room.publicState().settings.startingChips,100);
 assert.equal(room.publicState().hand.players.length,3);
 assertConservation(room.table);
});
test("room denies illegal proposals before game starts and locks rules afterward",()=>{
 const {room,send}=setup();
 assert.throws(()=>send(0,{type:"propose",settings:{startingChips:10,smallBlind:20,bigBlind:30,rebuy:true,actionSeconds:10}}),/RULES/);
 send(0,{type:"startHand"});
 assert.throws(()=>send(0,{type:"propose",settings:{startingChips:200,smallBlind:2,bigBlind:4,rebuy:false,actionSeconds:60}}),/LOCKED/);
});
test("secret deck and unrevealed hole cards never appear in broadcast public state",()=>{
 const {room,send}=setup();
 send(0,{type:"startHand"});
 const a=room.privateState("player-0"),b=room.privateState("player-1"),pub=room.publicState();
 assert.equal(a.privateFor,"player-0");
 assert.equal(a.ownHole.length,2);
 assert.equal(b.ownHole.length,2);
 assert.notDeepEqual(a.ownHole,b.ownHole);
 assert.equal(Object.hasOwn(pub,"ownHole"),false);
 assert.equal(Object.hasOwn(pub,"deck"),false);
 assert.equal(Object.hasOwn(pub,"legal"),false);
 assert.equal(Object.hasOwn(pub,"privateFor"),false);
 assert.equal(pub.hand.players.some(p=>Object.hasOwn(p,"shownCards")),false);
 const packet=JSON.stringify(pub);
 for(const card of [...a.ownHole,...b.ownHole])assert.ok(!packet.includes('"'+card+'"'),"premature hole-card leak: "+card);
 assert.deepEqual(room.privateState("player-0").legal?.playerId,"player-0");
 assert.equal(room.privateState("player-1").legal,null);
 assert.throws(()=>room.privateState("unknown"),/UNAUTHENTICATED/);
});
test("authenticated transport identity decides whose turn; client op cannot impersonate seat",()=>{
 const {room,send}=setup();
 send(0,{type:"startHand"});
 assert.throws(()=>room.command({actorId:"forged",requestId:"fake",expectedRevision:room.revision,op:{type:"act",action:"fold"},now:1000}),/UNAUTHENTICATED/);
 assert.throws(()=>send(1,{type:"act",action:"fold",playerId:"player-0"}),/OUT_OF_TURN/);
 assert.equal(room.table.hand.status,"betting");
 send(0,{type:"act",action:"fold"});
 assert.equal(room.table.hand.status,"complete");
 assertConservation(room.table);
});
test("stale revision rejected and same requestId cannot apply twice or change meaning",()=>{
 const {room,send}=setup();
 const rev=room.revision;
 const op={type:"startHand"};
 const first=send(0,op,{id:"stable"});
 assert.equal(first.revision,rev+1);
 assert.equal(send(0,op,{id:"stable",revision:rev}).replayed,true);
 assert.equal(room.table.hand.number,1);
 assert.throws(()=>send(0,{type:"act",action:"fold"},{id:"stable"}),/NONCE_REUSED/);
 assert.throws(()=>send(0,{type:"act",action:"fold"},{revision:rev}),/STALE/);
 assert.equal(room.table.hand.status,"betting");
});
test("unanimous pause has no limit; action and timer frozen until full resume vote",()=>{
 const {room,send,time}=setup(2,10);
 send(0,{type:"startHand"});
 assert.equal(room.publicState().deadlineAt,11000);
 time(4000);send(0,{type:"requestPause",mode:"pause"});
 assert.equal(room.publicState().pause.paused,false);
 time(5000);send(1,{type:"votePause",pauseId:1,approve:true});
 assert.equal(room.publicState().pause.paused,true);
 assert.equal(room.publicState().deadlineAt,null);
 const before=room.revision;
 time(2000000);
 assert.equal(room.tick(),false);
 assert.equal(room.revision,before);
 assert.throws(()=>send(0,{type:"act",action:"call"}),/ACTION_UNAVAILABLE/);
 send(0,{type:"requestPause",mode:"resume"});
 send(1,{type:"votePause",pauseId:2,approve:true});
 assert.equal(room.publicState().pause.paused,false);
 assert.equal(room.publicState().deadlineAt,2006000);
 time(2005999);assert.equal(room.tick(),false);
 time(2006000);assert.equal(room.tick(),true);
 assert.equal(room.table.hand.status,"complete"); // heads-up SB timed out facing big blind
 assertConservation(room.table);
});
test("pause request pending DOES NOT freeze hand; rejection cancels it",()=>{
 const {room,send,time}=setup(2,6);
 send(0,{type:"startHand"});
 time(2000);send(1,{type:"requestPause",mode:"pause"});
 assert.equal(room.publicState().pause.paused,false);
 assert.equal(room.publicState().deadlineAt,7000);
 send(0,{type:"votePause",pauseId:1,approve:false});
 assert.equal(room.publicState().pause.request,null);
 time(7000);assert.equal(room.tick(),true);
 assert.equal(room.publicState().hand.status,"complete");
});
test("timeout checks rather than folds when nothing is owed",()=>{
 const {room,send,time}=setup(2,10);
 send(0,{type:"startHand"});
 send(0,{type:"act",action:"call"});
 assert.equal(room.publicState().hand.playerToAct,"player-1");
 time(11000);assert.equal(room.tick(),true);
 assert.equal(room.table.hand.streetName,"flop");
 assert.equal(room.table.hand.events.findLast(e=>e.kind==="action").action,"check");
 assertConservation(room.table);
});
test("three-player unanimous pause requires all seats",()=>{
 const {room,send}=setup(3);
 send(1,{type:"startHand"});
 send(2,{type:"requestPause",mode:"pause"});
 send(0,{type:"votePause",pauseId:1,approve:true});
 assert.equal(room.publicState().pause.paused,false);
 assert.equal(room.publicState().pause.request.approvals.length,2);
 send(1,{type:"votePause",pauseId:1,approve:true});
 assert.equal(room.publicState().pause.paused,true);
});
test("public showdown cards may be revealed only on completed contested showdown",()=>{
 const {room,send}=setup(2,0);
 send(0,{type:"startHand"});
 let loops=0;
 while(room.table.hand.status==="betting"){
  if(++loops>40)throw new Error("stuck");
  const l=legalActions(room.table);
  const seat=Number(l.playerId.split("-")[1]);
  send(seat,{type:"act",action:l.toCall?"call":"check"});
 }
 const pub=room.publicState();
 assert.equal(pub.hand.status,"complete");
 assert.equal(pub.hand.board.length,5);
 assert.equal(pub.hand.players.filter(p=>p.shownCards?.length===2).length,2);
 assertConservation(room.table);
});
test("private hand views are seat-specific even in multiway hands",()=>{
 const {room,send}=setup(6);
 send(0,{type:"startHand"});
 for(let i=0;i<6;i++){
  const v=room.privateState("player-"+i);
  assert.equal(v.ownHole.length,2);
  assert.equal(v.hand.players.every(p=>!Object.hasOwn(p,"shownCards")),true);
  for(let j=0;j<6;j++)if(j!==i){
   const opp=room.privateState("player-"+j).ownHole;
   assert.ok(!v.ownHole.some(c=>opp.includes(c)));
  }
 }
});
test("seat cannot rebuy another player's chips, or rebuy while betting",()=>{
 const {room,send}=setup();
 send(0,{type:"startHand"});
 assert.throws(()=>send(1,{type:"rebuy",playerId:"player-0"}),/between hands/);
 send(0,{type:"act",action:"fold"});
 assert.throws(()=>send(0,{type:"rebuy",playerId:"player-1"}),/bust/);
});
