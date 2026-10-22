/**
 * No-network, read-only launch preflight for the Vector SDK poker Bot.
 * Never prints environment values, private keys, or any individual npub.
 * The Bot's Rust admission layer independently validates NIP-19 public keys.
 */
import {existsSync,statSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const CHARSET="qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
function checksum(values){
 let check=1;
 for(const value of values){
  const top=check>>>25;
  check=((check&0x1ffffff)<<5)^value;
  for(let i=0;i<5;i++)if((top>>>i)&1)check^=GEN[i];
 }
 return check>>>0;
}
function expand(hrp){
 return [...hrp].map(x=>x.charCodeAt(0)>>>5)
  .concat([0],[...hrp].map(x=>x.charCodeAt(0)&31));
}
function bitsToBytes(values){
 let acc=0,n=0;
 const out=[];
 for(const v of values){
  acc=((acc<<5)|v)&0x7fff;
  n+=5;
  if(n>=8){n-=8;out.push((acc>>>n)&255);}
 }
 if(n>=5 || ((acc<<(8-n))&255)!==0)return null;
 return out;
}
export function isNip19Key(key,kind){
 if(typeof key!=="string"||key.length!==63||!key.startsWith(kind+"1")||
    key!==key.toLowerCase())return false;
 const data=[...key.slice(kind.length+1)].map(ch=>CHARSET.indexOf(ch));
 if(data.some(v=>v<0)||data.length<6)return false;
 if(checksum([...expand(kind),...data])!==1)return false;
 return bitsToBytes(data.slice(0,-6))?.length===32;
}
export function checkVectorEnvironment(env,{cwd=process.cwd(),uid=process.getuid?.()}={}){
 const errors=[];
 const fail=message=>errors.push(message);
 if(!existsSync(path.join(cwd,"bots","vector","Cargo.toml"))||
    !existsSync(path.join(cwd,"bots","poker","dealer-worker.mjs")))
    fail("Run preflight from the vctrtable repository root");
 if(+process.versions.node.split(".")[0]<20)fail("Node.js 20 or newer required");
 if(typeof env.VECTOR_NSEC!=="string"||!isNip19Key(env.VECTOR_NSEC,"nsec"))
    fail("VECTOR_NSEC must be a valid private NIP-19 nsec loaded from a private environment");
 if(typeof env.VCTR_DEALER_KEY_HEX!=="string"||
    !/^[0-9a-fA-F]{64}$/.test(env.VCTR_DEALER_KEY_HEX))
    fail("VCTR_DEALER_KEY_HEX must be exactly 32 secret bytes as 64 hex characters");
 if(typeof env.VCTR_ROOM_ID!=="string"||env.VCTR_ROOM_ID.length<1||
    env.VCTR_ROOM_ID.length>128||/[\r\n\x00-\x1f]/.test(env.VCTR_ROOM_ID))
    fail("VCTR_ROOM_ID must be 1-128 printable characters");
 let players;
 try{players=JSON.parse(env.VCTR_PLAYERS_JSON);}
 catch{fail("VCTR_PLAYERS_JSON must be valid JSON");}
 if(!Array.isArray(players)||players.length<2||players.length>6)
    fail("VCTR_PLAYERS_JSON must list 2-6 players");
 else {
  const ids=new Set();
  for(const player of players){
   if(!player||typeof player!=="object"||Array.isArray(player)||
      Object.keys(player).sort().join(",")!=="id,name"||
      !isNip19Key(player.id,"npub")||
      typeof player.name!=="string"||player.name.trim().length<1||
      [...player.name].length>60||/[\r\n\x00-\x1f]/.test(player.name)){
    fail("Player entries must contain only a valid public npub and a 1-60 character safe name");
    continue;
   }
   if(ids.has(player.id))fail("Roster has repeated player npubs");
   ids.add(player.id);
  }
 }
 const filename=env.VCTR_DEALER_FILE;
 if(typeof filename!=="string"||!path.isAbsolute(filename)||
    path.basename(filename)==="."||path.basename(filename)==="..")
   fail("VCTR_DEALER_FILE must be an absolute file path");
 else {
  const directory=path.dirname(filename);
  if(!existsSync(directory))fail("Private dealer journal directory does not exist; create it with permissions 0700");
  else {
   try{
    const info=statSync(directory);
    if(!info.isDirectory())fail("Dealer journal parent must be a directory");
    if(process.platform!=="win32" && (info.mode&0o077)!==0)
      fail("Dealer journal directory must deny group/other access (mode 0700)");
    if(uid!==undefined && info.uid!==uid)
      fail("Dealer journal directory must be owned by the Bot process user");
   }catch{fail("Cannot read dealer journal parent permissions");}
  }
  if(existsSync(filename)){
   try{
    const info=statSync(filename);
    if(!info.isFile())fail("Dealer journal must be a regular file");
    if(process.platform!=="win32" && (info.mode&0o077)!==0)
      fail("Existing dealer journal must have private file permissions (0600)");
   }catch{fail("Cannot read dealer journal permissions");}
  }
 }
 return errors;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const errors=checkVectorEnvironment(process.env);
 if(errors.length){
  for(const error of errors)console.error("Preflight: "+error);
  process.exitCode=1;
 }else{
  console.log("Poker Bot environment preflight passed (no network, no live relay test).");
 }
}
