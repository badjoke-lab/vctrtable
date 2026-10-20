import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,stat,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {randomBytes} from "node:crypto";
import {DealerJournal} from "../packages/poker/dealer-journal.js";
import {EncryptedDealerStore} from "../packages/poker/dealer-store.js";
import {PersistentDealer} from "../packages/poker/persistent-dealer.js";
import {fullDeck} from "../packages/poker/engine.js";
import {makeOutboundPackets,assertPacketRouting} from "../packages/poker/message-boundary.js";

const players=Array.from({length:3},(_,i)=>({id:"player-"+i,name:"Player "+i}));
const settings={startingChips:100,smallBlind:1,bigBlind:2,rebuy:true,actionSeconds:10};
const deckFactory=()=>fullDeck();
let unique=0;
const cmd=(room,id,op,now=1000,requestId)=>({
 actorId:id,requestId:requestId??"cmd-"+(++unique),expectedRevision:room.revision,now,op
});
const configured=()=>{
 const d=new DealerJournal({roomId:"test",players,deckFactory});
 d.command(cmd(d.room,"player-0",{type:"propose",settings}));
 d.command(cmd(d.room,"player-1",{type:"approve",proposalId:1}));
 d.command(cmd(d.room,"player-2",{type:"approve",proposalId:1}));
 return d;
};
test("journal reproduces a mid-hand authoritative state and retains private boundaries",()=>{
 const d=configured();
 d.command(cmd(d.room,"player-0",{type:"startHand"}));
 const hand=d.room.table.hand,turn=hand.players[hand.turn].id;
 d.command(cmd(d.room,turn,{type:"act",action:"call"}));
 const restored=DealerJournal.replay(d.document(),{deckFactory});
 assert.deepEqual(restored.room.publicState(),d.room.publicState());
 assert.deepEqual(restored.room.table,d.room.table);
 assert.deepEqual(restored.entries,d.entries);
 assert.equal(assertPacketRouting(makeOutboundPackets(restored.room),players),true);
});
test("journal preserves an unlimited unanimous pause and resumes with remaining action time",()=>{
 const d=configured();
 d.command(cmd(d.room,"player-0",{type:"startHand"}));
 d.command(cmd(d.room,"player-0",{type:"requestPause",mode:"pause"},2000));
 d.command(cmd(d.room,"player-1",{type:"votePause",pauseId:1,approve:true},2500));
 d.command(cmd(d.room,"player-2",{type:"votePause",pauseId:1,approve:true},3000));
 assert.equal(d.room.paused,true);
 const r=DealerJournal.replay(d.document(),{deckFactory});
 assert.equal(r.room.paused,true);
 assert.equal(r.room.deadlineAt,null);
 assert.deepEqual(r.room.publicState(),d.room.publicState());
 assert.equal(r.tick(999999999),false);
 assert.equal(r.room.paused,true);
 r.command(cmd(r.room,"player-0",{type:"requestPause",mode:"resume"},1000000000));
 r.command(cmd(r.room,"player-1",{type:"votePause",pauseId:2,approve:true},1000000001));
 r.command(cmd(r.room,"player-2",{type:"votePause",pauseId:2,approve:true},1000000002));
 assert.equal(r.room.paused,false);
 assert.equal(r.room.deadlineAt,1000008002);
});
test("timer expiry is replayable and duplicate command requests are idempotent after restart",()=>{
 const d=configured();
 const original=cmd(d.room,"player-0",{type:"startHand"});
 d.command(original);
 d.tick(11000);
 assert.equal(d.room.table.hand.status,"complete");
 const restored=DealerJournal.replay(d.document(),{deckFactory});
 assert.deepEqual(restored.room.publicState(),d.room.publicState());
 assert.equal(restored.command(original).replayed,true);
 assert.equal(restored.room.revision,d.room.revision);
});
test("stale request that triggers timeout is journaled even if command is rejected",()=>{
 const d=configured();
 d.command(cmd(d.room,"player-0",{type:"startHand"}));
 const stale=cmd(d.room,"player-0",{type:"act",action:"call"},12000);
 assert.throws(()=>d.command(stale),/STALE_REVISION/);
 const r=DealerJournal.replay(d.document(),{deckFactory});
 assert.deepEqual(r.room.publicState(),d.room.publicState());
});
test("corrupt recorded deck, command, or journal version cannot replay",()=>{
 const d=configured();
 d.command(cmd(d.room,"player-0",{type:"startHand"}));
 const orig=d.document();
 assert.throws(()=>DealerJournal.replay({...orig,version:5},{deckFactory}),/Unsupported/);
 const changed=structuredClone(orig);
 const entry=changed.entries.find(e=>e.deck);
 entry.deck[0]=entry.deck[1];
 assert.throws(()=>DealerJournal.replay(changed,{deckFactory}),/52-card|divergence/);
 const changedRequest=structuredClone(orig);
 changedRequest.entries[0].input.op.settings.startingChips=1;
 assert.throws(()=>DealerJournal.replay(changedRequest,{deckFactory}),/integrity|divergence/);
});
test("encrypted file round-trips but does not expose a known secret card/deck pattern",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-store-"));
 try{
  const file=path.join(dir,"private","dealer.journal");
  const key=randomBytes(32),store=new EncryptedDealerStore({filename:file,key});
  const input={secret:"AS KS QS JS TS",other:[1,2,3]};
  assert.equal(await store.load(),null);
  await store.save(input);
  const raw=await readFile(file,"utf8");
  assert.ok(!raw.includes("AS KS QS JS TS"));
  assert.deepEqual(await store.load(),input);
  const st=await stat(file);
  if(process.platform!=="win32")assert.equal(st.mode&0o777,0o600);
  const wrong=new EncryptedDealerStore({filename:file,key:randomBytes(32)});
  await assert.rejects(wrong.load(),/authenticate\/decrypt/);
  const sealed=JSON.parse(raw);
  sealed.ciphertext=sealed.ciphertext.slice(0,-4)+"ABCD";
  await writeFile(file,JSON.stringify(sealed));
  await assert.rejects(store.load(),/authenticate\/decrypt/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("persistent dealer resumes after restart, rejects wrong identity and expired requests",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-restore-"));
 try{
  const filename=path.join(dir,"dealer.enc"),key=randomBytes(32);
  const opts={roomId:"test",players,filename,key,deckFactory};
  const broker=await PersistentDealer.open(opts);
  const send=async(id,op,now=1000,req)=>broker.command({
    actorId:id,requestId:req??"persistent-"+(++unique),expectedRevision:broker.revision,now,op
  });
  await send("player-0",{type:"propose",settings});
  await send("player-1",{type:"approve",proposalId:1});
  await send("player-2",{type:"approve",proposalId:1});
  const start=await send("player-0",{type:"startHand"},1000,"start-123");
  await send("player-0",{type:"requestPause",mode:"pause"},2000);
  await send("player-1",{type:"votePause",pauseId:1,approve:true},2500);
  await send("player-2",{type:"votePause",pauseId:1,approve:true},3000);
  const before=broker.publicState();
  const restarted=await PersistentDealer.open(opts);
  assert.deepEqual(restarted.publicState(),before);
  assert.equal(restarted.privateState("player-0").ownHole.length,2);
  assert.equal(restarted.revision,start.revision+3);
  assert.equal(await restarted.tick(999999),false);
  assert.equal((await restarted.command({
    actorId:"player-0",requestId:"start-123",expectedRevision:0,now:1000000,op:{type:"startHand"}
  })).replayed,true);
  await assert.rejects(PersistentDealer.open({...opts,players:players.slice(1)}),/Wrong room/);
  await assert.rejects(PersistentDealer.open({...opts,key:randomBytes(32)}),/authenticate\/decrypt/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("writes are serialized, and failed persistence permanently faults a broker",async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-queue-"));
 try{
  const opts={roomId:"test",players,filename:path.join(dir,"journal"),key:randomBytes(32),deckFactory};
  const broker=await PersistentDealer.open(opts);
  const a=broker.command({actorId:"player-0",requestId:"a",expectedRevision:0,now:1000,op:{type:"propose",settings}});
  const b=broker.command({actorId:"player-1",requestId:"b",expectedRevision:1,now:1000,op:{type:"approve",proposalId:1}});
  assert.deepEqual((await Promise.all([a,b])).map(x=>x.revision),[1,2]);
  const same=await PersistentDealer.open(opts);
  assert.equal(same.revision,2);
  const saved=same.store.save;
  same.store.save=async()=>{throw new Error("disk unavailable");};
  await assert.rejects(same.command({actorId:"player-2",requestId:"c",expectedRevision:2,now:1000,op:{type:"approve",proposalId:1}}),/persistence failed/);
  await assert.rejects(same.command({actorId:"player-2",requestId:"d",expectedRevision:3,now:1000,op:{type:"approve",proposalId:1}}),/faulted/);
  same.store.save=saved;
  const recover=await PersistentDealer.open(opts);
  assert.equal(recover.revision,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
