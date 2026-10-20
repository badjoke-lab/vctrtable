import test from "node:test";
import assert from "node:assert/strict";
import {commandJson,syncJson,parseSeatSnapshot} from "../packages/poker/dm-seat.js";
import {AuthoritativeRoom} from "../packages/poker/dealer-room.js";
import {fullDeck,legalActions} from "../packages/poker/engine.js";
import {makeOutboundPackets} from "../packages/poker/message-boundary.js";
const ids=["npub1alice","npub1bob"];
const fakeRng={getRandomValues:a=>{a.fill(42);return a;}};
const room=()=>{
 const r=new AuthoritativeRoom({roomId:"room-1",players:ids.map((id,i)=>({id,name:"Seat "+(i+1)})),clock:()=>1000,dealDeck:()=>fullDeck()});
 const send=(actorId,op,rev=r.revision)=>r.command({actorId,requestId:"request"+r.revision,expectedRevision:rev,op,now:1000});
 send(ids[0],{type:"propose",settings:{startingChips:100,smallBlind:1,bigBlind:2,rebuy:true,actionSeconds:30}});
 send(ids[1],{type:"approve",proposalId:1});
 send(ids[0],{type:"startHand"});
 return r;
};
const toWire=(r,i)=>{
 const x=makeOutboundPackets(r),recipient=x.privatePackets[i];
 return JSON.stringify({
  protocol:1,kind:"vctrtable-poker-state",roomId:x.publicPacket.roomId,
  revision:x.publicPacket.revision,state:x.publicPacket.state,
  private:{recipientId:recipient.recipientId,ownHole:recipient.ownHole,legal:recipient.legal}
 });
};
test("builds valid wire DM, uses secure random ID, includes no actor/seed",()=>{
 const a=JSON.parse(commandJson({roomId:"room-1",revision:4,random:fakeRng,op:{type:"act",action:"raise",target:20}}));
 assert.deepEqual(Object.keys(a),["protocol","roomId","requestId","expectedRevision","op"]);
 assert.equal(a.requestId,"2a".repeat(16));
 assert.equal(a.expectedRevision,4);
 assert.equal("actorId" in a,false);
 assert.equal(syncJson(),'{"kind":"sync"}');
});
test("refuses unsafe or invalid client requests",()=>{
 const base={roomId:"room-1",revision:0,random:fakeRng};
 assert.throws(()=>commandJson({...base,op:{type:"act",action:"wager"}}),/UNKNOWN_ACTION/);
 assert.throws(()=>commandJson({...base,op:{type:"act",action:"fold",actorId:"npub1fake"}}),/UNTRUSTED_COMMAND_FIELDS/);
 assert.throws(()=>commandJson({...base,op:{type:"act",action:"raise",target:0}}),/INVALID_RAISE/);
 assert.throws(()=>commandJson({...base,random:null,op:{type:"startHand"}}),/SECURE_RANDOMNESS/);
 assert.throws(()=>commandJson({...base,op:{type:"propose",settings:{startingChips:10,smallBlind:12,bigBlind:20,rebuy:false,actionSeconds:0}}}),/INVALID_RULES/);
});
test("imports only own per-seat state and legal actions",()=>{
 const r=room(),snapshot=parseSeatSnapshot(toWire(r,0),{roomId:"room-1",playerId:ids[0]});
 assert.equal(snapshot.revision,3);
 assert.deepEqual(snapshot.private.ownHole,r.privateState(ids[0]).ownHole);
 assert.equal(snapshot.private.legal?.playerId,legalActions(r.table).playerId);
 assert.equal(snapshot.state.hand.board.length,0);
 assert.equal("deck" in snapshot.state,false);
 assert.equal("ownHole" in snapshot.state,false);
});
test("rejects cross-player, cross-room, old and future-conflicting snapshots",()=>{
 const r=room(),raw=toWire(r,0);
 assert.throws(()=>parseSeatSnapshot(raw,{roomId:"room-2",playerId:ids[0]}),/SNAPSHOT_NOT_FOR_THIS_SEAT/);
 assert.throws(()=>parseSeatSnapshot(raw,{roomId:"room-1",playerId:"npub1outsider"}),/SNAPSHOT_NOT_FOR_THIS_SEAT/);
 assert.throws(()=>parseSeatSnapshot(raw,{roomId:"room-1",playerId:ids[0],minimumRevision:4}),/SNAPSHOT_NOT_FOR_THIS_SEAT/);
 assert.throws(()=>parseSeatSnapshot(toWire(r,1),{roomId:"room-1",playerId:ids[0]}),/SNAPSHOT_NOT_FOR_THIS_SEAT/);
 const x=JSON.parse(raw);x.private.legal={...x.private.legal,playerId:ids[1]};
 assert.throws(()=>parseSeatSnapshot(JSON.stringify(x),{roomId:"room-1",playerId:ids[0]}),/INVALID_SEAT_ACTIONS/);
});
test("rejects tampered cards and secret fields in shared snapshot",()=>{
 const r=room(),raw=toWire(r,0),q=JSON.parse(raw);
 q.state.deck=fullDeck();
 assert.throws(()=>parseSeatSnapshot(JSON.stringify(q),{roomId:"room-1",playerId:ids[0]}),/UNEXPECTED_SECRET_FIELD/);
 delete q.state.deck;
 q.private.ownHole=["AS","AS"];
 assert.throws(()=>parseSeatSnapshot(JSON.stringify(q),{roomId:"room-1",playerId:ids[0]}),/BAD_PRIVATE_CARDS/);
 q.private.ownHole=["AS","1Z"];
 assert.throws(()=>parseSeatSnapshot(JSON.stringify(q),{roomId:"room-1",playerId:ids[0]}),/BAD_PRIVATE_CARDS/);
});
test("malformed or excessively large manual reply is rejected",()=>{
 assert.throws(()=>parseSeatSnapshot("{oops",{roomId:"room-1",playerId:ids[0]}),/INVALID_SNAPSHOT_JSON/);
 assert.throws(()=>parseSeatSnapshot("x".repeat(131073),{roomId:"room-1",playerId:ids[0]}),/INVALID_SNAPSHOT/);
});
test("parsed state is an independent copy",()=>{
 const r=room(),wire=toWire(r,0),parsed=parseSeatSnapshot(wire,{roomId:"room-1",playerId:ids[0]});
 parsed.private.ownHole[0]="2S";
 assert.notDeepEqual(parsed.private.ownHole,r.privateState(ids[0]).ownHole);
});
