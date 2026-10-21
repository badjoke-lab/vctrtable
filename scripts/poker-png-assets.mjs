/**
 * Deterministic offline PNG assets in poker.xdc.
 * Source: saulspatz/SVGCards public domain, pinned commit.
 * Download happens ONLY at build time (never inside Vector).
 */
import fs from "node:fs";
import path from "node:path";
const pinned="f8df28774736ea2545fc8e7fb693eb55ce031945";
const base="https://raw.githubusercontent.com/saulspatz/SVGCards/"+pinned+"/Decks/Vertical2/pngs/";
const suitNames={C:"club",D:"diamond",H:"heart",S:"spade"};
const rankNames={A:"Ace",K:"King",Q:"Queen",J:"Jack",T:"10"};
export const CARD_NAMES=Object.freeze(Object.fromEntries(
 Array.from("CDHS").flatMap(suit=>Array.from("23456789TJQKA").map(rank=>{
  const code=rank+suit;
  return [code,suitNames[suit]+(rankNames[rank]||rank)+".png"];
 })).concat([["BACK","blueBack.png"]])
));
export function cardAsset(code){
 if(!Object.hasOwn(CARD_NAMES,code))throw new Error("Unsupported PNG card "+String(code));
 return "card-png/"+CARD_NAMES[code];
}
function pngDimensions(buffer){
 const header=Buffer.from("89504e470d0a1a0a","hex");
 if(buffer.length<80||!buffer.subarray(0,8).equals(header))throw Error("Not PNG");
 const w=buffer.readUInt32BE(16),h=buffer.readUInt32BE(20);
 if(w<40||h<40||w>10000||h>10000)throw Error("Unexpected PNG dimensions");
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
     if(bytes.length>300000)throw Error("Oversized PNG "+file);
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
