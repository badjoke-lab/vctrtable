import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,stat,chmod,mkdir,writeFile,readdir} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import os from "node:os";
import path from "node:path";
import {createConfiguration,inspectConfiguration,configurationToEnvironment,
        validateConfigFile,parseArgs} from "../scripts/vector-bot-operator.mjs";
import {packageVectorBot} from "../scripts/vector-bot-package.mjs";

const alphabet="qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const generators=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3];
function nip19(hrp,byte){
 const bytes=Buffer.alloc(32,byte),bits=[];let buffer=0,n=0;
 for(const b of bytes){buffer=(buffer<<8)|b;n+=8;
  while(n>=5){n-=5;bits.push((buffer>>>n)&31);}}
 if(n>0)bits.push((buffer<<(5-n))&31);
 const prefix=[...[...hrp].map(c=>c.charCodeAt(0)>>5),0,
               ...[...hrp].map(c=>c.charCodeAt(0)&31)];
 let check=1;
 for(const value of [...prefix,...bits,...Array(6).fill(0)]){
  const top=check>>>25;check=((check&0x1ffffff)<<5)^value;
  for(let i=0;i<5;i++)if((top>>i)&1)check^=generators[i];
 }
 check^=1;
 const checksum=Array.from({length:6},(_,i)=>(check>>>(5*(5-i)))&31);
 return hrp+"1"+[...bits,...checksum].map(i=>alphabet[i]).join("");
}
test("operator init makes private config and random journal key, never overwrites",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-cli-init-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const conf=path.join(dir,"config","private.json"),journal=path.join(dir,"state","dealer.enc");
 const created=await createConfiguration(conf,{journal});
 assert.equal(created,conf);
 const raw=await readFile(conf,"utf8");
 const value=JSON.parse(raw);
 assert.equal(value.VCTR_DEALER_FILE,journal);
 assert.match(value.VCTR_DEALER_KEY_HEX,/^[0-9a-f]{64}$/);
 assert.equal(value.VCTR_PLAYERS_JSON.length,2);
 assert.equal(value.VECTOR_NSEC,"");
 if(process.platform!=="win32"){
  assert.equal((await stat(conf)).mode&0o777,0o600);
  assert.equal((await stat(path.dirname(conf))).mode&0o777,0o700);
  assert.equal((await stat(path.dirname(journal))).mode&0o777,0o700);
 }
 await assert.rejects(createConfiguration(conf,{journal}),e=>e.code==="EEXIST");
 assert.equal((await readFile(conf,"utf8")),raw,
  "second init must never reset key used to decrypt saved hands");
});
test("operator detects bad and valid private config before network access",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-cli-check-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,"config","private.json"),journal=path.join(dir,"journal","dealer.enc");
 await createConfiguration(file,{journal});
 const config=JSON.parse(await readFile(file,"utf8"));
 const invalid=await inspectConfiguration(file);
 assert.ok(invalid.some(x=>x.includes("VECTOR_NSEC")));
 assert.ok(invalid.some(x=>x.includes("2-6")||x.includes("Player entries")));
 config.VECTOR_NSEC=nip19("nsec",7);
 config.VCTR_PLAYERS_JSON=[{id:nip19("npub",1),name:"Alice"},
                          {id:nip19("npub",2),name:"Bob"}];
 await writeFile(file,JSON.stringify(config),{mode:0o600});
 assert.deepEqual(await inspectConfiguration(file),[]);
 const env=configurationToEnvironment(config);
 assert.equal(env.VCTR_DEALER_FILE,journal);
 assert.equal(JSON.parse(env.VCTR_PLAYERS_JSON).length,2);
 assert.equal(Object.hasOwn(env,"VCTR_DEALER_KEY_HEX"),true);
 assert.throws(()=>configurationToEnvironment({...config,extra:"forbidden"}),/exactly/);
 assert.deepEqual(validateConfigFile(file),[]);
 if(process.platform!=="win32"){
  await chmod(file,0o644);
  assert.ok((await inspectConfiguration(file)).some(x=>x.includes("0600")));
  await chmod(file,0o600);
  await chmod(path.dirname(file),0o755);
  assert.ok((await inspectConfiguration(file)).some(x=>x.includes("0700")));
 }
});
test("reject putting a private config inside Git and reject unsupported CLI args",async t=>{
 const inRepo=path.join(process.cwd(),".vctrtable-insecure","private.json");
 assert.ok(validateConfigFile(inRepo).some(x=>x.includes("Git repository")));
 assert.deepEqual(parseArgs(["check","--config","/tmp/fixture"]).command,"check");
 assert.throws(()=>parseArgs(["start","--some-secret","x"]),/Usage/);
 assert.throws(()=>parseArgs(["deploy"]),/Usage/);
});
test("release packager copies only allowlisted runtime, not CI artifacts or env secrets",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"vctrtable-package-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const binary=path.join(dir,"fake-bot");
 await writeFile(binary,"test-executable",{mode:0o700});
 const bundle=await packageVectorBot({binary,output:dir,target:"test-x64"});
 const fileList=await readdir(bundle);
 assert.deepEqual(fileList.sort(),["README-START.txt","bin","bots","docs",
                                   "package.json","packages","scripts"].sort());
 const statInfo=await stat(path.join(bundle,"bin","vctrtable-vector-bot"));
 assert.ok(statInfo.size>0);
 const pkg=JSON.parse(await readFile(path.join(bundle,"package.json"),"utf8"));
 assert.equal(pkg.scripts["vector:start"],"node scripts/vector-bot-operator.mjs start");
 assert.equal(pkg.type,"module");
 await assert.rejects(packageVectorBot({binary,output:dir,target:"../traversal"}),/Invalid/);
 await assert.rejects(packageVectorBot({binary:path.join(dir,"missing"),output:dir,target:"test"}));
});
