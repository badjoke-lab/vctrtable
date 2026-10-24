/**
 * Two independent Chromium contexts share ONE simulated WebXDC event stream.
 * This is browser integration, NOT a real Vector relay test.
 * Must exercise actual decryption, verified betting and chip settlement.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright";
const xdc=path.resolve("dist/poker.xdc");
if(!fs.existsSync(xdc))throw Error("npm run build required");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"vctrtable-pvp-browser-"));
execFileSync("unzip",["-q",xdc,"-d",temp]);
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png"};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,"http://localhost").pathname;
 if(pathname==="/webxdc.js"){res.writeHead(200,{"Content-Type":"text/javascript"}).end(";");return;}
 const file=path.resolve(temp,"."+pathname);
 if(!file.startsWith(temp+path.sep)){res.writeHead(403).end();return;}
 try{if(!fs.statSync(file).isFile())throw Error("not file");
  res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});
  fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end("not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const clients=[],errors=[];
 for(const who of ["host","guest"]){
  const ctx=await browser.newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true});
  await ctx.addInitScript(name=>{
   const out=[];
   window.__sim={out,receive:null};
   window.webxdc={selfAddr:name,selfName:name,
    sendUpdate(payload){out.push(payload);},
    setUpdateListener(fn){window.__sim.receive=fn;return Promise.resolve();},
    sendToChat(){return Promise.resolve();}
   };
  },who);
  const page=await ctx.newPage();
  page.on("pageerror",e=>errors.push(who+": "+e.message));
  await page.goto(base+"/pvp.html",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.__sim?.receive==="function");
  clients.push({who,ctx,page});
 }
 const host=clients[0].page,guest=clients[1].page;
 const history=[];let serial=0,sequence=0,privateStatePackets=0;
 async function deliver(e){
  const update={payload:e,serial:++serial,max_serial:serial};
  history.push(update);
  for(const {page} of clients)await page.evaluate(x=>window.__sim.receive(x),update);
 }
 async function flush(){
  for(const {page} of clients){
   const packets=await page.evaluate(()=>window.__sim.out.splice(0));
   for(const envelope of packets){
    const e=envelope.payload;
    if(e.app==="vctrtable-pvp"&&e.kind==="state"){
     privateStatePackets++;
     const raw=JSON.stringify(e);
     assert.ok(!raw.includes('"hole":'),"Hole card plaintext leaked to shared update");
     assert.ok(!raw.includes('"deck":'),"Deck was broadcast");
     assert.ok(!raw.includes('"nsec":'),"Signing key leaked");
    }
    await deliver(e);
   }
  }
 }
 async function cycles(count=15){
  for(let i=0;i<count;i++){
   await host.waitForTimeout(90);
   await flush();
  }
 }
 const mk=(kind,by,extra={})=>({
  v:["table-create","seat-join","seat-leave","seat-ready","table-close"].includes(kind)?2:1,
  app:"poker",kind,id:"evt"+String(++sequence).padStart(8,"0"),by,
  at:1000+sequence,tableId:"room-qa-bridge",...extra
 });
 await deliver(mk("table-create","host",{name:"Host",maxPlayers:2}));
 await deliver(mk("seat-join","guest",{name:"Guest"}));
 await deliver(mk("seat-ready","host",{ready:true}));
 await deliver(mk("seat-ready","guest",{ready:true}));
 const proposal=mk("rules","host",{settings:{chips:1000,sb:5,bb:10,timer:30,rebuy:true},
  seats:["host","guest"]});
 await deliver(proposal);
 await deliver(mk("vote","host",{target:proposal.id}));
 await deliver(mk("vote","guest",{target:proposal.id}));
 await cycles();
 assert.equal(await host.locator("#pvp-start").isEnabled(),true,
  "Host cannot start after both session keys enrolled");
 assert.match(await host.locator("#pvp-key-status").textContent(),/private keys/);
 await host.locator("#pvp-start").click();await cycles();
 assert.equal(privateStatePackets>=1,true,"No encrypted state was broadcast");
 assert.equal(await host.locator("#pvp-game").isVisible(),true);
 assert.equal(await guest.locator("#pvp-game").isVisible(),true);
 const hCards=await host.locator("#pvp-hole img").evaluateAll(xs=>xs.map(x=>x.dataset.card));
 const gCards=await guest.locator("#pvp-hole img").evaluateAll(xs=>xs.map(x=>x.dataset.card));
 assert.equal(hCards.length,2);assert.equal(gCards.length,2);
 assert.equal(new Set([...hCards,...gCards]).size,4,"Opponents saw repeated or wrong cards");
 assert.ok(hCards.every(x=>x!=="BACK"));
 assert.ok(gCards.every(x=>x!=="BACK"));
 // The trusted host's full deck and journal must be recovered from locally
 // AES-GCM-encrypted IndexedDB, NEVER from WebXDC broadcast history.
 await host.reload({waitUntil:"networkidle"});
 await host.waitForFunction(()=>typeof window.__sim?.receive==="function");
 for(const update of history)await host.evaluate(x=>window.__sim.receive(x),update);
 await cycles();
 assert.match(await host.locator("#pvp-key-status").textContent(),/private hand restored/i,
  "Host did not recover local encrypted journal after WebView reload");
 const afterReload=await host.locator("#pvp-hole img").evaluateAll(xs=>xs.map(x=>x.dataset.card));
 assert.deepEqual(afterReload,hCards,"Host changed their own hand during reload");
 // The active player's signed Fold must settle the hand on both devices.
 const actor=await host.locator("#pvp-fold").isEnabled()?host:guest;
 await actor.locator("#pvp-fold").click();await cycles();
 assert.equal(await host.locator("#pvp-turn").textContent(),"Hand complete");
 assert.equal(await guest.locator("#pvp-turn").textContent(),"Hand complete");
 assert.ok((await host.locator("#pvp-result").textContent()).includes("awarded"));
 assert.equal(await host.locator("#pvp-start").isEnabled(),true);
 await host.screenshot({path:path.resolve("dist/poker-pvp-two-clients-360.png"),fullPage:true});
 assert.deepEqual(errors,[],"Browser JavaScript error");
 for(const c of clients)await c.ctx.close();
 console.log("Encrypted PvP 2-client Chromium smoke OK: private hands, host reload and encrypted recovery, signed fold and payout");
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
 fs.rmSync(temp,{recursive:true,force:true});
}
