import test from "node:test";
import assert from "node:assert/strict";
import {CARDS} from "../packages/hanafuda/koikoi.js";
import {FACE_FILES,BACK_FILE,commonsFileUrl,licensePage}
 from "../scripts/hanafuda-card-assets.mjs";

test("all 48 engine card IDs map one-to-one onto unique licensed SVG files",()=>{
 const expected=CARDS.map(c=>c.id);
 assert.equal(FACE_FILES.length,48);
 assert.deepEqual(FACE_FILES.map(c=>c.id),expected);
 assert.equal(new Set(FACE_FILES.map(c=>c.file)).size,48);
 assert.equal(new Set(FACE_FILES.map(c=>c.output)).size,48);
 assert.ok(FACE_FILES.every(c=>c.file.startsWith("Hanafuda_") && c.file.endsWith("_Alt.svg")));
});
test("special card artwork maps to the correct subject and month",()=>{
 const byId=Object.fromEntries(FACE_FILES.map(c=>[c.id,c.file]));
 const samples={
  "1-1":"Hanafuda_January_Hikari_Alt.svg",  // 松に鶴
  "3-1":"Hanafuda_March_Hikari_Alt.svg",    // 桜に幕
  "6-1":"Hanafuda_June_Tane_Alt.svg",       // 牡丹に蝶
  "7-1":"Hanafuda_July_Tane_Alt.svg",       // 萩に猪
  "8-1":"Hanafuda_August_Hikari_Alt.svg",   // 芒に月
  "9-1":"Hanafuda_September_Tane_Alt.svg", // 菊に盃
  "10-1":"Hanafuda_October_Tane_Alt.svg",   // 紅葉に鹿
  "11-1":"Hanafuda_November_Hikari_Alt.svg",// 柳に小野道風
  "12-1":"Hanafuda_December_Hikari_Alt.svg" // 桐に鳳凰
 };
 for(const [id,file] of Object.entries(samples))assert.equal(byId[id],file,id);
 assert.equal(BACK_FILE,"Hanafuda_card_back_Alt.svg");
});
test("asset URLs match Wikimedia Commons upload namespace and license links",()=>{
 const file="Hanafuda_January_Hikari_Alt.svg";
 assert.equal(commonsFileUrl(file),
  "https://upload.wikimedia.org/wikipedia/commons/1/15/Hanafuda_January_Hikari_Alt.svg");
 assert.equal(licensePage(file),
  "https://commons.wikimedia.org/wiki/File:Hanafuda_January_Hikari_Alt.svg");
});
