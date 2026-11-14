import test from "node:test";
import assert from "node:assert/strict";
import {createAuthoritativeMatch,validateHostCheckpoint,matchingTargets} from "../packages/hanafuda/pvp-core.js";

const rng=seed=>()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);

test("Host-only checkpoint recovers the exact dealt deck, both hands, scores and turn",()=>{
 const host=createAuthoritativeMatch({rounds:12,rng:rng(782)});
 const beforeHost=host.snapshot(0),beforeGuest=host.snapshot(1);
 const saved=host.hostCheckpoint();
 assert.equal(saved.format,1);
 assert.equal(saved.game.deck.length,24);
 assert.equal(saved.game.hands[0].length,8);
 assert.equal(saved.game.hands[1].length,8);
 // The saved checkpoint is private. Neither recipient-scoped snapshot may
 // include the ordered private deck or the other player's hand.
 assert.equal("game" in beforeHost,false);
 assert.equal("game" in beforeGuest,false);
 assert.equal("deck" in beforeGuest,false);
 const recovered=createAuthoritativeMatch({restore:JSON.parse(JSON.stringify(saved))});
 assert.deepEqual(recovered.snapshot(0),beforeHost);
 assert.deepEqual(recovered.snapshot(1),beforeGuest);
 assert.deepEqual(recovered.hostCheckpoint(),saved);
});
test("Host resume works after each legal PvP action, including draw target choice",()=>{
 let host=createAuthoritativeMatch({rounds:3,rng:rng(809)});
 let moves=0,drawTargets=0;
 for(let i=0;i<220;i++){
  const p=host.snapshot(0).public;
  if(p.phase==="ended"){
   if(host.snapshot(0).finished)break;
   host.nextRound();
  }else {
   const seat=p.active,own=host.snapshot(seat);
   let action;
   if(p.phase==="turn"){
    const cardId=own.hand[0];
    const targets=matchingTargets(p.field,cardId);
    action={kind:"play",cardId,targetId:targets.length===2?targets[0]:null};
   }else if(p.phase==="choose"){
    assert.equal(p.pendingStep,"draw");
    action={kind:"choose",targetId:p.pendingChoices[0]};
    drawTargets++;
   }else if(p.phase==="decision"){
    action={kind:"decide",choice:"stop"};
   }else assert.fail("Unexpected phase "+p.phase);
   host.send(seat,action);moves++;
  }
  const save=JSON.parse(JSON.stringify(host.hostCheckpoint()));
  const hostView=host.snapshot(0),guestView=host.snapshot(1);
  host=createAuthoritativeMatch({restore:save,rng:rng(1800+i)});
  assert.deepEqual(host.snapshot(0),hostView);
  assert.deepEqual(host.snapshot(1),guestView);
 }
 assert.equal(host.snapshot(0).finished,true,"a restored match must finish all rounds");
 assert.ok(moves>20);
 assert.equal(host.snapshot(0).scores.every(Number.isSafeInteger),true);
});
test("Already settled rounds are not awarded a second time after restore",()=>{
 let m=createAuthoritativeMatch({rounds:3,rng:rng(930)});
 let guard=0;
 while(m.snapshot(0).public.phase!=="ended"&&guard++<70){
  const seat=m.snapshot(0).public.active,p=m.snapshot(seat).public;
  if(p.phase==="turn"){
   const hand=m.snapshot(seat).hand,id=hand[0],targets=matchingTargets(p.field,id);
   m.send(seat,{kind:"play",cardId:id,targetId:targets.length===2?targets[0]:null});
  }else if(p.phase==="choose")m.send(seat,{kind:"choose",targetId:p.pendingChoices[0]});
  else if(p.phase==="decision")m.send(seat,{kind:"decide",choice:"stop"});
 }
 assert.equal(m.snapshot(0).public.phase,"ended");
 const scores=m.snapshot(0).scores,checkpoint=m.hostCheckpoint();
 assert.equal(checkpoint.settled,true);
 for(let i=0;i<5;i++){
  m=createAuthoritativeMatch({restore:checkpoint,rng:rng(3300+i)});
  assert.deepEqual(m.snapshot(0).scores,scores);
 }
 m.nextRound();
 assert.equal(m.snapshot(0).round,2);
});
test("Reject incomplete, duplicated, unknown or incoherently scored secret checkpoints",()=>{
 const valid=createAuthoritativeMatch({rounds:3,rng:rng(944)}).hostCheckpoint();
 const mutate=fn=>{
  const cp=JSON.parse(JSON.stringify(valid));fn(cp);
  assert.throws(()=>validateHostCheckpoint(cp));
 };
 mutate(cp=>cp.game.deck.pop());
 mutate(cp=>cp.game.deck[0]=cp.game.hands[0][0]);
 mutate(cp=>cp.game.deck[0]="25-7");
 mutate(cp=>cp.round=4);
 mutate(cp=>cp.revision=-10);
 mutate(cp=>cp.settled=true);
 mutate(cp=>cp.game.phase="choose");
 mutate(cp=>cp.game.captured[1].push(cp.game.field[0]));
 assert.deepEqual(validateHostCheckpoint(valid),valid);
});
test("Checkpoint is a deep copy; altering returned save cannot mutate the live match",()=>{
 const m=createAuthoritativeMatch({rounds:3,rng:rng(995)});
 const original=m.snapshot(0);
 const save=m.hostCheckpoint();
 save.game.deck.reverse();
 save.game.hands[0].reverse();
 save.scores[0]=999999;
 assert.deepEqual(m.snapshot(0),original);
});
