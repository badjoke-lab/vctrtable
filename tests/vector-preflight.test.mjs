import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm,writeFile,chmod} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import os from "node:os";
import path from "node:path";
import {isNip19Key,checkVectorEnvironment} from "../scripts/vector-bot-preflight.mjs";

const alphabet="qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const generators=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
function key(hrp,bytes){
 const bits=[];let buffer=0,n=0;
 for(const b of bytes){
  buffer=(buffer<<8)|b;n+=8;
  while(n>=5){n-=5;bits.push((buffer>>>n)&31);}
 }
 if(n>0)bits.push((buffer<<(5-n))&31);
 const prefix=[...[...hrp].map(c=>c.charCodeAt(0)>>5),0,
               ...[...hrp].map(c=>c.charCodeAt(0)&31)];
 let chk=1;
 for(const value of [...prefix,...bits,...Array(6).fill(0)]){
  const top=chk>>>25;
  chk=((chk&0x1ffffff)<<5)^value;
  for(let i=0;i<5;i++)if((top>>i)&1)chk^=generators[i];
 }
 chk^=1;
 const result=Array.from({length:6},(_,i)=>(chk>>>(5*(5-i)))&31);
 return hrp+"1"+[...bits,...result].map(i=>alphabet[i]).join("");
}
const npub=n=>key("npub",Buffer.alloc(32,n));
const nsec=n=>key("nsec",Buffer.alloc(32,n));

test("NIP-19 checksum, HRP, payload size and case enforced",()=>{
 const alice=npub(1);
 assert.equal(alice.length,63);
 assert.ok(isNip19Key(alice,"npub"));
 assert.ok(!isNip19Key(alice,"nsec"));
 assert.ok(isNip19Key(nsec(7),"nsec"));
 assert.ok(!isNip19Key("npub1"+ "q".repeat(58),"npub"));
 assert.ok(!isNip19Key(alice.toUpperCase(),"npub"));
 assert.ok(!isNip19Key(alice.slice(0,-1)+(alice.at(-1)==="q"?"p":"q"),"npub"));
 assert.ok(!isNip19Key("nsec1"+alice.slice(5),"npub"));
});
test("deployment preflight is read-only, rejects bad roster, missing secrets and insecure permissions",async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),"vctrtable-preflight-"));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const privateDir=path.join(root,"private");
 await mkdir(privateDir,{mode:0o700});
 const file=path.join(privateDir,"dealer.enc");
 const env={VECTOR_NSEC:nsec(7),VCTR_DEALER_KEY_HEX:randomBytes(32).toString("hex"),
   VCTR_ROOM_ID:"local-poker-test",VCTR_DEALER_FILE:file,
   VCTR_PLAYERS_JSON:JSON.stringify([{id:npub(1),name:"Alice"},{id:npub(2),name:"Bob"}])};
 assert.deepEqual(checkVectorEnvironment(env),[]);
 assert.ok(checkVectorEnvironment({...env,VECTOR_NSEC:"nsec1bad"}).some(e=>e.includes("VECTOR_NSEC")));
 assert.ok(checkVectorEnvironment({...env,VCTR_DEALER_KEY_HEX:"short"}).some(e=>e.includes("KEY_HEX")));
 assert.ok(checkVectorEnvironment({...env,VCTR_PLAYERS_JSON:JSON.stringify([
   {id:npub(1),name:"Alice"},{id:npub(1),name:"Bob"}])}).some(e=>e.includes("repeated")));
 assert.ok(checkVectorEnvironment({...env,VCTR_PLAYERS_JSON:JSON.stringify([
   {id:npub(1),name:"Alice"},{id:npub(2),name:"Bob",nsec:nsec(3)}])})
   .some(e=>e.includes("only a valid public npub")));
 assert.ok(checkVectorEnvironment({...env,VCTR_PLAYERS_JSON:"not json"}).length>0);
 await writeFile(file,"sealed journal",{mode:0o600});
 assert.deepEqual(checkVectorEnvironment(env),[]);
 if(process.platform!=="win32"){
  await chmod(privateDir,0o755);
  assert.ok(checkVectorEnvironment(env).some(e=>e.includes("0700")));
  await chmod(privateDir,0o700);
  await chmod(file,0o644);
  assert.ok(checkVectorEnvironment(env).some(e=>e.includes("0600")));
 }
});
