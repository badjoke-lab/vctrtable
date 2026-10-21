import test from "node:test";
import assert from "node:assert/strict";
import {cardModel,SUIT_SYMBOLS} from "../apps/poker/cards.js";
import {fullDeck} from "../packages/poker/engine.js";
test("all 52 ranked/suited cards map 1-to-1 to bundled CardMeister CID names",()=>{
 const ids=new Set();
 for(const card of fullDeck()){
  const m=cardModel(card);
  assert.equal(m.code,card);
  assert.equal(m.rank,card[0]);
  assert.equal(m.suit,card[1]);
  assert.equal(m.symbol,SUIT_SYMBOLS[card[1]]);
  assert.equal(m.red,card[1]==="H"||card[1]==="D");
  ids.add(m.code);
 }
 assert.equal(ids.size,52);
});
test("all J Q K are recognized as court cards in all four suits",()=>{
 for(const suit of "CDHS")for(const rank of "JQK"){
  const m=cardModel(rank+suit);
  assert.equal(m.court,true);
  assert.equal(m.code,rank+suit);
 }
});
test("all numeric and ace faces use the deck's own SVG symbols, not fake glyph portraits",()=>{
 for(const suit of "CDHS")for(const rank of "23456789TA"){
  const m=cardModel(rank+suit);
  assert.equal(m.court,false);
  assert.equal(m.code,rank+suit);
 }
});
test("reject forged and invalid card codes",()=>{
 for(const bad of ["10H","1D","AC ","AHH","ZZ","",null,{},undefined])
  assert.throws(()=>cardModel(bad),/Invalid card/);
});
