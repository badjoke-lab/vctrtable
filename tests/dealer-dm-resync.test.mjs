import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import path from "node:path";
import os from "node:os";
import {PersistentDealer} from "../packages/poker/persistent-dealer.js";
import {fullDeck} from "../packages/poker/engine.js";
import {makeHandler} from "../bots/poker/dealer-worker.mjs";

const players=Array.from({length:3},(_,i)=>({id:"npub1"+String(i).repeat(58),name:"Player "+i}));
const settings={startingChips:100,smallBlind:1,bigBlind:2,rebuy:true,actionSeconds:1};
const request=(revision,op,id)=>({protocol:1,roomId:"test-room",requestId:id,expectedRevision:revision,op});

async function fixture(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-dm-sync-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const key=randomBytes(32),filename=path.join(dir,"sealed-dealer.json");
 const opts={roomId:"test-room",players,filename,key,deckFactory:()=>fullDeck()};
 let now=1000;
 const dealer=await PersistentDealer.open(opts);
 const handler=await makeHandler({dealer,players,clock:()=>now});
 const command=(seat,revision,op,id)=>handler({
  kind:"command",sender:players[seat].id,request:request(revision,op,id)
 });
 const sync=seat=>handler({kind:"sync",sender:players[seat].id});
 const ready=async()=>{
  let r=await command(0,0,{type:"propose",settings},"propose");
  assert.equal(r.ok,true);
  r=await command(1,1,{type:"approve",proposalId:1},"approve-1");
  assert.equal(r.ok,true);
  r=await command(2,2,{type:"approve",proposalId:1},"approve-2");
  assert.equal(r.ok,true);
  return r.revision;
 };
 return {dealer,opts,handler,command,sync,ready,setNow:value=>{now=value;},getNow:()=>now};
}
const packet=delivery=>JSON.parse(delivery.body);
const only=(res,seat)=>{
 assert.equal(res.deliveries.length,1);
 assert.equal(res.deliveries[0].to,players[seat].id);
 const p=packet(res.deliveries[0]);
 assert.equal(p.private.recipientId,players[seat].id);
 assert.equal(p.revision,res.revision);
 return p;
};
test("one-to-one resync restores just the verified requesting seat's cards",async t=>{
 const x=await fixture(t);
 await x.ready();
 const hand=await x.command(0,3,{type:"startHand"},"hand-1");
 assert.equal(hand.ok,true);assert.equal(hand.deliveries.length,3);
 const first=await x.sync(0),second=await x.sync(1);
 const a=only(first,0),b=only(second,1);
 assert.equal(a.private.ownHole.length,2);
 assert.equal(b.private.ownHole.length,2);
 assert.notDeepEqual(a.private.ownHole,b.private.ownHole);
 assert.deepEqual(a.state,b.state);
 assert.equal(JSON.stringify(a.state).includes('"ownHole"'),false);
 const stranger=await x.handler({kind:"sync",sender:"npub1OUTSIDER"});
 assert.deepEqual(stranger,{ok:false,code:"UNAUTHORIZED_OR_INVALID_COMMAND"});
});
test("repeat of successfully committed command resends ONLY caller's current snapshot",async t=>{
 const x=await fixture(t);
 await x.ready();
 const first=await x.command(0,3,{type:"startHand"},"hand-1");
 assert.equal(first.revision,4);
 assert.equal(first.deliveries.length,3);
 const retry=await x.command(0,3,{type:"startHand"},"hand-1");
 assert.equal(retry.ok,true);
 assert.equal(retry.revision,4);
 assert.equal(retry.receipt.replayed,true);
 const own=only(retry,0);
 assert.deepEqual(own.private.ownHole,packet(first.deliveries[0]).private.ownHole);
 assert.equal(x.dealer.revision,4);
 const changedId=await x.command(1,3,{type:"startHand"},"hand-1");
 assert.equal(changedId.ok,false);
 assert.equal(changedId.code,"STALE_REVISION");
 only(changedId,1);
});
test("expired command can persist a timeout, reject as stale, AND notify every seat",async t=>{
 const x=await fixture(t);
 await x.ready();
 const start=await x.command(0,3,{type:"startHand"},"hand-1");
 assert.equal(start.revision,4);
 assert.equal(start.deliveries.length,3);
 const actionSeat=x.dealer.publicState().hand.playerToAct;
 const seat=players.findIndex(p=>p.id===actionSeat);
 assert.ok(seat>=0);
 x.setNow(2000);
 const late=await x.command(seat,4,{type:"act",action:"call"},"late-act");
 assert.equal(late.ok,false);
 assert.equal(late.code,"STALE_REVISION");
 assert.equal(late.changed,true);
 assert.equal(late.revision,5);
 assert.equal(late.deliveries.length,3,"all players need the timeout state");
 const snap=late.deliveries.map(packet);
 for(let i=0;i<3;i++){
  assert.equal(late.deliveries[i].to,players[i].id);
  assert.equal(snap[i].private.recipientId,players[i].id);
  assert.equal(snap[i].revision,5);
 }
 assert.deepEqual(snap.map(x=>x.state),[snap[0].state,snap[0].state,snap[0].state]);
 assert.equal(x.dealer.journal.room.audit.at(-1).type,"timeout");
 const restarted=await PersistentDealer.open(x.opts);
 assert.equal(restarted.revision,5);
 assert.equal(restarted.publicState().revision,5);
 const following=await x.handler({kind:"tick"});
 assert.equal(following.ok,true);
 assert.equal(following.changed,false);
 assert.deepEqual(following.deliveries,[],"already persisted timeout must not repeat");
});
test("invalid authenticated command refreshes just its sender, without affecting other seats",async t=>{
 const x=await fixture(t);
 await x.ready();
 await x.command(0,3,{type:"startHand"},"start");
 const invalid=await x.command(1,4,{type:"act",action:"fold",actorId:players[0].id},"forged");
 assert.equal(invalid.ok,false);
 assert.equal(invalid.code,"UNTRUSTED_IDENTITY_OR_TIME_IN_OPERATION");
 only(invalid,1);
 assert.equal(x.dealer.revision,4);
 const malformed=await x.handler({kind:"command",sender:players[1].id,request:{roomId:"wrong"}});
 assert.equal(malformed.ok,false);
 only(malformed,1);
 const attacker=await x.handler({kind:"command",sender:"npub1stranger",request:request(4,{type:"act",action:"call"},"x")});
 assert.deepEqual(attacker,{ok:false,code:"UNAUTHORIZED_OR_INVALID_COMMAND"});
});
test("a timed check instead of fold broadcasts a fresh street to every private recipient",async t=>{
 const x=await fixture(t);
 await x.ready();
 await x.command(0,3,{type:"startHand"},"hand");
 const first=x.dealer.publicState().hand.playerToAct;
 const firstSeat=players.findIndex(p=>p.id===first);
 const reply=await x.command(firstSeat,4,{type:"act",action:"call"},"call");
 assert.equal(reply.ok,true);
 const second=x.dealer.publicState().hand.playerToAct;
 const secondSeat=players.findIndex(p=>p.id===second);
 assert.notEqual(secondSeat,-1);
 const sbCall=await x.command(secondSeat,5,{type:"act",action:"call"},"sb-call");
 assert.equal(sbCall.revision,6);
 const third=x.dealer.publicState().hand.playerToAct;
 const thirdSeat=players.findIndex(p=>p.id===third);
 assert.notEqual(thirdSeat,-1);
 assert.equal(x.dealer.journal.room.table.hand.players[thirdSeat].street,2);
 x.setNow(2000);
 const stale=await x.command(thirdSeat,6,{type:"act",action:"check"},"expired-check");
 assert.equal(stale.ok,false);
 assert.equal(stale.code,"STALE_REVISION");
 assert.equal(stale.revision,7);
 assert.equal(stale.deliveries.length,3);
 assert.equal(x.dealer.publicState().hand.street,"flop");
 assert.equal(x.dealer.publicState().hand.board.length,3);
});
