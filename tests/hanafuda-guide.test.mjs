import test from "node:test";
import assert from "node:assert/strict";
import {capturePreview,matchingFieldCards,yakuProgress} from "../packages/hanafuda/guide.js";

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
