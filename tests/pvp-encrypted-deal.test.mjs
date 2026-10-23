import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {seatKeys,publicKeys,signPacket,verifyPacket,sealForRecipient,
 unsealForRecipient} from "../apps/poker/pvp-crypto.js";
import {makeHostSession,makeStateEvent,readMyHand,makeSignedAction,
 acceptSignedAction,nextHostHand} from "../apps/poker/pvp-game.js";
import {legalActions,totalChips} from "../packages/poker/engine.js";
globalThis.crypto??=webcrypto;
const roster=()=>({table:{id:"room-test",host:"alice",maxPlayers:2},
 seats:new Map([["alice","Alice"],["bob","Bob"]]),
 ready:new Set(["alice","bob"]),
 proposal:{event:{settings:{chips:1000,sb:5,bb:10,timer:30,rebuy:true}},
  approvals:new Set(["alice","bob"])}});
test("two independent browser-seat keys encrypt each private hand and sign betting actions",async()=>{
 const a=await seatKeys("host-test"),b=await seatKeys("guest-test");
 const ap=await publicKeys(a),bp=await publicKeys(b);
 const peers=new Map([["alice",ap],["bob",bp]]);
 const session=makeHostSession(roster());
 nextHostHand(session);
 const event=await makeStateEvent({session,keys:a,host:"alice",
  tableId:"room-test",peers,seq:1});
 assert.equal(event.kind,"state");
 assert.equal(await verifyPacket(event,ap.sign),true);
 const raw=JSON.stringify(event);
 assert.equal(raw.includes('"hole":'),false);
 assert.equal(raw.includes('"deck":'),false);
 const alice=await readMyHand({packet:event,keys:a,hostPublic:ap,me:"alice"});
 const bob=await readMyHand({packet:event,keys:b,hostPublic:ap,me:"bob"});
 assert.equal(alice.length,2);
 assert.equal(bob.length,2);
 assert.equal(new Set([...alice,...bob]).size,4);
 await assert.rejects(readMyHand({packet:event,keys:b,hostPublic:ap,me:"alice"}));
 const corrupted=structuredClone(event);
 corrupted.state.pot=999999;
 assert.equal(await verifyPacket(corrupted,ap.sign),false);
 const L=legalActions(session.table);
 const actor=L.playerId;
 const signer=actor==="alice"?a:b;
 const move=await makeSignedAction(signer,{me:actor,tableId:"room-test",
   revision:1,action:"fold"});
 await acceptSignedAction({packet:move,session,peers,tableId:"room-test",revision:1});
 assert.equal(session.table.hand.status,"complete");
 assert.equal(totalChips(session.table),2000);
 const signedByWrongKey=await makeSignedAction(actor==="alice"?b:a,
  {me:actor,tableId:"room-test",revision:2,action:"call"});
 await assert.rejects(acceptSignedAction({packet:signedByWrongKey,session,
  peers,tableId:"room-test",revision:2}),/signature/);
});
test("no raw hole cards, deck order or signing keys in outbound state",async()=>{
 const a=await seatKeys("test-no-secret-a"),b=await seatKeys("test-no-secret-b");
 const pubA=await publicKeys(a),pubB=await publicKeys(b);
 const privateData={hole:["AH","2S"]};
 const encrypted=await sealForRecipient(a,pubB,privateData);
 assert.deepEqual(await unsealForRecipient(b,pubA,encrypted),privateData);
 assert.equal(JSON.stringify(encrypted).includes('"hole":'),false);
 await assert.rejects(unsealForRecipient(a,pubA,encrypted));
 const signer=await signPacket(a,{kind:"action",by:"alice",action:"fold"});
 assert.equal(await verifyPacket(signer,pubA.sign),true);
 const impostor={...signer,by:"bob"};
 assert.equal(await verifyPacket(impostor,pubA.sign),false);
});
test("host cannot start hand before unanimous agreement",()=>{
 const r=roster();r.proposal.approvals.delete("bob");
 assert.throws(()=>makeHostSession(r),/unanimously/);
 r.proposal.approvals.add("bob");r.ready.delete("alice");
 assert.throws(()=>makeHostSession(r),/ready/);
});
