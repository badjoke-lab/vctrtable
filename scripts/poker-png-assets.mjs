/**
 * Approved vctrtable card images, exactly 52 faces and the blue back.
 * Source of truth: previous user-approved vctrtable-approved-deck-53-png.zip
 * of original 240×336 cards (NOT any third-party substitute).
 *
 * Keep deck offline. An absent or mismatched archive MUST fail the build
 * rather than silently fetching an incorrect third-party set.
 */
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";

const archiveName="assets/approved-cards/vctrtable-approved-deck-53-png.zip";
const ranks="23456789TJQKA", suits="CDHS";
export const CARD_NAMES=Object.freeze(Object.fromEntries(
 [...suits].flatMap(suit=>[...ranks].map(rank=>[rank+suit,rank+suit+".png"]))
 .concat([["BACK","BACK.png"]])
));
export function cardAsset(code){
 if(!Object.hasOwn(CARD_NAMES,code))throw new Error("Unsupported PNG card "+String(code));
 return "card-png/"+CARD_NAMES[code];
}
export function pngDimensions(buffer){
 if(buffer.length<60 || buffer.subarray(0,8).toString("hex")!=="89504e470d0a1a0a") throw Error("Not PNG");
 const w=buffer.readUInt32BE(16),h=buffer.readUInt32BE(20);
 if(w!==240||h!==336)throw Error("Approved PNG must be 240x336");
 return {w,h};
}
function inspectZip(file){
 // Node 22 does not provide a built-in ZIP reader, so use system unzip,
 // which is already required by the WebXDC packaging workflow.
 const output=execFileSync("unzip",["-Z","-1",file],{encoding:"utf8"});
 const names=output.trim().split(/\r?\n/);
 const expected=Object.values(CARD_NAMES);
 if(names.length!==53 || new Set(names).size!==53 ||
    names.some(name=>!expected.includes(name)) ||
    expected.some(name=>!names.includes(name)))
    throw Error("Approved deck ZIP must contain exactly 52 faces and BACK.png");
 return names;
}
export async function downloadCardAssets(destination,{archive=archiveName}={}){
 if(!fs.existsSync(archive))throw Error("Missing approved poker card ZIP: "+archive+" — never fall back to third-party imagery");
 inspectZip(archive);
 const folder=path.join(destination,"card-png");
 fs.mkdirSync(folder,{recursive:true});
 const fingerprints=new Set();
 for(const [code,file] of Object.entries(CARD_NAMES)){
  const image=execFileSync("unzip",["-p",archive,file],{maxBuffer:1024*1024});
  pngDimensions(image);
  const fingerprint=createHash("sha256").update(image).digest("hex");
  if(fingerprints.has(fingerprint))throw Error("Duplicate source card image for "+code);
  fingerprints.add(fingerprint);
  fs.writeFileSync(path.join(folder,file),image);
 }
 if(fs.readdirSync(folder).length!==53)throw Error("Approved deck incomplete");
 return 53;
}
