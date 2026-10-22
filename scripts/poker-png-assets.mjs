/**
 * The user's approved, self-contained 53-card deck. Do NOT download fallback
 * stock art: 2♦ / 5♣ and the complete 12-court set were approved visually.
 * The exact ZIP is already committed at the repository root.
 *
 * We pin the *whole archive* and the two previously defective face files by
 * SHA-256; a missing or substituted archive is a hard build error.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";

const APPROVED_ZIP="vctrtable-approved-deck-53-png.zip";
export const APPROVED_ZIP_SHA256="6612233288e54d73ee1c144e59b5f984bdde7979eef4c4755cb264263c074c36";
export const APPROVED_CARD_SHA256=Object.freeze({
  "2D":"57fc5dfbf91a3595f9c7",
  "5C":"30e338116c2583cfe736"
});
export const CARD_NAMES=Object.freeze(Object.fromEntries(
  [..."CDHS"].flatMap(suit=>[..."23456789TJQKA"].map(rank=>
    [rank+suit,rank+suit+".png"]
  )).concat([["BACK","BACK.png"]])
));
export function cardAsset(code){
  if(!Object.hasOwn(CARD_NAMES,code))throw new Error("Unsupported PNG card "+String(code));
  return "card-png/"+CARD_NAMES[code];
}
export function pngDimensions(buffer){
  if(buffer.length<60||buffer.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")
    throw new Error("Invalid approved card PNG");
  const w=buffer.readUInt32BE(16),h=buffer.readUInt32BE(20);
  if(w!==240||h!==336)throw new Error("Approved card PNG must be 240 x 336");
  return {w,h};
}
const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
export async function downloadCardAssets(destination,{archive=path.resolve(APPROVED_ZIP)}={}){
  if(!fs.existsSync(archive))throw new Error("Approved 53-card ZIP is missing: "+archive);
  const zipBytes=fs.readFileSync(archive);
  if(digest(zipBytes)!==APPROVED_ZIP_SHA256)
    throw new Error("Approved card ZIP SHA-256 mismatch: refusing unapproved imagery");
  let listed;
  try{
    listed=execFileSync("unzip",["-Z","-1",archive],{encoding:"utf8",maxBuffer:1024*1024})
      .trim().split(/\r?\n/);
  }catch(error){throw new Error("Cannot inspect approved card ZIP: "+error.message);}
  const expected=Object.values(CARD_NAMES);
  if(listed.length!==53||new Set(listed).size!==53||
     expected.some(name=>!listed.includes(name))||
     listed.some(name=>!expected.includes(name)))
    throw new Error("Approved ZIP must contain exactly 52 faces plus BACK.png at its root");
  const folder=path.join(destination,"card-png");
  fs.mkdirSync(folder,{recursive:true});
  const uniqueHashes=new Set();
  for(const [code,name] of Object.entries(CARD_NAMES)){
    const img=execFileSync("unzip",["-p",archive,name],{maxBuffer:1024*1024});
    pngDimensions(img);
    const hash=digest(img);
    if(APPROVED_CARD_SHA256[code]&&!hash.startsWith(APPROVED_CARD_SHA256[code]))
      throw new Error("Approved "+code+" artwork does not match the reviewed card");
    if(uniqueHashes.has(hash))throw new Error("Duplicated approved card image: "+code);
    uniqueHashes.add(hash);
    fs.writeFileSync(path.join(folder,name),img);
  }
  if(fs.readdirSync(folder).length!==53)throw new Error("Approved deck extraction incomplete");
  return 53;
}
