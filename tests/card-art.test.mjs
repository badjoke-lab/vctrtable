import test from "node:test";
import assert from "node:assert/strict";
import {cardModel,cardPngPath,SUIT_SYMBOLS} from "../apps/poker/cards.js";
import {CARD_NAMES,cardAsset} from "../scripts/poker-png-assets.mjs";
import {fullDeck} from "../packages/poker/engine.js";
test("52 cards resolve to distinct PNG files and single blue card back",()=>{
 const ids=new Set();
 for(const card of fullDeck()){
  const m=cardModel(card);
  assert.equal(m.code,card);
  assert.equal(m.rank,card[0]);assert.equal(m.suit,card[1]);
  assert.equal(m.red,card[1]==="H"||card[1]==="D");
  assert.equal(m.symbol,SUIT_SYMBOLS[card[1]]);
  assert.equal(cardPngPath(card),"./"+cardAsset(card));
  assert.match(cardPngPath(card),/\.png$/);
  ids.add(cardPngPath(card));
 }
 assert.equal(ids.size,52);
 assert.equal(Object.keys(CARD_NAMES).length,53);
 assert.equal(cardPngPath("BACK"),"./card-png/backdesign_1.png");
 assert.equal(cardAsset("BACK"),"card-png/backdesign_1.png");
});
test("Traditional CC0 raster deck retains 12 court identities and numeric faces",()=>{
 for(const suit of "CDHS")for(const rank of "JQK"){
  assert.equal(cardModel(rank+suit).court,true);
  assert.ok(CARD_NAMES[rank+suit].endsWith(".png"));
 }
 for(const suit of "CDHS")for(const rank of "23456789TA")
  assert.equal(cardModel(rank+suit).court,false);
});
test("reject invalid or forged card file names",()=>{
 for(const bad of ["10H","1D","AC ","AHH","ZZ","",null,{},undefined])
  assert.throws(()=>cardModel(bad),/Invalid card/);
 for(const bad of ["joker","../secret","BAX",""])assert.throws(()=>cardAsset(bad),/Unsupported PNG/);
});
