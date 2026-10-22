import test from "node:test";
import assert from "node:assert/strict";
import {cardModel,cardPngPath,SUIT_SYMBOLS} from "../apps/poker/cards.js";
import {CARD_NAMES,cardAsset,APPROVED_ZIP_SHA256,APPROVED_CARD_SHA256,downloadCardAssets} from "../scripts/poker-png-assets.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
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
test("User-approved complete 53-PNG deck retains 12 court identities and numeric faces",()=>{
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

test("Exact user-approved ZIP with 52 unique faces and back is bundled offline",async()=>{
 const archive="vctrtable-approved-deck-53-png.zip";
 const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
 assert.equal(hash(fs.readFileSync(archive)),APPROVED_ZIP_SHA256);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"approved-poker-"));
 try{
  assert.equal(await downloadCardAssets(directory),53);
  const files=fs.readdirSync(path.join(directory,"card-png"));
  assert.equal(files.length,53);
  for(const [code,name] of Object.entries(CARD_NAMES)){
   const data=fs.readFileSync(path.join(directory,"card-png",name));
   assert.equal(data.readUInt32BE(16),240);
   assert.equal(data.readUInt32BE(20),336);
   if(APPROVED_CARD_SHA256[code])assert.ok(hash(data).startsWith(APPROVED_CARD_SHA256[code]));
  }
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test("Reject tampered or missing approved ZIP instead of falling back to incorrect cards",async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),"approved-fail-"));
 try{
  await assert.rejects(downloadCardAssets(directory,{archive:path.join(directory,"no-cards.zip")}),/missing/);
  const corrupted=path.join(directory,"tampered.zip");
  const file=fs.readFileSync("vctrtable-approved-deck-53-png.zip");
  file[80]^=0x10;
  fs.writeFileSync(corrupted,file);
  await assert.rejects(downloadCardAssets(directory,{archive:corrupted}),/SHA-256 mismatch/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
