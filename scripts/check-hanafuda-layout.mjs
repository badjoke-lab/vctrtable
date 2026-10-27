// Browser viewport regression via headless Chromium DevTools, no dependencies.
// Runs against exact contents of dist/hanafuda.xdc and records screenshots.
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {spawn,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const xdc=path.join(root,"dist","hanafuda.xdc");
if(!fs.existsSync(xdc))throw Error("Build dist/hanafuda.xdc first");
const temp=await fsp.mkdtemp(path.join(os.tmpdir(),"hanafuda-visual-"));
const output=path.join(root,"dist","hanafuda-layout-preview");
await fsp.mkdir(output,{recursive:true});
const extract=spawnSync("unzip",["-q",xdc,"-d",temp],{encoding:"utf8"});
if(extract.status!==0)throw Error("Cannot unpack XDC: "+extract.stderr);
const types={".html":"text/html",".css":"text/css",".js":"text/javascript",".svg":"image/svg+xml"};
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,"http://localhost");
  const relative=decodeURIComponent(u.pathname==="/"?"/index.html":u.pathname);
  const p=path.resolve(temp,"."+relative);
  if(!p.startsWith(temp+path.sep)){res.writeHead(403).end();return;}
  const data=await fsp.readFile(p);
  res.writeHead(200,{"Content-Type":types[path.extname(p)]||"application/octet-stream","Cache-Control":"no-store"});
  res.end(data);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const baseUrl="http://127.0.0.1:"+server.address().port;
const chrome=process.env.CHROME_BIN||["/usr/bin/google-chrome","/usr/bin/chromium","/usr/bin/chromium-browser"].find(fs.existsSync);
if(!chrome)throw Error("Chrome/Chromium not installed");
const child=spawn(chrome,["--headless=new","--no-sandbox","--disable-dev-shm-usage",
 "--disable-gpu","--disable-extensions","--hide-scrollbars","--remote-debugging-port=0",
 "--remote-allow-origins=*","--user-data-dir="+path.join(temp,"chrome"),"about:blank"],
 {stdio:["ignore","ignore","pipe"]});
