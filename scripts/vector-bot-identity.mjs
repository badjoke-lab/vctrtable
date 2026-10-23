/**
 * Dedicated Nostr/Vector Bot identity; generated only on the operator host.
 * The secret is returned to the private-file writer, never sent to the
 * network or printed. The public npub can safely be displayed to players.
 */
import {createECDH} from "node:crypto";
import {isNip19Key} from "./vector-bot-preflight.mjs";

const ALPHABET="qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATORS=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
function polymod(data){
 let chk=1;
 for(const value of data){
  const top=chk>>>25;
  chk=((chk&0x1ffffff)<<5)^value;
  for(let i=0;i<5;i++)if((top>>>i)&1)chk^=GENERATORS[i];
 }
 return chk>>>0;
}
function bech32Encode(hrp,bytes){
 let acc=0,bits=0;
 const data=[];
 for(const byte of bytes){
  acc=(acc<<8)|byte;
  bits+=8;
  while(bits>=5){bits-=5;data.push((acc>>>bits)&31);}
  acc&=(1<<bits)-1;
 }
 if(bits)data.push((acc<<(5-bits))&31);
 const expanded=[...hrp].map(c=>c.charCodeAt(0)>>>5)
  .concat([0],[...hrp].map(c=>c.charCodeAt(0)&31));
 const check=polymod([...expanded,...data,0,0,0,0,0,0])^1;
 const checksum=Array.from({length:6},(_,i)=>(check>>>(5*(5-i)))&31);
 return hrp+"1"+[...data,...checksum].map(i=>ALPHABET[i]).join("");
}
export function createDedicatedBotIdentity(){
 const key=createECDH("secp256k1");
 key.generateKeys();
 const secret=key.getPrivateKey();
 const uncompressed=key.getPublicKey(undefined,"uncompressed");
 try{
  if(secret.length!==32||uncompressed.length!==65||uncompressed[0]!==4)
   throw new Error("Unexpected key format from the operating system");
  const nsec=bech32Encode("nsec",secret);
  const npub=bech32Encode("npub",uncompressed.subarray(1,33));
  if(!isNip19Key(nsec,"nsec")||!isNip19Key(npub,"npub"))
   throw new Error("Generated invalid NIP-19 identity");
  return {nsec,npub};
 }finally{
  secret.fill(0);
  uncompressed.fill(0);
 }
}
