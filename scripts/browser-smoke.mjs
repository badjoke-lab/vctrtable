/**
 * Real Chromium smoke test for the packaged WebXDC Mini App.
 * Run on CI with: npm run build && npm install --no-save --no-package-lock
 * playwright@1.55.0 && npx playwright install --with-deps chromium &&
 * node scripts/browser-smoke.mjs
 *
 * No Vector account, real network chat, deck broadcast or API keys needed.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dist=path.join(root,"dist");
const xdc=path.join(dist,"poker.xdc");
if(!fs.existsSync(xdc))throw new Error("Build poker.xdc before running browser smoke");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"vctrtable-browser-"));
execFileSync("unzip",["-q",xdc,"-d",temp]);
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
const server=http.createServer((req,res)=>{
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);}
 catch{res.writeHead(400).end();return;}
 if(pathname==="/webxdc.js"){
  // On an actual Vector host, this file is injected by the host. This
  // standalone browser test deliberately runs WITHOUT shared WebXDC APIs.
  res.writeHead(200,{"Content-Type":"text/javascript"}).end(";");return;
 }
 const name=pathname==="/"?"/index.html":pathname;
 const file=path.resolve(temp,"."+name);
 if(!file.startsWith(temp+path.sep)){res.writeHead(403).end();return;}
 try{
  if(!fs.statSync(file).isFile())throw new Error("not file");
  res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});
  fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end("not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const errors=[];
 for(const view of [
  {width:390,height:844,seats:6},{width:360,height:740,seats:6},
  {width:320,height:640,seats:6},{width:320,height:640,seats:2}
 ]){
  const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await ctx.newPage();
  const dialogs=[];
  page.on("pageerror",error=>errors.push(view.width+": "+error.message));
  page.on("dialog",async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
  const response=await page.goto(base+"/",{waitUntil:"networkidle"});
  assert.equal(response.status(),200);
  await page.locator("#qa-form").waitFor({state:"visible"});
  assert.equal(await page.locator("#join").count(),0,"Old lobby must not be app entry");
  assert.equal(await page.locator("#qa-chat-mode").count(),1);
  await page.locator("#qa-seats").fill(String(view.seats));
  await page.locator("#qa-seconds").fill("0");
  await page.locator("#qa-form button[type=submit]").click();
  await page.waitForTimeout(500);
  if(!await page.locator("#qa-table").isVisible()){
   const invalid=await page.locator("#qa-form").evaluate(form=>({
    valid:form.checkValidity(),fields:[...form.querySelectorAll("input")].map(x=>({id:x.id,value:x.value,valid:x.validity.valid}))
   }));
   throw new Error("Session startup failed: "+JSON.stringify({view,dialogs,errors,invalid}));
  }
  assert.equal(await page.locator("#qa-players .poker-seat").count(),view.seats-1);
  assert.equal(await page.locator("#qa-hero-cards .vcard").count(),2);
  assert.equal(await page.locator("#qa-board-cards .vcard").count(),5);
  const fullDeckArt=await page.evaluate(async()=>{
    const {makeCard}=await import("./cards.js");
    const root=document.createElement("div");
    root.style.cssText="position:absolute;left:-9999px;top:0;display:flex;flex-wrap:wrap;width:450px";
    document.body.append(root);
    const cards=[];
    for(const suit of "CDHS")for(const rank of "23456789TJQKA"){
      const node=makeCard(rank+suit);
      root.append(node);
      cards.push(node);
    }
    const back=makeCard("AS",{hidden:true});
    root.append(back);
    const images=cards.map(c=>c.querySelector("img"));
    try{await Promise.all([...images,back.querySelector("img")].map(async img=>{
      if(!img)throw Error("CardMeister did not mount an SVG image");
      await img.decode();
    }));}
    catch(error){root.remove();return {total:images.length,loaded:false,error:String(error)};}
    const good=images.every(img=>img.naturalWidth>0&&img.src.startsWith("data:image/svg+xml"));
    const courts=["JC","QD","KH","JS"].map(code=>{
      const el=cards.find(card=>card.getAttribute("cid")===code);
      return el?.querySelector("img")?.src;
    });
    const distinctCourts=new Set(courts).size===4;
    const result={total:images.length,loaded:good,distinctCourts,
      backReady:back.querySelector("img").naturalWidth>0};
    root.remove();
    return result;
  });
  assert.deepEqual(fullDeckArt,{total:52,loaded:true,distinctCourts:true,backReady:true},
    "All 52 full SVG cards and face-down back must decode offline");
  await page.locator("#qa-controls").waitFor({state:"visible"});
  // Actual rendered geometry; Node tests cannot catch clipped or overlapping
  // seats on a six-player phone table.
  const placement=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    return {seats:[...document.querySelectorAll(".poker-seat")].map(rect),
      board:(()=>{
        const cards=[...document.querySelectorAll("#qa-board-cards .vcard")].map(rect);
        return {x:Math.min(...cards.map(c=>c.x)),right:Math.max(...cards.map(c=>c.right)),
          y:Math.min(...cards.map(c=>c.y)),bottom:Math.max(...cards.map(c=>c.bottom))};
      })(),
      hero:rect(document.querySelector(".hero-spot")),
      arena:rect(document.querySelector(".poker-arena")),
      viewport:innerWidth};
  });
  const hit=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>3&&
                      Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>3;
  for(const [i,seat] of placement.seats.entries()){
    assert.ok(seat.x>=0&&seat.right<=view.width,
      "Opponent seat "+i+" horizontal viewport clipping: "+JSON.stringify({view,placement}));
    assert.ok(seat.y>=placement.arena.y-2,
      "Opponent seat "+i+" sticks out above table: "+JSON.stringify({view,placement}));
    assert.ok(!hit(seat,placement.board),"Opponent seat "+i+" overlaps community cards: "+JSON.stringify({view,placement}));
    assert.ok(!hit(seat,placement.hero),"Opponent seat "+i+" overlaps hero: "+JSON.stringify({view,placement}));
    for(let j=0;j<i;j++)assert.ok(!hit(seat,placement.seats[j]),
      "Opponents "+i+"/"+j+" overlap: "+JSON.stringify({view,placement}));
  }
  await page.locator("#qa-chat-bubble").click();
  await page.locator("#qa-chat").waitFor({state:"visible"});
  await page.locator("#qa-chat-text").fill("one-device smoke");
  await page.locator("#qa-chat-form button[type=submit]").click();
  assert.equal(await page.locator(".chat-line.own").count(),1);
  await page.locator("#qa-chat-close").click();
  await page.locator("#qa-chat-mode").selectOption("inline");
  await page.locator("#qa-chat").waitFor({state:"visible"});
  assert.equal(await page.locator(".chat-line.own").count(),1,"Mode switch lost messages");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=2,"Horizontal overflow on "+view.width+"px screen: "+overflow);
  await page.evaluate(()=>window.scrollTo(0,0));
  const dock=await page.locator("#qa-controls").boundingBox();
  assert.ok(dock && dock.y>=0 && dock.y+dock.height<=view.height+2,
    "Betting action dock is not visible in the initial phone viewport");
  await page.locator("#qa-chat-mode").selectOption("drawer");
  await page.evaluate(()=>window.scrollTo(0,0));
  fs.mkdirSync(dist,{recursive:true});
  await page.screenshot({path:path.join(dist,"poker-mobile-"+view.width+"-"+view.seats+".png")});
  // Explicitly save an in-progress hand, reload and restore without losing cards.
  await page.locator("#qa-storage-panel summary").click();
  const holeBefore=await page.locator("#qa-hero-cards .vcard").evaluateAll(xs=>xs.map(x=>x.getAttribute("aria-label")));
  await page.locator("#qa-save").click();
  await page.reload({waitUntil:"networkidle"});
  await page.locator("#qa-form").waitFor({state:"visible"});
  await page.locator("#qa-load-start").click();
  await page.locator("#qa-table").waitFor({state:"visible"});
  const holeAfter=await page.locator("#qa-hero-cards .vcard").evaluateAll(xs=>xs.map(x=>x.getAttribute("aria-label")));
  assert.deepEqual(holeAfter,holeBefore,"Cards changed after reload and recovery");
  // Exercise a complete 2–6-seat hand THROUGH the real button handlers,
  // rather than only folding on preflop and missing showdown crashes.
  let turns=0;
  while(!await page.locator("#qa-end").isVisible()){
   if(++turns>55)throw new Error("Full hand stalled: "+JSON.stringify({view,errors,dialogs}));
   const check=page.locator("#qa-check"),call=page.locator("#qa-call");
   if(await check.isEnabled())await check.click();
   else if(await call.isEnabled())await call.click();
   else if(await page.locator("#qa-fold").isEnabled())await page.locator("#qa-fold").click();
   else throw new Error("No playable action before hand completion");
  }
  assert.equal(await page.locator("#qa-result").isVisible(),true);
  assert.equal(await page.locator("#qa-timer").isVisible(),false,
    "Completed hand must not show stale player countdown");
  assert.ok(/Paid out|精算済み/.test(await page.locator("#qa-pot").textContent()),
    "Pot cannot appear as active after settlement");
  assert.ok(/Showdown|決着/.test(await page.locator("#qa-round").textContent()),
    "Completed hand must not be labelled as active river");
  assert.ok(await page.locator(".qa-settlement-pot").count()>=1,
    "Finished hand must itemize pot recipients");
  assert.equal(await page.locator("#qa-controls").isVisible(),false,
    "Bet controls must be hidden at showdown");
  // Continue from the last saved state and start the next hand, if possible.
  if(await page.locator("#qa-next").isEnabled()){
    await page.locator("#qa-next").click();
    assert.ok((await page.locator("#qa-round").textContent()).includes("Hand 2"));
    assert.equal(await page.locator("#qa-controls").isVisible(),true);
  }
  assert.deepEqual(errors.filter(x=>x.startsWith(view.width+":")),[],
    "Browser runtime exceptions during "+view.width+"px hand");
  assert.deepEqual(dialogs,[],"Unexpected dialogs during full hand");
  await ctx.close();
 }
 // Exercise the bundled manual DM seat UI: this is NOT a simulated live DM
 // connection. No WebXDC shared update is available in this local browser.
 {
  const context=await browser.newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.on("pageerror",error=>errors.push("DM: "+error.message));
  const response=await page.goto(base+"/dm.html",{waitUntil:"networkidle"});
  assert.equal(response.status(),200);
  await page.locator("#dm-link-state").waitFor({state:"visible"});
  assert.equal(await page.locator("#dm-link-state").getAttribute("data-phase"),"empty");
  await page.locator("#room").fill("room-browser-test");
  await page.locator("#identity").fill("npub1alice-test");
  await page.locator("#dm-request-sync").click();
  assert.equal(await page.locator("#dm-link-state").getAttribute("data-phase"),"prepared");
  const raw=await page.locator("#outbox").inputValue();
  assert.equal(raw,'{"kind":"sync"}');
  await page.locator("#dm-mark-sent").click();
  assert.equal(await page.locator("#dm-link-state").getAttribute("data-phase"),"awaiting");
  await page.locator("#dm-retry").click();
  assert.equal(await page.locator("#outbox").inputValue(),raw,"Sync retry changed message");
  await page.locator("#inbox").fill("poker error: STALE_REVISION");
  await page.locator("#import").click();
  assert.equal(await page.locator("#dm-link-state").getAttribute("data-phase"),"needs-sync");
  await page.locator("#dm-request-sync").click();
  assert.equal(await page.locator("#dm-link-state").getAttribute("data-phase"),"prepared");
  await page.screenshot({path:path.join(dist,"poker-manual-dm-sync-360.png")});
  await context.close();
 }
 assert.deepEqual(errors,[],"Browser runtime errors");
 console.log("Chromium QA smoke OK: 2-6 seats, 320/360/390px overlap checks, live browser complete hands, storage+chat");
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
 fs.rmSync(temp,{recursive:true,force:true});
}
