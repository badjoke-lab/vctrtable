import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {randomBytes} from "node:crypto";
import readline from "node:readline";

const players=Array.from({length:3},(_,i)=>({id:"npub1"+String(i).repeat(58),name:"Seat "+i}));
const makeRequest=(revision,op,req)=>({
 protocol:1,roomId:"poker-room",requestId:req,expectedRevision:revision,op
});
async function runWorker(t,secret){
 const child=spawn(process.execPath,["bots/poker/dealer-worker.mjs"],{
  cwd:process.cwd(),env:{
   ...process.env,VCTR_ROOM_ID:"poker-room",VCTR_PLAYERS_JSON:JSON.stringify(players),
   VCTR_DEALER_KEY_HEX:secret.key.toString("hex"),VCTR_DEALER_FILE:secret.file
  },stdio:["pipe","pipe","pipe"]
 });
 const reader=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
 const it=reader[Symbol.asyncIterator]();
 const log=[];
 child.stderr.on("data",d=>log.push(d.toString()));
 t.after(()=>{reader.close();child.kill("SIGKILL");});
 const initial=await it.next();
 assert.equal(initial.done,false,"worker exited without ready: "+log.join(""));
 assert.equal(JSON.parse(initial.value).kind,"ready");
 async function send(packet){
  const line=JSON.stringify(packet);
  child.stdin.write(line+"\n");
  const response=await it.next();
  assert.equal(response.done,false,"worker disconnected: "+log.join(""));
  return JSON.parse(response.value);
 }
 return {send,child};
}
test("real local Node dealer IPC keeps own hole cards recipient-scoped and survives restart",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-ipc-"));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const secret={file:path.join(dir,"dealer.enc"),key:randomBytes(32)};
 const a=await runWorker(t,secret);
 let rev=0,seq=0;
 const act=async(sender,op)=>{
  const res=await a.send({kind:"command",sender:players[sender].id,request:makeRequest(rev,op,"request-"+(++seq))});
  assert.equal(res.ok,true,res.code);rev=res.revision;return res;
 };
 let reply=await act(0,{type:"propose",settings:{startingChips:100,smallBlind:1,bigBlind:2,rebuy:true,actionSeconds:30}});
 assert.equal(reply.deliveries.length,3);
 await act(1,{type:"approve",proposalId:1});
 await act(2,{type:"approve",proposalId:1});
 reply=await act(0,{type:"startHand"});
 const own=reply.deliveries.map(d=>JSON.parse(d.body));
 assert.equal(own.length,3);
 const group=JSON.stringify(own[0].state);
 assert.equal(group.includes('"ownHole"'),false);
 assert.equal(group.includes('"deck"'),false);
 for(let i=0;i<own.length;i++){
  assert.equal(reply.deliveries[i].to,players[i].id);
  assert.equal(own[i].private.recipientId,players[i].id);
  assert.equal(own[i].private.ownHole.length,2);
  for(let j=0;j<own.length;j++)if(i!==j)
   assert.ok(own[i].private.ownHole.every(card=>!own[j].private.ownHole.includes(card)));
 }
 const bad=await a.send({kind:"command",sender:"npub1not-on-roster",request:makeRequest(rev,{type:"act",action:"fold"},"outsider")});
 assert.deepEqual(bad,{ok:false,code:"UNAUTHORIZED_OR_INVALID_COMMAND"});
 assert.equal((await a.send({kind:"sync",sender:players[0].id})).deliveries.length,1);
 assert.equal((await a.send({kind:"tick"})).ok,true);
 a.child.kill("SIGKILL");
 const b=await runWorker(t,secret);
 const recovered=await b.send({kind:"sync",sender:players[0].id});
 assert.equal(recovered.revision,rev);
 assert.equal(recovered.deliveries.length,1);
 assert.deepEqual(JSON.parse(recovered.deliveries[0].body).private.ownHole,own[0].private.ownHole);
 const old=await b.send({kind:"command",sender:players[0].id,request:makeRequest(0,{type:"startHand"},"request-"+seq)});
 assert.equal(old.ok,true);
 assert.equal(old.receipt.replayed,true);
});
test("worker rejects client-supplied identity and time",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-bad-"));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const w=await runWorker(t,{file:path.join(dir,"sealed.enc"),key:randomBytes(32)});
 const raw=makeRequest(0,{type:"startHand",actorId:players[1].id},"bad");
 const res=await w.send({kind:"command",sender:players[0].id,request:raw});
 assert.equal(res.ok,false);
 assert.equal(res.code,"UNTRUSTED_IDENTITY_OR_TIME_IN_OPERATION");
});


test("trusted host recovery after process crash broadcasts current PRIVATE state once to each seat",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-supervisor-"));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 const secret={file:path.join(dir,"sealed.enc"),key:randomBytes(32)};
 const worker=await runWorker(t,secret);
 let revision=0;
 const advance=async(sender,op,requestId)=>{
  const reply=await worker.send({kind:"command",sender:players[sender].id,
   request:makeRequest(revision,op,requestId)});
  assert.equal(reply.ok,true,reply.code);
  revision=reply.revision;
  return reply;
 };
 await advance(0,{type:"propose",settings:{
  startingChips:100,smallBlind:1,bigBlind:2,rebuy:true,actionSeconds:30
 }},"rules");
 await advance(1,{type:"approve",proposalId:1},"vote1");
 await advance(2,{type:"approve",proposalId:1},"vote2");
 const started=await advance(0,{type:"startHand"},"hand");
 const known=started.deliveries.map(d=>JSON.parse(d.body));
 worker.child.kill("SIGKILL");
 // This is the SAME encrypted journal: no decks or accounts are regenerated.
 const restored=await runWorker(t,secret);
 const recovery=await restored.send({kind:"recover"});
 assert.equal(recovery.ok,true);
 assert.equal(recovery.revision,revision);
 assert.equal(recovery.deliveries.length,3);
 for(let i=0;i<players.length;i++){
  assert.equal(recovery.deliveries[i].to,players[i].id);
  const state=JSON.parse(recovery.deliveries[i].body);
  assert.equal(state.private.recipientId,players[i].id);
  assert.deepEqual(state.private.ownHole,known[i].private.ownHole);
  assert.deepEqual(state.state,known[i].state);
  assert.equal(JSON.stringify(state.state).includes('"ownHole"'),false);
  assert.equal(JSON.stringify(state.state).includes('"deck"'),false);
 }
 const reply=await restored.send({kind:"command",sender:players[0].id,
   request:makeRequest(3,{type:"startHand"},"hand")});
 assert.equal(reply.ok,true);
 assert.equal(reply.receipt.replayed,true);
 assert.equal(reply.deliveries.length,1,"duplicate after recovery must not flood every seat");
 assert.equal(reply.revision,revision);
 const forged=await restored.send({kind:"command",sender:players[0].id,request:{kind:"recover"}});
 assert.equal(forged.ok,false,"a client command cannot invoke host-only recovery");
 assert.equal(forged.deliveries.length,1);
 const sync=await restored.send({kind:"sync",sender:players[1].id});
 assert.equal(sync.deliveries.length,1);
 assert.equal(sync.deliveries[0].to,players[1].id);
});
