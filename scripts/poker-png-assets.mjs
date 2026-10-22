/**
 * Traditional 52-card CC0 playing-card artwork, bundled as real full-face PNGs.
 * Source: safe-acid/Playing-cards-assets (CC0-1.0), pinned immutable commit.
 * Replaces the former Vertical2 deck whose *original raster image* contained
 * the conspicuous internal rectangular pip frame seen in Android screenshots.
 *
 * No CSS overlays, generated faux-card borders or runtime network requests.
 * Small 127x177 originals are 4-13 KiB, lightweight enough for WebXDC.
 */
import fs from "node:fs";
import path from "node:path";
const pinned="ae925833a28f587ec6abed561822889eb044a18c";
const base="https://raw.githubusercontent.com/safe-acid/Playing-cards-assets/"+
 pinned+"/Playing%20Cards/PNG%20Cards/Cards%20127x177px/";
const suitNames={C:"clubs",D:"diamonds",H:"hearts",S:"spades"};
const rankNames={T:"10"};
export const CARD_NAMES=Object.freeze(Object.fromEntries(
 Array.from("CDHS").flatMap(suit=>Array.from("23456789TJQKA").map(rank=>{
  const code=rank+suit;
  const filename=rank==="A"&&suit==="H"?"A__hearts.png":
   (rankNames[rank]||rank)+"_"+suitNames[suit]+".png";
  return [code,filename];
 })).concat([["BACK","backdesign_1.png"]])
));
export function cardAsset(code){
 if(!Object.hasOwn(CARD_NAMES,code))throw new Error("Unsupported PNG card "+String(code));
 return "card-png/"+CARD_NAMES[code];
}
function pngDimensions(buffer){
 const header=Buffer.from("89504e470d0a1a0a","hex");
 if(buffer.length<80||!buffer.subarray(0,8).equals(header))throw Error("Not PNG");
 const w=buffer.readUInt32BE(16),h=buffer.readUInt32BE(20);
 if(w!==127||h!==177)throw Error("Card PNG must be the same 127x177 image dimensions");
 return {w,h};
}
export async function downloadCardAssets(destination,{fetcher=globalThis.fetch}={}){
 if(typeof fetcher!=="function")throw Error("Fetch API required to bundle offline cards");
 fs.mkdirSync(path.join(destination,"card-png"),{recursive:true});
 const entries=Object.entries(CARD_NAMES);
 let next=0;
 async function worker(){
  while(next<entries.length){
   const [code,file]=entries[next++];
   const target=path.join(destination,cardAsset(code));
   let last;
   for(let tries=0;tries<3;tries++){
    try{
     const result=await fetcher(base+encodeURIComponent(file),{signal:AbortSignal.timeout(25000)});
     if(!result.ok)throw Error("PNG download HTTP "+result.status+": "+file);
     const bytes=Buffer.from(await result.arrayBuffer());
     pngDimensions(bytes);
     // The public-domain raster deck is tiny. Refuse accidental enormous
     // high-resolution upstream replacements that bloat every .xdc share.
     if(bytes.length<500||bytes.length>60000)throw Error("Unexpected PNG size "+file);
     fs.writeFileSync(target,bytes);
     last=null;break;
    }catch(error){last=error;}
   }
   if(last)throw last;
  }
 }
 await Promise.all(Array.from({length:6},worker));
 if(fs.readdirSync(path.join(destination,"card-png")).length!==53)
  throw Error("Full 52-card PNG deck plus back was not bundled");
 return entries.length;
}