const wsUrl=await new Promise((resolve,reject)=>{
 let accumulated="";
 const timer=setTimeout(()=>reject(Error("Chrome failed to start "+accumulated.slice(-600))),15000);
 child.stderr.on("data",data=>{
  accumulated+=String(data);
  const found=accumulated.match(/DevTools listening on (ws:\/\/[^\s]+)/);
  if(found){clearTimeout(timer);resolve(found[1]);}
 });
 child.on("exit",code=>{clearTimeout(timer);reject(Error("Chrome exited "+code));});
});
const socket=new WebSocket(wsUrl);
await new Promise((resolve,reject)=>{
 socket.addEventListener("open",resolve,{once:true});
 socket.addEventListener("error",reject,{once:true});
});
let nextId=0;
const pending=new Map();
const errors=[];
socket.addEventListener("message",event=>{
 const message=JSON.parse(String(event.data));
 if(message.method==="Runtime.exceptionThrown")errors.push(message.params?.exceptionDetails?.text||"Runtime exception");
 const item=pending.get(message.id);
 if(!item)return;
 pending.delete(message.id);
 clearTimeout(item.timer);
 if(message.error)item.reject(Error(JSON.stringify(message.error)));
 else item.resolve(message.result);
});
function send(method,params={},sessionId){
 const id=++nextId;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error("CDP timeout "+method));},13000);
  pending.set(id,{resolve,reject,timer});
  socket.send(JSON.stringify(Object.assign({id,method,params},sessionId?{sessionId}:{})));
 });
}
const target=await send("Target.createTarget",{url:"about:blank"});
const attach=await send("Target.attachToTarget",{targetId:target.targetId,flatten:true});
const session=attach.sessionId;
const run=(method,params)=>send(method,params,session);
await run("Page.enable");
await run("Runtime.enable");
async function evaluate(expression){
 const response=await run("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
 return response.result?.value;
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const expr="(()=>{const ids=['board','field','yourHand','actionDock','status','yourCaptured','guide','scoreboard'];"+
 "const rect=id=>{const el=document.getElementById(id)||document.querySelector('.'+id);if(!el)throw Error('Missing region '+id);const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};};"+
 "const sections=Object.fromEntries(ids.map(id=>[id,rect(id)]));"+
 "const cards=[...document.querySelectorAll('#field .card')].map(e=>{let r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};});"+
 "return {vw:innerWidth,vh:innerHeight,scrollH:document.documentElement.scrollHeight,scrollW:document.documentElement.scrollWidth,sections,cards,body:document.body.className};})()";
const checkpoints=[];
try{
 for(const [name,width,height] of [["phone-small",360,640],["phone",390,760],
  ["phone-landscape",740,420],["compact-window",800,600],
  ["desktop-window",960,680],["desktop",1280,800]]){
  await run("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<600});
  await run("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  await run("Page.navigate",{url:baseUrl});
  for(let retry=0;retry<100;retry++){
   if(await evaluate("document.readyState==='complete' && !!document.getElementById('start')"))break;
   await sleep(80);
  }
  await evaluate("document.getElementById('start').click()");
  await sleep(80);
  const before=await evaluate(expr);
  if(before.body!=="in-game")throw Error(name+": fixed viewport game class is missing");
  const header=await evaluate("(()=>{const r=document.getElementById('lang').getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};})()");
  if(header.right>width-55)
   throw Error(name+": Vector close-button reserved top-right space overlaps language switch "+JSON.stringify(header));
  const initialHand=await evaluate("document.querySelector('#yourHand .card').getBoundingClientRect().height");
  if((height>=640&&initialHand<55)||(height>=700&&width<600&&initialHand<85))
   throw Error(name+": hand artwork remains too small: "+initialHand);

  const r=before.sections;
  if(before.scrollH>height+2||before.scrollW>width+2||r.actionDock.bottom>height+2||
     r.yourHand.bottom>height+2||r.board.h<110||r.field.h<30)
   throw Error(name+": clipped/outside viewport "+JSON.stringify(before));
  if(name==="phone-small"&&before.cards[0]?.w<40)
   throw Error(name+": starting field card is too small: "+before.cards[0]?.w);
  if(["desktop-window","compact-window"].includes(name)&&before.cards[0]?.w<50)
   throw Error(name+": normal desktop field cards shrank below 50px: "+before.cards[0]?.w);
  if(["desktop-window","compact-window"].includes(name)&&initialHand<85)
   throw Error(name+": normal desktop hand cards shrank below 85px tall: "+initialHand);
  if(name==="phone-landscape"&&before.cards[0]?.w<35)
   throw Error(name+": landscape field cards are unreadably narrow: "+before.cards[0]?.w);
  if(name==="phone-landscape"){
   const captureHead=await evaluate("(()=>{return {opp:getComputedStyle(document.querySelector('.opp-capture-head')).display,own:getComputedStyle(document.querySelector('.own-capture-head')).display};})()");
   if(captureHead.opp!=="none"||captureHead.own!=="none")
    throw Error(name+": capture headings overlap the three-column layout: "+JSON.stringify(captureHead));
  }
  if(name==="phone-landscape"){
   const handWidth=await evaluate("document.querySelector('#yourHand .card').getBoundingClientRect().width");
   if(handWidth<28)throw Error(name+": landscape hand cards are too narrow: "+handWidth);
  }
  if(before.cards.some(card=>card.w<15||card.h<20||
     card.y<r.field.y-2||card.bottom>r.field.bottom+2))
   throw Error(name+": field artwork clipped "+JSON.stringify(before.cards));
  await evaluate("document.getElementById('roundIntro').hidden=true");
  const baselineShot=await run("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
  await fsp.writeFile(path.join(output,name+"-table.png"),
   Buffer.from(baselineShot.data,"base64"));
  // Historically each of these transient regions pushed the hand downward.
  await evaluate("(()=>{document.getElementById('roundIntro').hidden=true;"+
   "document.getElementById('actionNarration').hidden=false;"+
   "document.getElementById('actionNarration').textContent='The card was captured';"+
   "document.getElementById('drawReveal').hidden=false;"+
   "document.getElementById('drawRevealCard').src='cards/7-1.svg';"+
   "document.getElementById('selection').hidden=false;"+
   "document.getElementById('turnPrompt').hidden=true;})()");
  const during=await evaluate(expr);
  const selectedInsideRail=await evaluate("(()=>{const rail=document.getElementById('yourHand');const card=rail.querySelector('.card');card.classList.add('selected-card');const a=rail.getBoundingClientRect(),b=card.getBoundingClientRect();return {railTop:a.top,cardTop:b.top};})()");
  if(selectedInsideRail.cardTop<selectedInsideRail.railTop-2)
   throw Error(name+": selected hand card is clipped above scrollable hand rail");
  const buttons=await evaluate("(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {w:r.width,h:r.height}};return {play:rect('confirm'),cancel:rect('cancel')}})()");
  if(width<=600&&(buttons.play.w<95||buttons.cancel.w<95||
    buttons.play.h<38||buttons.cancel.h<38))
   throw Error(name+": small touch targets "+JSON.stringify(buttons));
  const drawOverlap=await evaluate("(()=>{"+
   "const draw=document.getElementById('drawReveal').getBoundingClientRect();"+
   "const field=document.getElementById('field').getBoundingClientRect();"+
   "return {drawLeft:draw.left,fieldRight:field.right};})()");
  if(drawOverlap.drawLeft<drawOverlap.fieldRight-2)
   throw Error(name+": deck flip obscures a selectable field card "+
    JSON.stringify(drawOverlap));
  const eventShot=await run("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
  await fsp.writeFile(path.join(output,name+"-event.png"),
   Buffer.from(eventShot.data,"base64"));
  for(const id of ["board","field","yourHand","actionDock","status","yourCaptured"]){
   for(const property of ["y","h","bottom"])
    if(Math.abs(before.sections[id][property]-during.sections[id][property])>1)
     throw Error(name+": layout jump in "+id+"."+property+" ("+
      before.sections[id][property]+" -> "+during.sections[id][property]+")");
  }
  // A long-lived round can have 15 field cards. The hand must stay fixed.
  await evaluate("(()=>{const field=document.getElementById('field');"+
   "while(field.children.length<15)field.append(field.children[0].cloneNode(true));"+
   "field.style.setProperty('--field-rows',innerWidth>=700?'3':'4');})()");
  const many=await evaluate(expr);
  if(Math.abs(before.sections.yourHand.y-many.sections.yourHand.y)>1)
   throw Error(name+": 15 field cards moved the hand vertically");
  if(many.cards.some(card=>card.w<12||card.bottom>many.sections.field.bottom+2))
   throw Error(name+": 15 field cards exceed their fixed field zone");
  await evaluate("(()=>{const pile=document.getElementById('yourCaptured');"+
   "const art=document.querySelector('#yourHand .card');"+
   "for(let i=0;i<20;i++)pile.append(art.cloneNode(true));})()");
  const withCaptures=await evaluate(expr);
  if(Math.abs(before.sections.yourHand.y-withCaptures.sections.yourHand.y)>1 ||
     Math.abs(before.sections.actionDock.bottom-withCaptures.sections.actionDock.bottom)>1)
   throw Error(name+": filled captured pile changed table geometry");
  const captureHeight=await evaluate("document.querySelector('#yourCaptured .card').getBoundingClientRect().height");
  if(width<600&&height>=640&&captureHeight<32)
   throw Error(name+": captured cards too small: "+captureHeight);
  // Inspect a real public field card without changing the layout.
  await evaluate("(()=>{const item=document.querySelector('#field .card');item.click();})()");
  const modal=await evaluate("(()=>{const el=document.getElementById('cardInspect'),r=document.getElementById('cardInspectImage').getBoundingClientRect();return {hidden:el.hidden,h:r.height,bottom:r.bottom};})()");
  if(modal.hidden||modal.h<Math.min(140,height*.3)||modal.bottom>height+2)
   throw Error(name+": zoom modal cropped or nonfunctional "+JSON.stringify(modal));
  const zoomShot=await run("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
  await fsp.writeFile(path.join(output,name+"-inspect.png"),Buffer.from(zoomShot.data,"base64"));
  await evaluate("document.getElementById('cardInspectClose').click()");
  // Hints and switching language must not modify the physical table regions.
  await evaluate("document.getElementById('hintsToggle').click()");
  await evaluate("(()=>{const e=document.getElementById('lang');e.value='ja';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  const afterHints=await evaluate(expr);
  if(Math.abs(before.sections.yourHand.y-afterHints.sections.yourHand.y)>1 ||
     Math.abs(before.sections.field.h-afterHints.sections.field.h)>1)
   throw Error(name+": language / hints toggle moved the board");

  await evaluate("document.getElementById('guideToggle').click()");
  const shot=await run("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
  await fsp.writeFile(path.join(output,name+"-guide.png"),Buffer.from(shot.data,"base64"));
  checkpoints.push({name,width,height,scrollHeight:before.scrollH,
   boardHeight:Math.round(r.board.h),fieldHeight:Math.round(r.field.h),
   fieldCardWidth:Math.round(before.cards[0]?.w||0),
   handY:Math.round(r.yourHand.y),dockBottom:Math.round(r.actionDock.bottom)});
 }
 if(errors.length)throw Error("Uncaught game UI error: "+errors.join(" / "));
 console.log(JSON.stringify({status:"PASS",checkpoints},null,2));
}finally{
 socket.close();
 if(child.exitCode===null) {
  const exited=new Promise(resolve=>child.once("exit",resolve));
  child.kill();
  await Promise.race([exited,sleep(3000)]);
 }
 await new Promise(resolve=>server.close(resolve));
 try{await fsp.rm(temp,{recursive:true,force:true,maxRetries:12,retryDelay:150});}
 catch(err){console.warn("Temporary Chrome cache cleanup skipped:",err.message);}

}
