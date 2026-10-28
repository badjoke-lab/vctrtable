/**
 * Ephemeral P-256 ECDH / AES-GCM for Koi-Koi friendly-host mode.
 * This protects guest hand snapshots from passive group members, but does
 * NOT make the hosting player honest or prevent active MITM without comparing
 * the displayed pairing code out of band.
 */
const enc=new TextEncoder(),dec=new TextDecoder();
export const bytesToBase64=bytes=>{
 let str="";for(const b of bytes)str+=String.fromCharCode(b);
 return btoa(str).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
};
export function base64ToBytes(b64){
 const input=b64.replaceAll("-","+").replaceAll("_","/");
 const raw=atob(input+"=".repeat((4-input.length%4)%4));
 return Uint8Array.from(raw,ch=>ch.charCodeAt(0));
}
export async function createEphemeralIdentity(subtle=crypto.subtle) {
 const pair=await subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveKey"]);
 const raw=new Uint8Array(await subtle.exportKey("raw",pair.publicKey));
 return {privateKey:pair.privateKey,publicKey:bytesToBase64(raw)};
}
export async function deriveKey(identity,remote,subtle=crypto.subtle){
 const key=await subtle.importKey("raw",base64ToBytes(remote),
  {name:"ECDH",namedCurve:"P-256"},false,[]);
 return subtle.deriveKey({name:"ECDH",public:key},
  identity.privateKey,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
export async function pairingCode(room,hostPublic,guestPublic,subtle=crypto.subtle) {
 const digest=new Uint8Array(await subtle.digest("SHA-256",
  enc.encode(room+"|"+hostPublic+"|"+guestPublic)));
 const value=((((digest[0]*256+digest[1])*256+digest[2])*256+digest[3])>>>0)%1000000;
 return String(value).padStart(6,"0");
}
function aad(room,from,to){return enc.encode(["hanafuda-v1",room,from,to].join("|"));}
export async function sealMessage(key,{room,from,to},message){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const plaintext=enc.encode(JSON.stringify(message));
 const data=new Uint8Array(await crypto.subtle.encrypt({
  name:"AES-GCM",iv,additionalData:aad(room,from,to)
 },key,plaintext));
 return {v:1,kind:"sealed",room,from,to,
  iv:bytesToBase64(iv),data:bytesToBase64(data)};
}
export async function openMessage(key,packet,{room,from,to}){
 if(packet?.kind!=="sealed"||packet.v!==1||
    packet.room!==room||packet.from!==from||packet.to!==to)
  throw Error("Wrong session or sender");
 const body=await crypto.subtle.decrypt({
  name:"AES-GCM",iv:base64ToBytes(packet.iv),
  additionalData:aad(room,from,to)
 },key,base64ToBytes(packet.data));
 return JSON.parse(dec.decode(body));
}
