import test from "node:test";
import assert from "node:assert/strict";
import {cardModel,SUIT_SYMBOLS} from "../apps/poker/cards.js";
import {fullDeck} from "../packages/poker/engine.js";
const expected={2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,T:10};
test("each of all 52 cards has a supported front model",()=>{
 for(const card of fullDeck()){
  const m=cardModel(card);
  assert.equal(m.rank,card[0]);assert.equal(m.suit,card[1]);
  assert.equal(m.symbol,SUIT_SYMBOLS[card[1]]);
  assert.equal(m.red,card[1]==="H"||card[1]==="D");
 }
});
test("every numeric card has exactly its number of traditionally arranged pips",()=>{
 for(const suit of "CDHS")for(const [rank,n] of Object.entries(expected)){
  const m=cardModel(rank+suit);
  assert.equal(m.court,false);
  assert.equal(m.pips.length,n);
  assert.equal(new Set(m.pips.map(p=>p.join(","))).size,n);
  assert.ok(m.pips.every(([x,y])=>x>=20&&x<=80&&y>=10&&y<=90));
 }
});
test("J Q K have distinct illustrated court models, ace has dedicated art",()=>{
 for(const suit of "CDHS"){
  for(const rank of "JQK"){const m=cardModel(rank+suit);assert.equal(m.court,true);assert.equal(m.pips,null);}
  const ace=cardModel("A"+suit);assert.equal(ace.court,false);assert.equal(ace.pips,null);
 }
});
test("reject forged and invalid card codes",()=>{
 for(const bad of ["10H","1D","AC ","AHH","ZZ","",null,{},undefined])assert.throws(()=>cardModel(bad),/Invalid card/);
});
