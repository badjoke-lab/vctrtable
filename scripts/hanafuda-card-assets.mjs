/**
 * Build-time acquisition of the complete, consistent 48-face Commons Hanafuda deck.
 *
 * Original SVG drawings: Louie Mantia; recolor: dotty-dev.
 * Pinned SVG recolor at a fixed GitHub commit; card back made for this QA app.
 * CC BY-SA 4.0. See docs/HANAFUDA-ASSET-LICENSE.md.
 *
 * We fetch only at build time, so the resulting .xdc contains all images and
 * does not need to contact Wikimedia, disclose a player's IP or render remote
 * image resources at runtime.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {spawnSync} from "node:child_process";
export const SOURCE_COMMIT="a4ac60e4bd60f95ab8c4e5176b50bfd2e3772992";
export const SOURCE_REPO="dotty-dev/Hanafuda-Louie-Recolor";

const MONTHS=["January","February","March","April","May","June",
 "July","August","September","October","November","December"];
const FACE_KINDS=[
 ["Hikari","Tanzaku","Kasu 1","Kasu 2"],
 ["Tane","Tanzaku","Kasu 1","Kasu 2"],
 ["Hikari","Tanzaku","Kasu 1","Kasu 2"],
 ["Tane","Tanzaku","Kasu 1","Kasu 2"],
 ["Tane","Tanzaku","Kasu 1","Kasu 2"],
 ["Tane","Tanzaku","Kasu 1","Kasu 2"],
 ["Tane","Tanzaku","Kasu 1","Kasu 2"],
 ["Hikari","Tane","Kasu 1","Kasu 2"],
 ["Tane","Tanzaku","Kasu 1","Kasu 2"],
 ["Tane","Tanzaku","Kasu 1","Kasu 2"],
 ["Hikari","Tane","Tanzaku","Kasu"],
 ["Hikari","Kasu 1","Kasu 2","Kasu 3"]
];
export const FACE_FILES=Object.freeze(FACE_KINDS.flatMap((types,m)=>
 types.map((kind,i)=>Object.freeze({
   id:`${m+1}-${i+1}`,
   file:`Hanafuda_${MONTHS[m]}_${kind.replaceAll(" ","_")}.svg`,
   output:`cards/${m+1}-${i+1}.svg`
 }))
));
export const BACK_FILE="Hanafuda_card_back_Alt.svg";
export function sourcePage(filename) { return `https://github.com/${SOURCE_REPO}/blob/${SOURCE_COMMIT}/svg/${filename}`; }
function validateSvg(text,id) {
  if(text.length<200 || text.length>250000 || !/<svg\b/i.test(text)) {
    throw Error(`Invalid SVG structure/size for ${id}`);
  }
  if(/<script\b|<foreignObject\b|\bon\w+\s*=|\b(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:|\/\/)/i.test(text)) {
    throw Error(`Untrusted SVG active or remote content in ${id}`);
  }
  return text;
}
const BACK_SVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 976 1600"><rect width="976" height="1600" fill="#181311"/><rect x="30" y="30" width="916" height="1540" rx="14" fill="#852f30" stroke="#d2b077" stroke-width="19"/><defs><pattern id="p" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M60 4L116 60L60 116L4 60Z" fill="none" stroke="#e0c58e" stroke-width="6"/><circle cx="60" cy="60" r="10" fill="#e0c58e"/></pattern></defs><rect x="69" y="69" width="838" height="1462" fill="url(#p)"/></svg>';
export async function downloadHanafudaAssets(destination) {
 if(FACE_FILES.length!==48 || new Set(FACE_FILES.map(x=>x.id)).size!==48 ||
  new Set(FACE_FILES.map(x=>x.file)).size!==48)throw Error("Invalid 48-card manifest");
 const checked=path.resolve(import.meta.dirname,"../external/hanafuda-art/svg");
 let sourceDir=checked,temporary=null;
 try {
  try{await fs.access(path.join(checked,FACE_FILES[0].file));}
  catch {
   temporary=await fs.mkdtemp(path.join(os.tmpdir(),"vctrtable-art-"));
   const res=await fetch(`https://codeload.github.com/${SOURCE_REPO}/zip/${SOURCE_COMMIT}`,
    {signal:AbortSignal.timeout(60000),headers:{"User-Agent":"vctrtable-hanafuda/0.1"}});
   if(!res.ok)throw Error("Source archive HTTP "+res.status);
   const zipData=Buffer.from(await res.arrayBuffer());
   if(zipData.length<100000 || zipData.length>15000000)throw Error("Unexpected art archive size");
   const archive=path.join(temporary,"art.zip");
   await fs.writeFile(archive,zipData);
   const unzip=spawnSync("unzip",["-qq",archive,"-d",temporary],{encoding:"utf8"});
   if(unzip.status!==0)throw Error("Unzip error "+unzip.stderr);
   sourceDir=path.join(temporary,`Hanafuda-Louie-Recolor-${SOURCE_COMMIT}`,"svg");
  }
  await fs.mkdir(path.join(destination,"cards"),{recursive:true});
  for(const item of FACE_FILES) {
   const svg=validateSvg(await fs.readFile(path.join(sourceDir,item.file),"utf8"),item.id);
   await fs.writeFile(path.join(destination,item.output),svg,"utf8");
  }
  await fs.writeFile(path.join(destination,"cards/back.svg"),BACK_SVG,"utf8");
  console.log("Bundled 48 pinned, licensed SVG card faces and 1 original card back.");
 }finally{if(temporary)await fs.rm(temporary,{recursive:true,force:true});}
}
