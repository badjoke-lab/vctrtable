import test from "node:test";
import assert from "node:assert/strict";
import {capturePreview,matchingFieldCards,yakuProgress,publicYakuOutlook} from "../packages/hanafuda/guide.js";

test("selection and previews are immutable and handle zero, one, two, three matches",()=>{
 for(const [field,expected] of [
  [["3-1"],0],[["7-1"],1],[["7-1","7-2"],2],[["7-1","7-2","7-3"],3]
 ]) {
  const snapshot=JSON.stringify({field,captured:[]});
  const targets=matchingFieldCards(field,"7-4");
  assert.equal(targets.length,expected);
  const p=capturePreview([],field,"7-4");
  assert.equal(p.matches.length,expected);
  assert.equal(p.ready,expected!==2);
  assert.deepEqual(p.taken,expected===0?[]:expected===1?["7-1"]:expected===2?[]:["7-1","7-2","7-3"]);
  assert.equal(snapshot,JSON.stringify({field,captured:[]}));
 }
});
test("two-field match requires a legal target and previews only the selected capture",()=>{
 const field=["1-1","1-2"],own=["2-2","3-2"];
 assert.equal(capturePreview(own,field,"1-3").ready,false);
 const p=capturePreview(own,field,"1-3","1-2");
 assert.equal(p.ready,true);
 assert.deepEqual(p.taken,["1-2"]);
 assert.equal(p.addedPoints,5);
 assert.ok(p.newYaku.some(v=>v.key==="akatan"));
 assert.deepEqual(field,["1-1","1-2"]);
 assert.deepEqual(own,["2-2","3-2"]);
});
test("progress accounts for cup's extra plain value without revealing other hands",()=>{
 const own=["7-1","10-1","9-1",...["1-3","1-4","2-3","2-4","3-3","3-4","4-3","4-4","5-3"]];
 const groups=Object.fromEntries(yakuProgress(own).map(p=>[p.key,p]));
 assert.equal(groups.inoshikacho.have,2);
 assert.deepEqual(groups.inoshikacho.missing,["6-1"]);
 assert.equal(groups.kasu.have,10);
 assert.equal(groups.kasu.total,10);
 assert.equal(groups.tsukimi.have,1);
 assert.equal(groups.hanami.have,1);
});
test("invalid card IDs are not legal candidates",()=>{
 assert.throws(()=>matchingFieldCards(["9-99"],"1-1"),/Unknown card/);
 assert.throws(()=>capturePreview([],[],"bad"),/Unknown card/);
});

test("Opponent set threat shows public progress and privately known held key cards",()=>{
 const theirs=["7-1","10-1"];
 const ours=["1-3","2-3"];
 const hand=["6-1","4-1"];
 const snapshot=JSON.stringify({theirs,ours,hand});
 const outlook=publicYakuOutlook(theirs,ours,hand);
 const boar=outlook.find(p=>p.key==="inoshikacho");
 assert.equal(boar.have,2);
 assert.equal(boar.need,3);
 assert.equal(boar.oneAway,true);
 assert.deepEqual(boar.heldIds,["6-1"]);
 assert.equal(boar.impossible,false);
 assert.equal(snapshot,JSON.stringify({theirs,ours,hand}),"Guidance is read-only");
});
test("Captured unique prerequisite blocks opponent from completing a named yaku",()=>{
 const theirs=["7-1","10-1"];
 const ours=["6-1"];
 const entry=publicYakuOutlook(theirs,ours).find(p=>p.key==="inoshikacho");
 assert.equal(entry.impossible,true);
 assert.equal(entry.oneAway,false);
 assert.deepEqual(entry.blockedIds,["6-1"]);
});
test("Type-based yaku can be blocked without inventing hidden information",()=>{
 const ours=["2-1","4-1","5-1","6-1","7-1"];
 const entry=publicYakuOutlook(["9-1"],ours).find(p=>p.key==="tane");
 assert.equal(entry.possibleTotal,4);
 assert.equal(entry.impossible,true);
});
