import test from "node:test";
import assert from "node:assert/strict";
import {AuthoritativeRoom} from "../packages/poker/dealer-room.js";
import {fullDeck,legalActions} from "../packages/poker/engine.js";
import {parsePlayerRequest,makeOutboundPackets,acceptTrustedRequest,assertPacketRouting} from "../packages/poker/message-boundary.js";

const members=[{id:"alice",name:"Alice"},{id:"bob",name:"Bob"},{id:"cara",name:"Cara"}];
const fixture=()=>new AuthoritativeRoom({roomId:"table-123",players:members,dealDeck:()=>fullDeck(),clock:()=>1000});
let seq=0;
const packet=(room,op)=>({protocol:1,roomId:room.roomId,requestId:"m-"+(++seq),expectedRevision:room.revision,op});
const send=(room,id,op)=>acceptTrustedRequest(room,packet(room,op),{verifiedActorId:id,serverNow:1000});
const acceptedRoom=()=>{
 const room=fixture();
 send(room,"alice",{type:"propose",settings:{startingChips:100,smallBlind:1,bigBlind:2,rebuy:true,actionSeconds:0}});
 send(room,"bob",{type:"approve",proposalId:1});
 send(room,"cara",{type:"approve",proposalId:1});
 return room;
};
test("only full exact protocol envelope accepted",()=>{
 const r=fixture(),req=packet(r,{type:"propose",settings:{startingChips:100,smallBlind:1,bigBlind:2,rebuy:false,actionSeconds:0}});
 assert.equal(parsePlayerRequest(req,r.roomId).requestId,req.requestId);
 assert.throws(()=>parsePlayerRequest({...req,actorId:"alice"},r.roomId),/EXTRA_OR_UNTRUSTED/);
 assert.throws(()=>parsePlayerRequest({...req,op:{...req.op,actorId:"alice"}},r.roomId),/UNTRUSTED/);
 assert.throws(()=>parsePlayerRequest({...req,op:{...req.op,now:0}},r.roomId),/UNTRUSTED/);
 assert.throws(()=>parsePlayerRequest({...req,roomId:"other"},r.roomId),/INVALID_REQUEST/);
 assert.throws(()=>parsePlayerRequest({...req,protocol:9},r.roomId),/INVALID_REQUEST/);
 assert.throws(()=>parsePlayerRequest({...req,requestId:"x".repeat(9000)},r.roomId),/INVALID_REQUEST/);
});
test("must supply trusted transport actor, never client assertion",()=>{
 const r=acceptedRoom();
 const request=packet(r,{type:"startHand"});
 assert.throws(()=>acceptTrustedRequest(r,request,{verifiedActorId:"alice"}),/MISSING_TRUSTED/);
 assert.throws(()=>acceptTrustedRequest(r,request,{verifiedActorId:"unknown",serverNow:1000}),/UNAUTHENTICATED/);
 const x=acceptTrustedRequest(r,request,{verifiedActorId:"bob",serverNow:1000});
 assert.equal(x.receipt.replayed,false);
 assert.equal(x.publicPacket.state.hand.number,1);
 assert.equal(x.privatePackets.length,3);
});
test("broadcast contains zero secret cards, private envelope only own cards",()=>{
 const room=acceptedRoom();send(room,"alice",{type:"startHand"});
 const x=makeOutboundPackets(room);
 assert.equal(assertPacketRouting(x,members),true);
 const publicText=JSON.stringify(x.publicPacket);
 for(const {id} of members){
  const expected=room.privateState(id).ownHole;
  const p=x.privatePackets.find(p=>p.recipientId===id);
  assert.deepEqual(p.ownHole,expected);
  assert.equal(p.ownHole.length,2);
  for(const c of expected)assert.ok(!publicText.includes('"'+c+'"'));
  for(const other of x.privatePackets.filter(p=>p.recipientId!==id))
   assert.ok(!p.ownHole.some(c=>other.ownHole.includes(c)));
 }
});
test("packet routing rejects private payload on broadcast and altered recipient",()=>{
 const room=acceptedRoom();send(room,"alice",{type:"startHand"});
 const x=makeOutboundPackets(room);
 x.publicPacket.state.ownHole=["AS"];
 assert.throws(()=>assertPacketRouting(x,members),/SECRET_FIELD_IN_PUBLIC/);
 delete x.publicPacket.state.ownHole;
 x.privatePackets[0].recipientId="bob";
 assert.throws(()=>assertPacketRouting(x,members),/DUPLICATE_RECIPIENT/);
});
test("recipient packets synchronize revision with public after action",()=>{
 const room=acceptedRoom();send(room,"alice",{type:"startHand"});
 const legal=legalActions(room.table);
 const x=send(room,legal.playerId,{type:"act",action:legal.toCall?"call":"check"});
 assert.equal(x.receipt.revision,x.publicPacket.revision);
 assert.equal(x.privatePackets.every(p=>p.revision===x.publicPacket.revision),true);
 assert.equal(assertPacketRouting(x,members),true);
});
test("no cards are present even before approved rules",()=>{
 const r=fixture();const x=makeOutboundPackets(r);
 assertPacketRouting(x,members);
 assert.equal(x.publicPacket.state.hand,null);
 for(const p of x.privatePackets){assert.deepEqual(p.ownHole,[]);assert.equal(p.legal,null);}
});
