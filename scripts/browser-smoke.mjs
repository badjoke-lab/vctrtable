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
 for(const view of [{width:390,height:844,seats:6},{width:320,height:640,seats:2}]){
  const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await ctx.newPage();
  page.on("pageerror",error=>errors.push(view.width+": "+error.message));
  const response=await page.goto(base+"/",{waitUntil:"networkidle"});
  assert.equal(response.status(),200);
  await page.locator("#qa-form").waitFor({state:"visible"});
  assert.equal(await page.locator("#join").count(),0,"Old lobby must not be app entry");
  assert.equal(await page.locator("#qa-chat-mode").count(),1);
  await page.locator("#qa-seats").fill(String(view.seats));
  await page.locator("#qa-seconds").fill("0");
  await page.locator("#qa-form button[type=submit]").click();
  await page.locator("#qa-table").waitFor({state:"visible"});
  assert.equal(await page.locator("#qa-players .poker-seat").count(),view.seats-1);
  assert.equal(await page.locator("#qa-hero-cards .vcard").count(),2);
  assert.equal(await page.locator("#qa-board-cards .vcard").count(),5);
  await page.locator("#qa-controls").waitFor({state:"visible"});
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
  await page.screenshot({path:path.join(dist,"poker-mobile-"+view.width+".png")});
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
  // Real local action should advance the engine (or settle), not throw.
  await page.locator("#qa-fold").click();
  const after=await page.locator("#qa-round").textContent();
  assert.ok(after.includes("Hand 1"));
  await ctx.close();
 }
 assert.deepEqual(errors,[],"Browser runtime errors");
 console.log("Chromium QA smoke OK: two/six seats, compact chat, reloading, 390/320px, 2 screenshots");
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
 fs.rmSync(temp,{recursive:true,force:true});
}
