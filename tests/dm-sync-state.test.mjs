import test from "node:test";
import assert from "node:assert/strict";
import {SeatSyncTracker,DELAY_MS} from "../packages/poker/dm-sync-state.js";
import {AuthoritativeRoom} from "../packages/poker/dealer-room.js";
import {makeOutboundPackets} from "../packages/poker/message-boundary.js";
import {commandJson,syncJson} from "../packages/poker/dm-seat.js";
import {fullDeck} from "../packages/poker/engine.js";
const players=[{id:"npub1alice",name:"Alice"},{id:"npub1bob",name:"Bob"}],rng={getRandomValues:a=>{a.fill(35);return a;}};
const tracker=()=>new SeatSyncTracker({roomId:"room-1",playerId:players[0].id});
const cmd=rev=>commandJson({roomId:"room-1",revision:rev,op:{type:"startHand"},random:rng});
const state=(room,i)=>{const out=makeOutboundPackets(room),p=out.privatePackets[i];return JSON.stringify({
 protocol:1,kind:"vctrtable-poker-state",roomId:room.roomId,
 revision:room.revision,state:out.publicPacket.state,
 private:{recipientId:p.recipientId,ownHole:p.ownHole,legal:p.legal}
});};
function room(){
 const r=new AuthoritativeRoom({roomId:"room-1",players,clock:()=>1000,dealDeck:()=>fullDeck()});
 let serial=0;
 const op=(i,operation)=>r.command({actorId:players[i].id,requestId:"request-"+(++serial),expectedRevision:r.revision,op:operation,now:1000});
 op(0,{type:"propose",settings:{startingChips:100,smallBlind:1,bigBlind:2,actionSeconds:0,rebuy:true}});
 op(1,{type:"approve",proposalId:1});
 return {r,op};
}
test("preparing a command does not claim it was delivered to Vector",()=>{
 const x=tracker(),raw=cmd(0);
 assert.equal(x.status(100),"empty");
 assert.equal(x.prepare(raw,{now:101}),raw);
 assert.equal(x.status(102),"prepared");
 assert.equal(x.pending.sentAt,null);
 assert.equal(x.retryText(),raw);
 assert.equal(JSON.parse(x.retryText()).requestId,JSON.parse(raw).requestId);
 assert.throws(()=>x.prepare(cmd(0),{now:103}),/SYNC_REQUIRED_BEFORE_ACTION/);
 assert.equal(x.markSent(200),"awaiting");
 assert.equal(x.markSent(201),"awaiting");
 assert.equal(x.pending.sentAt,200,"double click cannot reset wait clock");
 assert.equal(x.status(200+DELAY_MS-1),"awaiting");
 assert.equal(x.status(200+DELAY_MS),"delayed");
 assert.equal(x.retryText(),raw);
});
test("newer per-seat snapshot clears uncertain draft without claiming command receipt",()=>{
 const {r,op}=room(),x=tracker();
 const initial=state(r,0);
 const imported=x.importReply(initial,{now:1000});
 assert.deepEqual(imported,{kind:"snapshot",changed:true,revision:2});
 assert.equal(x.status(1001),"current");
 const raw=cmd(2);x.prepare(raw,{now:1002});x.markSent(1003);
 op(0,{type:"startHand"});
 const fresh=x.importReply(state(r,0),{now:1004});
 assert.equal(fresh.changed,true);
 assert.equal(x.snapshot.revision,3);
 assert.equal(x.status(1005),"current");
 assert.equal(x.pending,null);
 assert.equal(x.lastImportedAt,1004);
});
test("out-of-order snapshot never rolls UI back, same revision conflicting cards rejected",()=>{
 const {r,op}=room(),x=tracker();
 const old=state(r,0);x.importReply(old,{now:5000});
 op(0,{type:"startHand"});
 const latest=state(r,0);x.importReply(latest,{now:5001});
 const cards=x.snapshot.private.ownHole.slice();
 assert.throws(()=>x.importReply(old,{now:5002}),/SNAPSHOT_NOT_FOR_THIS_SEAT/);
 assert.deepEqual(x.snapshot.private.ownHole,cards);
 assert.equal(x.snapshot.revision,3);
 const forged=JSON.parse(latest);forged.private.ownHole=["2D","3D"];
 assert.throws(()=>x.importReply(JSON.stringify(forged),{now:5003}),/CONFLICTING_SAME_REVISION/);
 assert.deepEqual(x.snapshot.private.ownHole,cards);
 const duplicate=x.importReply(latest,{now:5004});
 assert.deepEqual(duplicate,{kind:"snapshot",changed:false,revision:3});
});
test("unverified pasted Bot error locks actions until a new manual sync is prepared",()=>{
 const x=tracker(),first=cmd(0);
 x.prepare(first,{now:100});
 const error=x.importReply("poker error: STALE_REVISION",{now:101});
 assert.deepEqual(error,{kind:"error",code:"STALE_REVISION"});
 assert.equal(x.status(102),"needs-sync");
 assert.equal(x.failure,"STALE_REVISION");
 assert.throws(()=>x.prepare(cmd(0),{now:103}),/SYNC_REQUIRED_BEFORE_ACTION/);
 x.prepare(syncJson(),{kind:"sync",now:104});
 assert.equal(x.status(105),"prepared");
 assert.equal(x.retryText(),syncJson());
 assert.equal(x.pending.kind,"sync");
 x.markSent(106);
 assert.equal(x.status(107),"awaiting");
});
test("manual sync may supersede uncertain command but cannot cancel it at the dealer",()=>{
 const x=tracker(),request=cmd(0);
 x.prepare(request,{now:1});x.markSent(2);
 x.prepare(syncJson(),{kind:"sync",now:3});
 assert.equal(x.status(3),"prepared");
 assert.equal(x.retryText(),syncJson());
 const {r}=room();
 x.importReply(state(r,0),{now:4});
 assert.equal(x.status(4),"current");
 assert.equal(x.pending,null);
});
test("same revision without changed state doesn't acknowledge an outstanding ACTION",()=>{
 const {r}=room(),x=tracker();
 x.importReply(state(r,0),{now:100});
 const original=cmd(2);x.prepare(original,{now:101});x.markSent(102);
 const repeated=x.importReply(state(r,0),{now:103});
 assert.equal(repeated.changed,false);
 assert.equal(x.status(104),"awaiting");
 assert.equal(x.retryText(),original);
});
test("reject private snapshot from wrong recipient or room and malformed input without mutating state",()=>{
 const {r}=room(),x=tracker();
 assert.throws(()=>x.importReply(state(r,1),{now:1}),/SNAPSHOT_NOT_FOR_THIS_SEAT/);
 assert.equal(x.status(2),"empty");
 assert.throws(()=>x.importReply("not json",{now:1}),/INVALID_SNAPSHOT_JSON/);
 assert.throws(()=>x.importReply("poker error: something invalid",{now:1}),/INVALID_BOT_ERROR/);
 assert.equal(x.status(2),"empty");
 assert.throws(()=>x.prepare(JSON.stringify({kind:"sync",extra:true}),{kind:"sync",now:3}),/INVALID_SYNC_REQUEST/);
 assert.throws(()=>x.prepare(JSON.stringify({protocol:1,roomId:"wrong",requestId:"a",expectedRevision:0,op:{type:"startHand"}}),{now:1}),/INVALID_COMMAND_DRAFT/);
});
