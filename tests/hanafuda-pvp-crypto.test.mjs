import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {createEphemeralIdentity,deriveKey,pairingCode,sealMessage,openMessage} from "../packages/hanafuda/pvp-crypto.js";
if(!globalThis.crypto)globalThis.crypto=webcrypto;

test("Two people derive the same 6-digit pairing code and can exchange encrypted snapshots",async()=>{
 const host=await createEphemeralIdentity(),guest=await createEphemeralIdentity();
 const code=await pairingCode("room-12",host.publicKey,guest.publicKey);
 assert.match(code,/^[0-9]{6}$/);
 assert.equal(code,await pairingCode("room-12",host.publicKey,guest.publicKey));
 const hostKey=await deriveKey(host,guest.publicKey);
 const guestKey=await deriveKey(guest,host.publicKey);
 const privateSnapshot={kind:"snapshot",data:{
  seat:1,hand:["1-1","3-2","10-1"],public:{field:["9-2"],deckCount:24}
 }};
 const header={room:"room-12",from:"host",to:"guest"};
 const packet=await sealMessage(hostKey,header,privateSnapshot);
 assert.equal(packet.kind,"sealed");
 assert.ok(!JSON.stringify(packet).includes('"1-1"'));
 assert.ok(!JSON.stringify(packet).includes('"3-2"'));
 assert.deepEqual(await openMessage(guestKey,packet,header),privateSnapshot);
 assert.notEqual(packet.iv, (await sealMessage(hostKey,header,privateSnapshot)).iv);
});
test("Authenticated encryption rejects wrong room, recipient and third-party keys",async()=>{
 const host=await createEphemeralIdentity(),guest=await createEphemeralIdentity();
 const attacker=await createEphemeralIdentity();
 const hkey=await deriveKey(host,guest.publicKey);
 const gkey=await deriveKey(guest,host.publicKey);
 const akey=await deriveKey(attacker,host.publicKey);
 const header={room:"this-game",from:"host",to:"guest"};
 const sealed=await sealMessage(hkey,header,{kind:"intent",cardId:"1-1"});
 await assert.rejects(openMessage(gkey,sealed,{...header,to:"attacker"}),/Wrong session/);
 await assert.rejects(openMessage(gkey,sealed,{...header,room:"other"}),/Wrong session/);
 await assert.rejects(openMessage(akey,sealed,header));
 await assert.rejects(openMessage(gkey,{...sealed,iv:"invalid@@@"},header));
});
test("Pairing code depends on both participants, preventing unverified replacement",async()=>{
 const h=await createEphemeralIdentity(),g=await createEphemeralIdentity();
 const intruder=await createEphemeralIdentity();
 const expected=await pairingCode("room",h.publicKey,g.publicKey);
 const different=await pairingCode("room",h.publicKey,intruder.publicKey);
 assert.notEqual(expected,different);
});
