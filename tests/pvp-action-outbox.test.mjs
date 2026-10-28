import test from "node:test";
import assert from "node:assert/strict";
import {SeatActionOutbox} from "../packages/poker/pvp-action-outbox.js";
const action=()=>({v:1,app:"vctrtable-pvp",kind:"action",id:"unchanged-uuid",
 by:"alice",tableId:"room-123",revision:8,action:"raise",target:45,sig:"signature"});
test("lost and rejected updates reuse exact original signed packet",async()=>{
 const box=new SeatActionOutbox(); const original=action();
 box.prepare(original);
 let attempts=[];
 await assert.rejects(box.transmit(p=>{attempts.push(p);throw Error("WebXDC rejected");},1000),/WebXDC rejected/);
 assert.equal(box.attempts,1);
 assert.equal(box.failure,"WebXDC rejected");
 assert.deepEqual(box.retryPacket(),original);
 await box.transmit(p=>{attempts.push(p);return Promise.resolve();},1500);
 assert.equal(box.attempts,2);
 assert.equal(box.failure,null);
 assert.deepEqual(attempts,[original,original]);
 assert.notStrictEqual(attempts[0],attempts[1]);
});
test("retry only on same table, unchanged revision and same acting seat",()=>{
 const box=new SeatActionOutbox();box.prepare(action());
 const good={tableId:"room-123",revision:8,playerId:"alice",turnId:"alice"};
 assert.equal(box.canRetry(good),true);
 for(const invalid of [{paused:true},{revision:9},{tableId:"other"},{turnId:"bob"},{playerId:"bob"}])
  assert.equal(box.canRetry({...good,...invalid}),false);
 assert.equal(box.acknowledge("room-123",8),false);
 assert.equal(box.acknowledge("another-room",9),false);
 assert.equal(box.acknowledge("room-123",9),true);
 assert.equal(box.packet,null);
 assert.equal(box.canRetry(good),false);
});
test("fail closed against second command and untrusted outbox input",()=>{
 const box=new SeatActionOutbox();
 assert.throws(()=>box.prepare({...action(),sig:null}),/signed/);
 assert.throws(()=>box.retryPacket(),/No pending/);
 box.prepare(action());
 assert.throws(()=>box.prepare({...action(),id:"new-uuid"}),/already awaiting/);
 box.reset();assert.equal(box.packet,null);
});
