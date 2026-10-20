import test from "node:test";
import assert from "node:assert/strict";
import {evaluate,showdown,compareScores} from "../packages/poker/hand.js";
const categories=[
 [8,["AS","KS","QS","JS","TS"]],[7,["AC","AD","AH","AS","3D"]],
 [6,["KC","KD","KH","2C","2D"]],[5,["AC","JC","8C","4C","2C"]],
 [4,["5C","4H","3C","2D","AS"]],[3,["9C","9D","9H","AS","3S"]],
 [2,["KC","KD","8H","8D","AS"]],[1,["KC","KD","3H","8D","AS"]],
 [0,["AC","KD","3H","8D","TS"]]
];
for(const [cat,cards] of categories)test("category "+cat,()=>assert.equal(evaluate(cards).category,cat));
test("wheel is five-high",()=>assert.deepEqual(evaluate(["AS","2D","3C","4H","5S"]).score,[4,5]));
test("best of seven chooses royal flush",()=>assert.deepEqual(evaluate(["AS","KS","QS","JS","TS","2C","2D"]).score,[8,14]));
test("kicker breaks one-pair tie",()=>assert.equal(compareScores(evaluate(["AC","AD","KC","9S","2C"]).score,evaluate(["AS","AH","QC","9H","2D"]).score),1));
test("two pair sorts rank then kicker",()=>assert.deepEqual(evaluate(["AC","AD","KC","KD","2C"]).score,[2,14,13,2]));
test("showdown board tie",()=>assert.deepEqual(showdown(["AS","KS","QS","JS","TS"],[["2C","3D"],["4C","5D"]]).winners,[0,1]));
test("showdown winner",()=>assert.deepEqual(showdown(["AS","KD","QH","2C","3S"],[["AD","AH"],["KC","KH"]]).winners,[0]));
test("invalid and duplicated cards rejected",()=>{
 assert.throws(()=>evaluate(["AS","AS","QS","JS","TS"]),/Duplicate/);
 assert.throws(()=>evaluate(["1S","KS","QS","JS","TS"]),/Invalid/);
 assert.throws(()=>showdown(["AS","KD","QH","2C","3S"],[["AS","AH"],["KC","KH"]]),/Duplicate/);
});
test("two possible full houses choose best",()=>assert.deepEqual(evaluate(["AS","AH","AD","KC","KH","KS","2C"]).score,[6,14,13]));
