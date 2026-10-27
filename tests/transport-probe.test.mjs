import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {makePing,makeAck,validProbe,ProbeTracker,hostCapabilities} from "../packages/poker/transport-probe.js";
globalThis.crypto??=webcrypto;
test("diagnostics send only strict public nonsecret envelopes",()=>{
 const ping=makePing("alice",1000),ack=makeAck(ping,"bob",1400);
 assert.equal(validProbe(ping),true);assert.equal(validProbe(ack),true);
 for(const secret of ["hole","deck","npub","privateKey","nsec","session","command"])
  assert.equal(JSON.stringify({ping,ack}).includes('"'+secret+'"'),false);
 assert.equal(validProbe({...ping,hole:["AS","KS"]}),false);
 assert.equal(validProbe({...ack,privateKey:"secret"}),false);
 assert.equal(validProbe({...ping,kind:"unknown"}),false);
 assert.equal(validProbe({...ack,ref:"bad"}),false);
 assert.throws(()=>makeAck(ping,"alice",1500),/Invalid/);
});
test("ping/ack with serial gaps, replay, stale and foreign replies",()=>{
 const ping=makePing("alice",1000);
 const a=new ProbeTracker("alice"),b=new ProbeTracker("bob");
 a.begin(ping);
 assert.deepEqual(a.ingest(ping,2,1100),{type:"own-echo"});
 assert.equal(a.ingest(ping,2,1200),null);
 assert.equal(b.ingest(ping,5,1300).type,"peer-ping");
 const ack=makeAck(ping,"bob",1500);
 assert.equal(a.ingest(ack,8,1685).roundTripMs,685);
 assert.equal(a.ingest(ack,9,1700),null);
 assert.equal(a.ack.roundTripMs,685);
 assert.equal(a.lastSerial,8);
 const unrelated=makePing("charlie",1750);
 assert.equal(a.ingest(makeAck(unrelated,"bob",1800),11,2000),null);
 assert.equal(a.ack.roundTripMs,685);
 a.begin(makePing("alice",2500));
 assert.equal(a.ack,null);
 assert.equal(a.ingest(ack,12,3000),null);
 assert.equal(a.ingest({...ack,id:"duplicate_other_nonce"},14,3000),null);
});
test("WebXDC capability report does not imply account verification",()=>{
 assert.deepEqual(hostCapabilities(null),{
  ready:false,sendUpdateInterval:10000,sendUpdateMaxSize:128000,realtimeAdvertised:false});
 assert.deepEqual(hostCapabilities({selfAddr:"a",sendUpdate(){},setUpdateListener(){},
  sendUpdateInterval:1234,sendUpdateMaxSize:54321,joinRealtimeChannel(){}}),{
  ready:true,sendUpdateInterval:1234,sendUpdateMaxSize:54321,realtimeAdvertised:true});
 assert.equal(hostCapabilities({selfAddr:"",sendUpdate(){},setUpdateListener(){}}).ready,false);
});
