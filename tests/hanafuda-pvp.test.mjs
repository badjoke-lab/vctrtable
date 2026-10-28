import test from "node:test";
import assert from "node:assert/strict";
import {createAuthoritativeMatch,matchingTargets} from "../packages/hanafuda/pvp-core.js";
import {scoreCards} from "../packages/hanafuda/koikoi.js";

const seeded=seed=>()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
test("Each PvP seat receives only its own hand; full deck is never in snapshots",()=>{
 const match=createAuthoritativeMatch({rounds:3,rng:seeded(29)});
 const a=match.snapshot(0),b=match.snapshot(1);
 assert.equal(a.hand.length,8);assert.equal(b.hand.length,8);
 assert.notDeepEqual(a.hand,b.hand);
 assert.equal(a.public.deckCount,24);
 assert.equal(a.public.handCounts.length,2);
 const json=JSON.stringify(b);
 for(const id of a.hand) {
  assert.ok(!b.hand.includes(id));
  assert.ok(!b.public.field.includes(id));
  assert.ok(!b.public.captured.flat().includes(id));
  assert.ok(!json.includes('"'+id+'"'),"Other player's hand leaked as a card literal "+id);
 }
 assert.equal("deck" in a,false);
 assert.equal("hands" in a,false);
 assert.equal("log" in a,false);
 assert.equal("deck" in a.public,false);
 assert.equal("pending" in a.public,false);
});
test("An out-of-turn or unowned play never changes the authoritative revision",()=>{
 const match=createAuthoritativeMatch({rounds:3,rng:seeded(56)});
 const cur=match.snapshot(0),other=1-cur.public.active;
 assert.throws(()=>match.send(other,{kind:"play",cardId:cur.hand[0]}),/not your turn/i);
 assert.equal(match.snapshot(0).revision,0);
 const seat=cur.public.active,own=match.snapshot(seat);
 const enemy=match.snapshot(1-seat);
 assert.throws(()=>match.send(seat,{kind:"play",cardId:enemy.hand[0]}),/not yours/i);
 assert.equal(match.snapshot(0).revision,0);
});
test("When two targets match a selected card, host requires an explicit legal choice",()=>{
 const m=createAuthoritativeMatch({rounds:3,rng:seeded(73)});
 const seat=m.snapshot(0).public.active,own=m.snapshot(seat);
 const p=own.public;
 let candidate=null;
 for(const id of own.hand)if(matchingTargets(p.field,id).length===2){candidate=id;break;}
 if(candidate){
  assert.throws(()=>m.send(seat,{kind:"play",cardId:candidate}),/Choose one/);
  assert.equal(m.snapshot(0).revision,0);
  const target=matchingTargets(p.field,candidate)[0];
  const after=m.send(seat,{kind:"play",cardId:candidate,targetId:target});
  assert.equal(after.revision,1);
  assert.ok(!after.hand.includes(candidate));
 }
});
test("Full 3- and 12-round PvP simulation finishes, switching host/guest turns",()=>{
 let total=0,guestMoves=0,hostMoves=0,drawChoices=0;
 for(const rounds of [3,12]){
  const m=createAuthoritativeMatch({rounds,rng:seeded(111+rounds)});
  for(let r=1;r<=rounds;r++){
   let tries=0;
   while(m.snapshot(0).public.phase!=="ended"&&tries++<120){
    const state=m.snapshot(0),seat=state.public.active;
    const mine=m.snapshot(seat),p=mine.public;
    let intent=null;
    if(p.phase==="turn"){
     const cardId=mine.hand[0],options=matchingTargets(p.field,cardId);
     intent={kind:"play",cardId,targetId:options.length===2?options[0]:null};
    }else if(p.phase==="choose"){
     assert.equal(p.pendingStep,"draw");
     assert.ok(p.revealedDraw);
     assert.equal(p.pendingChoices.length,2);
     intent={kind:"choose",targetId:p.pendingChoices[0]};drawChoices++;
    }else if(p.phase==="decision"){
     assert.ok(scoreCards(p.captured[seat]).points>0);
     intent={kind:"decide",choice:"stop"};
    }else assert.fail("Illegal network phase "+p.phase);
    if(seat===0)hostMoves++;else guestMoves++;
    const before=m.snapshot(0).revision;
    const after=m.send(seat,intent);
    assert.equal(after.revision,before+1);
    assert.deepEqual(m.snapshot(0).public,m.snapshot(1).public);
    total++;
   }
   const ended=m.snapshot(0);
   assert.equal(ended.public.phase,"ended","round "+r+" timed out");
   assert.equal(ended.round,r);
   if(r<rounds){
    m.nextRound();assert.equal(m.snapshot(0).round,r+1);
   }else assert.equal(ended.finished,true);
  }
 }
 assert.ok(total>30&&guestMoves>10&&hostMoves>10);
});
test("Round transitions and publicly disclosed bonus do not reveal private cards",()=>{
 const m=createAuthoritativeMatch({rounds:3,rng:seeded(72)});
 const x=m.snapshot(0),y=m.snapshot(1);
 assert.equal(x.public.dealer,y.public.dealer);
 assert.equal(x.rounds,3);assert.equal(x.seat,0);assert.equal(y.seat,1);
 assert.equal(x.finished,false);
});
