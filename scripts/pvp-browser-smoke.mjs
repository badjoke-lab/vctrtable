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
   const nativeNow=Date.now.bind(Date);
   let offset=0;
   Date.now=()=>nativeNow()+offset;
   window.__sim={out,receive:null,rejectNextAction:false,dropNextAction:false,
    advanceTime(ms){offset+=ms;}};
   window.webxdc={selfAddr:name,selfName:name,
    sendUpdate(payload){
     if(payload?.payload?.kind==="action"){
      if(window.__sim.rejectNextAction){
       window.__sim.rejectNextAction=false;
       return Promise.reject(Error("Simulated sendUpdate rejection"));
      }
      if(window.__sim.dropNextAction){
       window.__sim.dropNextAction=false;
       return Promise.resolve(); // Accepted by API, lost before messenger delivery.
      }
     }
     out.push(payload);return Promise.resolve();
    },
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
 // The initial instructions are visible BEFORE the lobby sends anything.
 for(const page of [host,guest]){
  assert.equal(await page.locator("#pvp-setup-steps li").count(),8);
  assert.equal(await page.locator('[data-step="transport"]').getAttribute("data-status"),"done");
  assert.equal(await page.locator('[data-step="table"]').getAttribute("data-status"),"next");
  assert.match(await page.locator("#pvp-next-action").textContent(),/Create a table/);
 }
 const history=[];let serial=0,sequence=0,privateStatePackets=0;
 let guestDisconnected=false;
 async function deliver(e){
  // Official WebXDC serials increase but need not be consecutive.
  // Non-unit serial gaps are valid and must not stall state reconstruction.
  serial+=serial%5===0?3:1;
  const update={payload:e,serial,max_serial:serial};
  history.push(update);
  for(const {who,page} of clients){
   if(who==="guest"&&guestDisconnected)continue; // lost WebView delivery
   await page.evaluate(x=>window.__sim.receive(x),update);
  }
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
 // The complete user journey must cross the actual packaged root and lobby.
 // Only the messenger transport is simulated; do not fabricate setup events.
 for(const page of [host,guest]){
  await page.goto(base+"/index.html",{waitUntil:"networkidle"});
  await page.locator("a.qa-primary-mode").click();
  await page.waitForURL("**/lobby.html");
  await page.waitForFunction(()=>typeof window.__sim?.receive==="function");
 }
 await host.locator("#max-players").selectOption("2");
 await host.locator("#table-create button").click();await cycles(2);
 assert.equal(await host.locator("#seats .seat").count(),1);
 assert.equal(await guest.locator("#join").isEnabled(),true);
 const tableId=history.find(x=>x.payload.kind==="table-create")?.payload.tableId;
 assert.ok(tableId,"Create Table UI did not emit the room event");
 await guest.locator("#join").click();await cycles(2);
 assert.equal(await host.locator("#seats .seat").count(),2);
 await host.locator("#ready").click();await cycles(2);
 await guest.locator("#ready").click();await cycles(2);
 assert.match(await host.locator("#table-status").textContent(),/Ready 2\/2/);
 await host.locator("#rules-form button").click();await cycles(2);
 await host.locator("#proposal button").click();await cycles(2);
 await guest.locator("#proposal button").click();await cycles(2);
 assert.match(await guest.locator("#proposal").textContent(),/2\/2 Approved/);
 for(const page of [host,guest]){
  await page.locator(".pvp-entry a").click();
  await page.waitForURL("**/pvp.html");
  await page.waitForFunction(()=>typeof window.__sim?.receive==="function");
  for(const event of history)await page.evaluate(x=>window.__sim.receive(x),event);
 }
 await cycles();
 // Fault injection remains intentional for the late-deadline cases below.
 const mk=(kind,by,extra={})=>({
  v:1,app:"poker",kind,id:"evt"+String(++sequence).padStart(8,"0"),by,
  at:1000+sequence,tableId,...extra
 });
 assert.equal(await host.locator('[data-step="keys"]').getAttribute("data-status"),"done",
  "Both session keys must be present before the hand starts");
 assert.equal(await host.locator('[data-step="deal"]').getAttribute("data-status"),"next");
 assert.match(await host.locator("#pvp-next-action").textContent(),/Tap Host: Deal hand/);
 assert.match(await guest.locator("#pvp-next-action").textContent(),/Ask the host to deal/);
 assert.equal(await guest.locator("#pvp-setup-details").evaluate(el=>el.open),false,
  "Mobile setup must show the next action immediately, without eight expanded cards");
 await guest.locator("#pvp-guide-language").selectOption("ja");
 assert.match(await guest.locator("#pvp-next-action").textContent(),/ホストが配札するまで/);
 assert.equal(await guest.locator('[data-step="deal"] strong').textContent(),"ホストの配札待ち");
 await guest.locator("#pvp-guide-language").selectOption("en");
 await host.screenshot({path:path.resolve("dist/poker-pvp-setup-host-360.png"),fullPage:true});
 await guest.screenshot({path:path.resolve("dist/poker-pvp-setup-guest-360.png"),fullPage:true});
 assert.equal(await host.locator("#pvp-start").isEnabled(),true,
  "Host cannot start after both session keys enrolled");
 assert.match(await host.locator("#pvp-key-status").textContent(),/private keys/);
 await host.locator("#pvp-start").click();await cycles();
 assert.equal(privateStatePackets>=1,true,"No encrypted state was broadcast");
 assert.equal(await host.locator("#pvp-game").isVisible(),true);
 assert.equal(await guest.locator("#pvp-game").isVisible(),true);
 assert.equal(await host.locator("#pvp-setup-guide").isVisible(),false,
  "Once gameplay begins, onboarding must no longer push down the felt");
 assert.equal(await guest.locator("#pvp-setup-guide").isVisible(),false);
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
 // Duplicated history delivery must be idempotent.
 for(const old of history.slice(0,4))
  await host.evaluate(update=>window.__sim.receive(update),old);
 await cycles(2);
 assert.deepEqual(await host.locator("#pvp-hole img").evaluateAll(xs=>xs.map(x=>x.dataset.card)),
  hCards,"Duplicate WebXDC replay changed a committed private hand");
 // The active player's signed Fold must settle the hand on both devices.
 const actor=await host.locator("#pvp-fold").isEnabled()?host:guest;
 guestDisconnected=true;
 await actor.evaluate(()=>{window.__sim.rejectNextAction=true;});
 await actor.locator("#pvp-fold").click();await cycles(4);
 assert.notEqual(await host.locator("#pvp-turn").textContent(),"Hand complete",
  "Locally rejected action was incorrectly executed by the host");
 assert.match(await actor.locator("#pvp-status").textContent(),/Local action send failed/);
 assert.equal(await actor.locator("#pvp-retry").isEnabled(),true,
  "Rejected action left player unable to retry the same signed packet");
 await actor.locator("#pvp-retry").click();await cycles();
 assert.equal(await host.locator("#pvp-turn").textContent(),"Hand complete");
 assert.notEqual(await guest.locator("#pvp-turn").textContent(),"Hand complete",
  "Disconnected player received supposedly dropped settlement updates");
 // Restore the guest as a fresh WebView and replay all updates from serial 0,
 // exactly as standard WebXDC allows; the private hand is device-bound.
 guestDisconnected=false;
 await guest.reload({waitUntil:"networkidle"});
 await guest.waitForFunction(()=>typeof window.__sim?.receive==="function");
 for(const update of history)await guest.evaluate(x=>window.__sim.receive(x),update);
 await cycles(3);
 assert.equal(await guest.locator("#pvp-turn").textContent(),"Hand complete",
  "Guest did not recover from missed WebXDC messages after reload/replay");
 assert.ok((await host.locator("#pvp-result").textContent()).includes("awarded"));
 assert.equal(await host.locator("#pvp-start").isEnabled(),true);
 // A second hand must play through all betting streets and a SHOWDOWN,
 // not merely prove that a fold settles and releases the table.
 await host.locator("#pvp-start").click();await cycles();
 // Simulate a transport that resolves sendUpdate but silently drops the
 // payload. The acting peer can manually resend the SAME signed packet
 // after a short delay without creating another bet.
 let firstAction=null;
 for(const page of [host,guest]){
  if(await page.locator("#pvp-check").isEnabled()){firstAction={page,action:"check"};break;}
  if(await page.locator("#pvp-call").isEnabled()){firstAction={page,action:"call"};break;}
 }
 assert.ok(firstAction,"No legal first action for silent-drop test");
 const beforeDrop=privateStatePackets;
 await firstAction.page.evaluate(()=>{window.__sim.dropNextAction=true;});
 await firstAction.page.locator("#pvp-"+firstAction.action).click();await cycles(4);
 assert.equal(privateStatePackets,beforeDrop,"Dropped action unexpectedly reached the host");
 await firstAction.page.evaluate(()=>window.__sim.advanceTime(6100));
 // The game refreshes action availability on its one-second UI tick,
 // so wait for the button state rather than checking after ~180ms.
 await firstAction.page.waitForFunction(()=>
  !document.getElementById("pvp-retry").disabled,{timeout:5000});
 assert.equal(await firstAction.page.locator("#pvp-retry").isEnabled(),true,
  "Silent transport drop did not expose a replay of the same action");
 await firstAction.page.locator("#pvp-retry").click();await cycles(6);
 assert.equal(privateStatePackets,beforeDrop+1,
  "Retry should result in exactly one committed host revision");
 let actionCount=1;
 while((await host.locator("#pvp-turn").textContent())!=="Hand complete" && actionCount<25){
  let selected=null;
  for(const page of [host,guest]){
   if(await page.locator("#pvp-check").isEnabled()){selected={page,action:"check"};break;}
   if(await page.locator("#pvp-call").isEnabled()){selected={page,action:"call"};break;}
  }
  assert.ok(selected,"No legal Check or Call for an active two-player hand");
  await selected.page.locator("#pvp-"+selected.action).click();
  await cycles(6);actionCount++;
 }
 assert.ok(actionCount>5&&actionCount<25,"Expected a full multi-street hand");
 assert.equal(await guest.locator("#pvp-turn").textContent(),"Hand complete");
 assert.equal(await host.locator("#pvp-board img").count(),5);
 assert.equal(await guest.locator("#pvp-board img").count(),5);
 assert.equal(await host.locator("#pvp-result").textContent(),
              await guest.locator("#pvp-result").textContent());
 // The agreed 30-second timer must freeze ONLY on unanimous pause. Advancing
 // the host clock does not require a 30-second wall-time sleep in CI.
 await host.locator("#pvp-start").click();await cycles();
 await host.locator("#pvp-pause-request").click();await cycles(3);
 assert.match(await guest.locator("#pvp-pause-status").textContent(),/Pause approval 1\/2/);
 assert.match(await guest.locator("#pvp-pause-status").textContent(),/clock still running/);
 assert.doesNotMatch(await host.locator("#pvp-turn").textContent(),/CLOCK PAUSED/);
 await guest.locator("#pvp-pause-approve").click();await cycles();
 assert.equal(await host.locator("#pvp-fold").isDisabled(),true);
 assert.equal(await guest.locator("#pvp-fold").isDisabled(),true);
 assert.equal(await host.locator("#pvp-pause-request").textContent(),"Request resume");
 await host.screenshot({path:path.resolve("dist/poker-pvp-setup-paused-360.png"),fullPage:true});
 assert.match(await host.locator("#pvp-turn").textContent(),/CLOCK PAUSED/);
 await host.evaluate(()=>window.__sim.advanceTime(31000));
 await cycles();
 assert.notEqual(await host.locator("#pvp-turn").textContent(),"Hand complete",
  "Unanimously paused hand expired");
 await guest.locator("#pvp-pause-request").click();await cycles(3);
 assert.match(await host.locator("#pvp-pause-status").textContent(),/Resume approval 1\/2/);
 assert.match(await host.locator("#pvp-turn").textContent(),/CLOCK PAUSED/);
 await host.locator("#pvp-pause-approve").click();await cycles();
 assert.doesNotMatch(await host.locator("#pvp-turn").textContent(),/CLOCK PAUSED/);
 await host.evaluate(()=>window.__sim.advanceTime(31000));
 await cycles();
 assert.equal(await host.locator("#pvp-turn").textContent(),"Hand complete",
  "Host did not enforce clock after unanimous resume");
 assert.equal(await guest.locator("#pvp-turn").textContent(),"Hand complete");
 // A unanimous pause arriving AFTER the old host deadline cannot
 // retroactively save the expired turn.
 await host.locator("#pvp-start").click();await cycles();
 const latePause=mk("pause","guest",{action:"pause",seats:["host","guest"]});
 await deliver(latePause);
 await host.evaluate(()=>window.__sim.advanceTime(31000));
 await deliver(mk("pause-vote","host",{target:latePause.id}));
 await cycles();
 assert.equal(await host.locator("#pvp-turn").textContent(),"Hand complete",
  "Late unanimous pause incorrectly rescued an expired betting turn");
 const lateResume=mk("pause","host",{action:"resume",seats:["host","guest"]});
 await deliver(lateResume);
 await deliver(mk("pause-vote","guest",{target:lateResume.id}));
 await cycles();
 // A single pause request must not stop the active clock.
 await host.locator("#pvp-start").click();await cycles();
 await deliver(mk("pause","guest",{action:"pause",seats:["host","guest"]}));
 await cycles();
 await host.evaluate(()=>window.__sim.advanceTime(31000));
 await cycles();
 assert.equal(await host.locator("#pvp-turn").textContent(),"Hand complete",
  "Unapproved pause request incorrectly froze the action clock");
 assert.equal(await guest.locator("#pvp-turn").textContent(),"Hand complete");
 // Finished hands must not leave a sticky disabled betting dock
 // obscuring the hero cards after the lobby's Next Hand controls return.
 const completeLayout=await host.evaluate(()=>{
  const panel=document.querySelector(".pvp-control-panel");
  const hand=document.querySelector("#pvp-hole");
  const p=panel.getBoundingClientRect(),h=hand.getBoundingClientRect();
  return {position:getComputedStyle(panel).position,
   panelTop:p.top,handBottom:h.bottom,
   overlaps:p.top<h.bottom&&p.bottom>h.top};
 });
 assert.equal(completeLayout.position,"static",
  "Completed hand left a sticky action dock over the felt: "+JSON.stringify(completeLayout));
 assert.equal(completeLayout.overlaps,false,
  "Completed hand obscured the near-side cards: "+JSON.stringify(completeLayout));
 await host.screenshot({path:path.resolve("dist/poker-pvp-two-clients-360.png"),fullPage:true});
 assert.deepEqual(errors,[],"Browser JavaScript error");
 for(const c of clients)await c.ctx.close();
 console.log("Encrypted PvP 2-client Chromium smoke OK: serial gaps, replay, reconnect, private cards, signed fold, full showdown, unanimous pause/resume and enforced host timeouts");
}finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
 fs.rmSync(temp,{recursive:true,force:true});
}
