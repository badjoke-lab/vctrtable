/**
 * Per-WebXDC-session keys, stored non-extractably in IndexedDB when supported.
 * These signatures prove possession of a locally enrolled key, NOT
 * Vector-account identity. Hole-card plaintext is never broadcast.
 */
const enc=new TextEncoder(),dec=new TextDecoder();
const encoded=x=>enc.encode(JSON.stringify(x));
export function toB64(bytes){
 const a=new Uint8Array(bytes);let binary="";
 for(let i=0;i<a.length;i+=16384)binary+=String.fromCharCode(...a.subarray(i,i+16384));
 return btoa(binary);
}
export const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const subtle=()=>{if(!globalThis.crypto?.subtle||!globalThis.crypto?.getRandomValues)
 throw Error("Private-card encryption needs secure WebCrypto");return crypto.subtle;};
function dbOperation(name,kind,value){
 return new Promise(resolve=>{
  if(!globalThis.indexedDB){resolve(null);return;}
  const req=indexedDB.open("vctrtable-pvp-key-store",1);
  req.onupgradeneeded=()=>req.result.createObjectStore("keys");
  req.onerror=()=>resolve(null);
  req.onsuccess=()=>{
   const db=req.result,transaction=db.transaction("keys",kind==="read"?"readonly":"readwrite");
   const op=kind==="read"?transaction.objectStore("keys").get(name):
     transaction.objectStore("keys").put(value,name);
   op.onsuccess=()=>{resolve(kind==="read"?op.result:true);db.close();};
   op.onerror=()=>{resolve(null);db.close();};
  };
 });
}
export async function seatKeys(name){
 const cryptoApi=subtle(),saved=await dbOperation(name,"read");
 if(saved?.sign?.privateKey&&saved?.dh?.privateKey)return {...saved,persistent:true};
 const sign=await cryptoApi.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
 const dh=await cryptoApi.generateKey({name:"ECDH",namedCurve:"P-256"},false,["deriveKey"]);
 const value={sign,dh};
 return {...value,persistent:Boolean(await dbOperation(name,"write",value))};
}
export async function publicKeys(keys){
 return {sign:await subtle().exportKey("jwk",keys.sign.publicKey),
  dh:await subtle().exportKey("jwk",keys.dh.publicKey)};
}
export async function signPacket(keys,packet){
 const signature=await subtle().sign({name:"ECDSA",hash:"SHA-256"},keys.sign.privateKey,encoded(packet));
 return {...packet,sig:toB64(signature)};
}
export async function verifyPacket(packet,jwk){
 try{
  if(typeof packet?.sig!=="string")return false;
  const {sig,...unsigned}=packet;
  const key=await subtle().importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},true,["verify"]);
  return subtle().verify({name:"ECDSA",hash:"SHA-256"},key,fromB64(sig),encoded(unsigned));
 }catch{return false;}
}
async function aes(privateKey,otherJwk){
 const other=await subtle().importKey("jwk",otherJwk,{name:"ECDH",namedCurve:"P-256"},false,[]);
 return subtle().deriveKey({name:"ECDH",public:other},privateKey,
  {name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function sealForRecipient(ownKeys,otherPublic,plaintext){
 const key=await aes(ownKeys.dh.privateKey,otherPublic.dh);
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=await subtle().encrypt({name:"AES-GCM",iv},key,enc.encode(JSON.stringify(plaintext)));
 return {iv:toB64(iv),data:toB64(bytes)};
}
export async function unsealForRecipient(ownKeys,otherPublic,cipher){
 const key=await aes(ownKeys.dh.privateKey,otherPublic.dh);
 const bytes=await subtle().decrypt({name:"AES-GCM",iv:fromB64(cipher.iv)},key,fromB64(cipher.data));
 return JSON.parse(dec.decode(bytes));
}
export function newNonce(){
 subtle();const a=crypto.getRandomValues(new Uint8Array(16));
 return [...a].map(x=>x.toString(16).padStart(2,"0")).join("");
}
