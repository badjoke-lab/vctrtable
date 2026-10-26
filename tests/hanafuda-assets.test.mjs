import test from "node:test";
import assert from "node:assert/strict";
import {CARDS} from "../packages/hanafuda/koikoi.js";
import {FACE_FILES,SOURCE_COMMIT,SOURCE_REPO,sourcePage}
 from "../scripts/hanafuda-card-assets.mjs";

test("all 48 engine card IDs map one-to-one onto unique licensed SVG files",()=>{
 const expected=CARDS.map(c=>c.id);
 assert.equal(FACE_FILES.length,48);
 assert.deepEqual(FACE_FILES.map(c=>c.id),expected);
 assert.equal(new Set(FACE_FILES.map(c=>c.file)).size,48);
 assert.equal(new Set(FACE_FILES.map(c=>c.output)).size,48);
 assert.ok(FACE_FILES.every(c=>c.file.startsWith("Hanafuda_") && c.file.endsWith(".svg")));
});
test("special card artwork maps to the correct subject and month",()=>{
 const byId=Object.fromEntries(FACE_FILES.map(c=>[c.id,c.file]));
 const samples={
  "1-1":"Hanafuda_January_Hikari.svg",  // 松に鶴
  "3-1":"Hanafuda_March_Hikari.svg",    // 桜に幕
  "6-1":"Hanafuda_June_Tane.svg",       // 牡丹に蝶
  "7-1":"Hanafuda_July_Tane.svg",       // 萩に猪
  "8-1":"Hanafuda_August_Hikari.svg",   // 芒に月
  "9-1":"Hanafuda_September_Tane.svg", // 菊に盃
  "10-1":"Hanafuda_October_Tane.svg",   // 紅葉に鹿
  "11-1":"Hanafuda_November_Hikari.svg",// 柳に小野道風
  "12-1":"Hanafuda_December_Hikari.svg" // 桐に鳳凰
 };
 for(const [id,file] of Object.entries(samples))assert.equal(byId[id],file,id);

});
test("pinned GitHub license source is immutable",()=>{
 assert.equal(SOURCE_REPO,"dotty-dev/Hanafuda-Louie-Recolor");
 assert.equal(SOURCE_COMMIT,"a4ac60e4bd60f95ab8c4e5176b50bfd2e3772992");
 assert.equal(sourcePage("Hanafuda_January_Hikari.svg"),
  "https://github.com/dotty-dev/Hanafuda-Louie-Recolor/blob/a4ac60e4bd60f95ab8c4e5176b50bfd2e3772992/svg/Hanafuda_January_Hikari.svg");
});
