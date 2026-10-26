/**
 * Build-time acquisition of the complete, consistent 48-face Commons Hanafuda deck.
 *
 * Original SVG drawings: Louie Mantia; traditional color edits: すけじょ.
 * "Alt" black-bordered edition; card back: Spenĉjo.
 * CC BY-SA 4.0. See docs/HANAFUDA-ASSET-LICENSE.md.
 *
 * We fetch only at build time, so the resulting .xdc contains all images and
 * does not need to contact Wikimedia, disclose a player's IP or render remote
 * image resources at runtime.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";

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
   file:`Hanafuda_${MONTHS[m]}_${kind.replaceAll(" ","_")}_Alt.svg`,
   output:`cards/${m+1}-${i+1}.svg`
 }))
));
export const BACK_FILE="Hanafuda_card_back_Alt.svg";
export function commonsFileUrl(filename) {
  const hash=createHash("md5").update(filename).digest("hex");
  return `https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash.slice(0,2)}/${encodeURIComponent(filename)}`;
}
export function licensePage(filename) {
  return "https://commons.wikimedia.org/wiki/File:"+encodeURIComponent(filename);
}
function validateSvg(text,id) {
  if(text.length<200 || text.length>250000 || !/<svg\b/i.test(text)) {
    throw Error(`Invalid SVG structure/size for ${id}`);
  }
  if(/<script\b|<foreignObject\b|\bon\w+\s*=|\b(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:|\/\/)/i.test(text)) {
    throw Error(`Untrusted SVG active or remote content in ${id}`);
  }
  return text;
}
async function fetchSvg(filename) {
  const url=commonsFileUrl(filename);
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      const response=await fetch(url,{headers:{
        "Accept":"image/svg+xml",
        "User-Agent":"vctrtable-hanafuda/0.1 (https://github.com/badjoke-lab/vctrtable; educational open-source game)"
      },signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw Error(`HTTP ${response.status} on ${filename}`);
      return validateSvg(await response.text(),filename);
    }catch(err){
      if(attempt===3)throw Error(`Could not acquire ${filename} from Wikimedia Commons: ${err.message}`);
      await new Promise(resolve=>setTimeout(resolve,attempt*850));
    }
  }
}
export async function downloadHanafudaAssets(destination) {
  if(FACE_FILES.length!==48 || new Set(FACE_FILES.map(x=>x.id)).size!==48 ||
     new Set(FACE_FILES.map(x=>x.file)).size!==48)throw Error("Card manifest is not 48 unique faces");
  const files=[...FACE_FILES,{id:"back",file:BACK_FILE,output:"cards/back.svg"}];
  await fs.mkdir(path.join(destination,"cards"),{recursive:true});
  // Small, bounded parallelism is respectful to Wikimedia's shared CDN.
  const workers=Array.from({length:4},async(_,worker)=>{
    for(let index=worker;index<files.length;index+=4) {
      const item=files[index],svg=await fetchSvg(item.file);
      await fs.writeFile(path.join(destination,item.output),svg,"utf8");
    }
  });
  await Promise.all(workers);
  for(const item of files) {
    const stat=await fs.stat(path.join(destination,item.output));
    if(stat.size<200)throw Error("Missing or invalid asset "+item.id);
  }
  console.log(`Bundled ${FACE_FILES.length} Hanafuda faces + 1 card back (CC BY-SA 4.0).`);
}
