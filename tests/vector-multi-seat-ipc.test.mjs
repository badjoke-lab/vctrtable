import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,rm} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

/**
 * Full real-child-process dealer run with 2/3/6 distinct authenticated
 * caller IDs supplied by the test harness. Not a real Vector relay test.
 * No hidden cards or dealer journal are ever copied to a group update.
 */
for(const count of [2,3,6]){
 test(`real IPC multi-seat hand: ${count} players, private cards, unanimous pause, full showdown`,async t=>{
  const tmp=await mkdtemp(path.join(os.tmpdir(),`vctrtable-multi-${count}-`));
  t.after(()=>rm(tmp,{recursive:true,force:true}));
  const players=Array.from({length:count},(_,i)=>({
   id:"npub1"+String(i).repeat(58),name:`Seat ${i+1}`}));
  const child=spawn(process.execPath,["bots/poker/dealer-worker.mjs"],{
   cwd:process.cwd(),
   env:{...process.env,VCTR_ROOM_ID:"full-hand-test",VCTR_PLAYERS_JSON:JSON.stringify(players),
     VCTR_DEALER_KEY_HEX:randomBytes(32).toString("hex"),
     VCTR_DEALER_FILE:path.join(tmp,"sealed.enc")},
   stdio:["pipe","pipe","pipe"]
  });
  const stream=readline.createInterface({input:child.stdout,crlfDelay:Infinity});
  const lines=stream[Symbol.asyncIterator]();
  let stderr="";
  child.stderr.on("data",data=>{stderr+=data.toString();});
  t.after(()=>{stream.close();child.kill("SIGKILL");});
  const read=async()=>{
   const {value,done}=await lines.next();
   assert.equal(done,false,`dealer exited unexpectedly: ${stderr}`);
   return JSON.parse(value);
  };
  const ready=await read();
  assert.equal(ready.kind,"ready");
  let revision=ready.revision,seq=0;
  const command=async (index,op)=>{
   const reply=await transmit({kind:"command",sender:players[index].id,
    request:{protocol:1,roomId:"full-hand-test",
     requestId:`multi-${count}-${++seq}`,expectedRevision:revision,op}});
   assert.equal(reply.ok,true,reply.code??"");
   revision=reply.revision;
   assert.equal(reply.deliveries.length,count,"every change goes privately to every seat");
   return reply;
  };
  async function transmit(message){
   child.stdin.write(JSON.stringify(message)+"\n");
   return read();
  }
  const expectPrivate=(response,active)=>{
   assert.equal(response.deliveries.length,count);
   const seen=new Set();
   const packet=response.deliveries.map(({to,body})=>{
    assert.ok(players.some(p=>p.id===to),"unknown private recipient");
    assert.ok(!seen.has(to),"duplicate private recipient");
    seen.add(to);
    const data=JSON.parse(body);
    assert.equal(data.kind,"vctrtable-poker-state");
    assert.equal(data.revision,response.revision);
    assert.equal(data.private.recipientId,to);
    assert.equal(data.state.revision,response.revision);
    const publicJson=JSON.stringify(data.state);
    assert.ok(!publicJson.includes('"ownHole"'));
    assert.ok(!publicJson.includes('"deck"'));
    if(active)assert.equal(data.private.ownHole.length,2);
    return data;
   });
   assert.equal(new Set(packet.map(p=>JSON.stringify(p.state))).size,1);
   if(active){
    const cards=packet.flatMap(p=>p.private.ownHole);
    assert.equal(new Set(cards).size,count*2,"all hole cards must be unique");
   }
   return packet;
  }

  await command(0,{type:"propose",settings:{
   startingChips:100,smallBlind:1,bigBlind:2,rebuy:true,actionSeconds:0}});
  for(let i=1;i<count;i++)await command(i,{type:"approve",proposalId:1});
  let response=await command(0,{type:"startHand"});
  expectPrivate(response,true);
  assert.equal(response.revision,count+1);

  await command(0,{type:"requestPause",mode:"pause"});
  for(let i=1;i<count;i++)await command(i,{type:"votePause",pauseId:1,approve:true});
  let state=JSON.parse(response.deliveries[0].body).state;
  response=await transmit({kind:"sync",sender:players[0].id});
  assert.equal(response.deliveries.length,1);
  state=JSON.parse(response.deliveries[0].body).state;
  assert.equal(state.pause.paused,true);
  const tick=await transmit({kind:"tick"});
  assert.equal(tick.revision,revision);
  assert.deepEqual(tick.deliveries,[]);
  await command(0,{type:"requestPause",mode:"resume"});
  for(let i=1;i<count;i++)await command(i,{type:"votePause",pauseId:2,approve:true});
  response=await transmit({kind:"sync",sender:players[0].id});
  assert.equal(JSON.parse(response.deliveries[0].body).state.pause.paused,false);

  let moves=0;
  while(true){
   const current=await transmit({kind:"sync",sender:players[0].id});
   const publicState=JSON.parse(current.deliveries[0].body).state;
   if(publicState.hand.status==="complete"){
    assert.equal(publicState.hand.board.length,5);
    assert.equal(publicState.hand.players.reduce((sum,p)=>sum+p.stack,0),100*count);
    assert.ok(publicState.hand.result.pots.length>=1);
    break;
   }
   assert.ok(++moves<60,"stuck poker hand / invalid turn flow");
   const acting=players.findIndex(p=>p.id===publicState.hand.playerToAct);
   assert.ok(acting>=0);
   const only=await transmit({kind:"sync",sender:players[acting].id});
   assert.equal(only.deliveries.length,1);
   assert.equal(only.deliveries[0].to,players[acting].id);
   const legal=JSON.parse(only.deliveries[0].body).private.legal;
   assert.ok(legal,"only acting seat gets private legal actions");
   response=await command(acting,{type:"act",action:legal.toCall>0?"call":"check"});
   expectPrivate(response,true);
  }
  const stranger=await transmit({kind:"sync",sender:"npub1not-seated"});
  assert.deepEqual(stranger,{ok:false,code:"UNAUTHORIZED_OR_INVALID_COMMAND"});
 });
}
