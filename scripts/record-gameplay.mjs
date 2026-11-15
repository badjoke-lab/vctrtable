/**
 * Capture a real, autonomous Solo Poker playthrough from the BUILT poker.xdc.
 * Browser WebXDC shim only substitutes the native host bridge; all card
 * dealing, AI turns, betting, stages and settlement use the shipped app.
 *
 * Artifacts: dist/poker-gameplay-{desktop,mobile}.webm and PNG covers.
 * ffmpeg converts these to H.264 MP4 in the recording workflow.
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
if(!fs.existsSync(xdc))throw new Error("Build poker.xdc before recording");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"vctrtable-record-"));
const raw=path.join(dist,"recording-raw");
fs.mkdirSync(raw,{recursive:true});
execFileSync("unzip",["-q",xdc,"-d",temp]);
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".json":"application/json",".png":"image/png"};
const server=http.createServer((request,response)=>{
 let route;
 try{route=decodeURIComponent(new URL(request.url,"http://localhost").pathname);}
 catch{response.writeHead(400).end();return;}
 if(route==="/webxdc.js"){
  response.writeHead(200,{"Content-Type":"text/javascript"}).end(";");return;
 }
 const name=route==="/"?"/index.html":route;
 const file=path.resolve(temp,"."+name);
 if(!file.startsWith(temp+path.sep)){response.writeHead(403).end();return;}
 try{
  if(!fs.statSync(file).isFile())throw Error("not found");
  response.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});
  fs.createReadStream(file).pipe(response);
 }catch{response.writeHead(404).end("not found");}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const url="http://127.0.0.1:"+server.address().port;
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
let browser;
async function capture(name,viewport,seats){
 const context=await browser.newContext({
  viewport,deviceScaleFactor:1,
  isMobile:name==="mobile",hasTouch:name==="mobile",
  reducedMotion:"no-preference",
  recordVideo:{dir:raw,size:viewport}
 });
 // Deterministic computer strategy, without inserting artificial game states.
 await context.addInitScript(()=>{Math.random=()=>0.5;});
 const page=await context.newPage();
 const errors=[];
 page.on("pageerror",err=>errors.push(err.message));
 const video=page.video();
 await page.goto(url+"/",{waitUntil:"networkidle"});
 await page.locator("#qa-practice-details summary").click();
 await page.locator("#qa-seats").fill(String(seats));
 await page.locator("#qa-seconds").fill("0");
 await page.locator("#qa-form button[type=submit]").click();
 await page.locator("#qa-table").waitFor({state:"visible"});
 await page.locator("#qa-hero-cards img.vcard").first().waitFor({state:"visible"});
 await sleep(1200);
 const stages=new Set();
 let acted=0;
 for(let i=0;i<50;i++){
  const stage=await page.locator("#qa-round").textContent();
  stages.add(stage);
  if(await page.locator("#qa-end").isVisible())break;
  await page.waitForFunction(()=>{
   const done=document.getElementById("qa-end");
   if(done&&!done.hidden)return true;
   const ids=["qa-check","qa-call","qa-fold"];
   return ids.some(id=>{const x=document.getElementById(id);return x&&!x.disabled&&!x.hidden;});
  },null,{timeout:30000});
  if(await page.locator("#qa-end").isVisible())break;
  // Play conservatively so the REAL game reaches Flop, Turn, River, Showdown.
  if(await page.locator("#qa-check").isEnabled())
   await page.locator("#qa-check").click();
  else if(await page.locator("#qa-call").isEnabled())
   await page.locator("#qa-call").click();
  else throw new Error("No legal non-folding action in "+name);
  acted++;
  await sleep(400);
 }
 assert.ok(await page.locator("#qa-end").isVisible(),name+" playthrough did not reach a result");
 const result=(await page.locator("#qa-result-headline").textContent()).trim();
 const net=(await page.locator("#qa-result-amount").textContent()).trim();
 const winner=(await page.locator("#qa-result-winner").textContent()).trim();
 assert.ok(acted>=3,"Too few player decisions to show gameplay");
 assert.ok(stages.size>=3,"Did not cover enough distinct stages");
 assert.ok(errors.length===0,"Runtime errors: "+errors.join(" | "));
 await sleep(2800);
 await page.screenshot({path:path.join(dist,"poker-gameplay-cover-"+name+".png")});
 const videoFile=await video.path();
 await context.close();
 const final=path.join(dist,"poker-gameplay-"+name+".webm");
 fs.copyFileSync(videoFile,final);
 console.log(JSON.stringify({name,viewport,seats,acted,stages:[...stages],result,net,winner,video:final,
  bytes:fs.statSync(final).size}));
}
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 await capture("desktop",{width:1280,height:800},6);
 await capture("mobile",{width:390,height:844},4);
}finally{
 await browser?.close();
 await new Promise(done=>server.close(done));
 fs.rmSync(temp,{recursive:true,force:true});
}
