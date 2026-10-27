/**
 * Two independent Chromium contexts exercise ONLY the public WebXDC diagnostic
 * from a real packaged poker.xdc. This is NOT actual Vector relay testing.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright";
const archive=path.resolve("dist/poker.xdc");
assert.ok(fs.existsSync(archive),"Build XDC first");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"poker-transport-probe-"));
execFileSync("unzip",["-q",archive,"-d",dir]);
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,"http://127.0.0.1").pathname;
 if(pathname==="/webxdc.js"){res.writeHead(200,{"Content-Type":"text/javascript"}).end(";");return;}
 const file=path.resolve(dir,"."+pathname);
 if(!file.startsWith(dir+path.sep)){res.writeHead(403).end();return;}
 try{
  if(!fs.statSync(file).isFile())throw Error("no file");
  const ext=path.extname(file);
  res.writeHead(200,{"Content-Type":ext===".js"?"text/javascript":ext===".css"?"text/css":"text/html"});
  fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const peers=[],errors=[],history=[];let serial=0;
 for(const label of ["alpha","beta"]){
  const ctx=await browser.newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true});
  await ctx.addInitScript(name=>{
   const out=[];window.__probeSim={out,receiver:null};
   window.webxdc={
    selfAddr:name,selfName:name,sendUpdateInterval:1000,sendUpdateMaxSize:128000,
    sendUpdate(packet){out.push(packet);return Promise.resolve();},
    setUpdateListener(listener){window.__probeSim.receiver=listener;return Promise.resolve();}
   };
  },label);
  const page=await ctx.newPage();
  page.on("pageerror",e=>errors.push(label+": "+e.message));
  await page.goto(base+"/diagnostics.html",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>typeof window.__probeSim?.receiver==="function");
  peers.push({label,ctx,page});
 }
 async function deliver(envelope,skip=null){
  const p=envelope.payload;
  assert.equal(p.app,"vctrtable-transport-diagnostic");
  for(const secret of ["hole","deck","nsec","ownHole","privateKey","token","npub"]){
   assert.equal(JSON.stringify(p).includes('"'+secret+'"'),false,"Leak: "+secret);
  }
  serial+=serial%2===0?3:1;
  const update={payload:p,serial,max_serial:serial};
  history.push(update);
  for(const c of peers)if(c.label!==skip)
   await c.page.evaluate(x=>window.__probeSim.receiver(x),update);
  return update;
 }
 async function flush(){
  for(const c of peers){
   const outbound=await c.page.evaluate(()=>window.__probeSim.out.splice(0));
   for(const packet of outbound)await deliver(packet);
  }
 }
 const [alpha,beta]=peers.map(c=>c.page);
 assert.equal(await alpha.locator("#probe-send").isEnabled(),true);
 assert.equal(await beta.locator("#probe-ack").isEnabled(),false);
 await alpha.locator("#probe-send").click();await flush();
 await beta.waitForFunction(()=>!document.getElementById("probe-ack").disabled);
 assert.match(await beta.locator("#probe-inbound").textContent(),/Remote public request received/);
 await beta.locator("#probe-ack").click();await flush();
 await alpha.waitForFunction(()=>document.getElementById("probe-roundtrip").textContent.includes("Public round trip received"));
 const previous=await alpha.locator("#probe-roundtrip").textContent();
 assert.match(previous,/unverified peer/);
 for(const update of history)await alpha.evaluate(x=>window.__probeSim.receiver(x),update);
 assert.equal(await alpha.locator("#probe-roundtrip").textContent(),previous,
  "Replaying an acknowledgement must not alter the result");
 await alpha.locator("#probe-send").click();await flush();
 assert.match(await alpha.locator("#probe-roundtrip").textContent(),/Waiting for manual remote acknowledgement/);
 assert.equal(await beta.locator("#probe-ack").isEnabled(),true);
 await beta.locator("#probe-ack").click();await flush();
 await alpha.waitForFunction(()=>document.getElementById("probe-roundtrip").textContent.includes("Public round trip received"));
 assert.deepEqual(errors,[]);
 for(const c of peers)await c.ctx.close();
 console.log("WebXDC public two-peer diagnostic smoke PASS: manual ping/ack, serial gaps, strict no-secret envelopes, replay/dedup and second run");
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
 fs.rmSync(dir,{recursive:true,force:true});
}
