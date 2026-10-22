import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,symlink,readFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {randomBytes} from "node:crypto";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import {acquireDealerLease,journalLeasePort} from "../packages/poker/dealer-lease.js";

const players=Array.from({length:2},(_,i)=>({id:"npub1"+String(i).repeat(58),name:"Player "+i}));
const makeRequest=(revision,op,requestId)=>({
 protocol:1,roomId:"single-writer-room",requestId,expectedRevision:revision,op
});

test("local OS lease rejects second writer without destroying first",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-one-writer-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const journal=path.join(dir,"private.enc");
 const one=await acquireDealerLease(journal);
 t.after(()=>one.release());
 assert.ok(one.port>=20000&&one.port<60000);
 assert.equal(one.port,journalLeasePort(one.canonical));
 await assert.rejects(acquireDealerLease(journal),/single-host journal lease unavailable/);
 await one.release();
 const two=await acquireDealerLease(journal);
 await two.release();
});
test("canonical parent realpath blocks the same file accessed through a directory alias",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-alias-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const direct=path.join(dir,"journal.enc");
 const alias=path.join(os.tmpdir(),path.basename(dir)+"-alias");
 await symlink(dir,alias,"dir");
 t.after(()=>rm(alias,{force:true}));
 const owned=await acquireDealerLease(direct);
 t.after(()=>owned.release());
 await assert.rejects(acquireDealerLease(path.join(alias,"journal.enc")),
   /single-host journal lease unavailable/);
 await owned.release();
});
test("two REAL worker processes may not share a journal; SIGKILL frees lease for automatic restart",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-double-worker-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,"sealed.enc"),key=randomBytes(32);
 const env={...process.env,VCTR_ROOM_ID:"single-writer-room",
  VCTR_PLAYERS_JSON:JSON.stringify(players),VCTR_DEALER_KEY_HEX:key.toString("hex"),
  VCTR_DEALER_FILE:file};
 async function worker(){
  const child=spawn(process.execPath,["bots/poker/dealer-worker.mjs"],{
   cwd:process.cwd(),env,stdio:["pipe","pipe","pipe"]});
  t.after(()=>child.kill("SIGKILL"));
  let stderr="";
  child.stderr.on("data",x=>{stderr+=x.toString();});
  const lines=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
  t.after(()=>lines.close());
  const iterator=lines[Symbol.asyncIterator]();
  async function receive(){
   const frame=await iterator.next();
   assert.equal(frame.done,false,"Worker exited unexpectedly: "+stderr);
   return JSON.parse(frame.value);
  }
  async function send(packet){
   child.stdin.write(JSON.stringify(packet)+"\n");
   return receive();
  }
  return {child,send,receive,stderr:()=>stderr};
 }
 const primary=await worker();
 assert.equal((await primary.receive()).kind,"ready");
 const cmd=await primary.send({kind:"command",sender:players[0].id,
  request:makeRequest(0,{type:"propose",settings:{
   startingChips:100,smallBlind:1,bigBlind:2,rebuy:false,actionSeconds:30
  }},"first-command")});
 assert.equal(cmd.ok,true);
 assert.equal(cmd.revision,1);
 const original=await readFile(file);
 const duplicate=await worker();
 const exitPromise=once(duplicate.child,"exit");
 const [code]=await exitPromise;
 assert.notEqual(code,0,"A duplicate worker may never signal ready");
 assert.match(duplicate.stderr(),/Dealer initialization failed/);
 assert.deepEqual(await readFile(file),original,"Rejected second process must not rewrite journal");
 // Original process is still the only authoritative writer.
 const sync=await primary.send({kind:"sync",sender:players[0].id});
 assert.equal(sync.revision,1);
 assert.equal(sync.deliveries.length,1);
 const killed=once(primary.child,"exit");
 primary.child.kill("SIGKILL");
 await killed;
 const replacement=await worker();
 const ready=await replacement.receive();
 assert.deepEqual({ok:ready.ok,kind:ready.kind,revision:ready.revision},
  {ok:true,kind:"ready",revision:1});
 const replay=await replacement.send({kind:"sync",sender:players[1].id});
 assert.equal(replay.revision,1);
 assert.equal(replay.deliveries.length,1);
 assert.equal(replay.deliveries[0].to,players[1].id);
});
