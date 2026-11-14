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
 "--disable-gpu","--disable-extensions","--disable-background-networking",
 "--disable-crash-reporter","--hide-scrollbars","--remote-debugging-port=0",
 "--remote-allow-origins=*","--user-data-dir="+path.join(temp,"chrome"),"about:blank"],
 {stdio:["ignore","ignore","pipe"],env:{...process.env,DBUS_SESSION_BUS_ADDRESS:""}});
const wsUrl=await new Promise((resolve,reject)=>{
 let accumulated="";
 const timer=setTimeout(()=>reject(Error("Chrome failed to start "+accumulated.slice(-1200))),35000);
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

const mockedWebxdc=String.raw`
(()=> {
 const name="hanafuda-pvp-simulated-same-chat";
 window.__wire=[];
 window.__channelJoins=0;
 window.webxdc={
  joinRealtimeChannel(){
   window.__channelJoins++;
   const broadcast=new BroadcastChannel(name);
   let handler=()=>{};
   broadcast.onmessage=e=>{
    window.__wire.push(e.data);
    handler(new Uint8Array(e.data));
   };
   return {
    setListener(fn){handler=fn;},
    send(data){
     window.__wire.push(Array.from(data));
     broadcast.postMessage(Array.from(data));
    },
    leave(){broadcast.close();}
   };
  }
 };
})();
`;
const second=await send("Target.createTarget",{url:"about:blank"});
const attached=await send("Target.attachToTarget",{targetId:second.targetId,flatten:true});
const other=attached.sessionId;
const run2=(method,params)=>send(method,params,other);
async function evaluate2(expression){
 const response=await run2("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);
 return response.result?.value;
}
async function until(check,label,deadline=25000){
 for(let i=0;i<deadline/125;i++){
  if(await check())return;
  await sleep(125);
 }
 throw Error("Timed out: "+label);
}
try{
 await run2("Page.enable");await run2("Runtime.enable");
 await run("Emulation.setDeviceMetricsOverride",{
  width:390,height:760,deviceScaleFactor:1,mobile:true
 });
 await run2("Emulation.setDeviceMetricsOverride",{
  width:960,height:680,deviceScaleFactor:1,mobile:false
 });
 await run("Page.addScriptToEvaluateOnNewDocument",{source:mockedWebxdc});
 await run2("Page.addScriptToEvaluateOnNewDocument",{source:mockedWebxdc});
 await Promise.all([
  run("Page.navigate",{url:baseUrl+"/pvp.html"}),
  run2("Page.navigate",{url:baseUrl+"/pvp.html"})
 ]);
 await until(async()=>{
  const a=await evaluate("document.readyState==='complete'&&!!document.getElementById('host')");
  const b=await evaluate2("document.readyState==='complete'&&!!document.getElementById('join')");
  return a&&b;
 },"PvP both pages load");
 if(!await evaluate("!document.getElementById('host').disabled")||
    !await evaluate2("!document.getElementById('join').disabled"))
  throw Error("Simulated Vector host did not enable realtime buttons");
 await evaluate("document.getElementById('host').click()");
 await evaluate2("document.getElementById('join').click()");
 await until(async()=>{
  const a=await evaluate("!document.getElementById('pairing').hidden");
  const b=await evaluate2("!document.getElementById('pairing').hidden");
  return a&&b;
 },"both devices exchange ephemeral keys");
 const codeHost=await evaluate("document.getElementById('pairingCode').textContent");
 const codeGuest=await evaluate2("document.getElementById('pairingCode').textContent");
 if(!/^\d{6}$/.test(codeHost)||codeHost!==codeGuest)
  throw Error("PvP pairing codes disagree");
 await evaluate2("document.getElementById('approve').click()");
 await evaluate("document.getElementById('approve').click()");
 await until(()=>evaluate("!document.getElementById('startMatch').hidden"),
  "host and guest confirm pairing",18000);
 await evaluate("document.getElementById('startMatch').click()");
 await until(async()=>{
  return await evaluate("!document.getElementById('match').hidden")&&
   await evaluate2("!document.getElementById('match').hidden");
 },"both devices receive the redacted initial deal",20000);
 const layout=String.raw`(()=>{
  const h=document.getElementById('yourHand').getBoundingClientRect();
  const board=document.querySelector('.board').getBoundingClientRect();
  const match=document.getElementById('match').getBoundingClientRect();
  const sel=document.getElementById('lang').getBoundingClientRect();
  return {h:h.height,handBottom:h.bottom,boardHeight:board.height,
   docHeight:document.documentElement.scrollHeight,viewport:innerHeight,
   matchBottom:match.bottom,langRight:sel.right,viewportWidth:innerWidth,
   privateCount:document.querySelectorAll('#yourHand .card').length,
   opponentBacks:[...document.querySelectorAll('#opponentHand .card img')]
    .every(img=>img.src.endsWith('/back.svg')),
   opponentCount:document.querySelectorAll('#opponentHand .card').length};
 })()`;
 const hostLayout=await evaluate(layout),guestLayout=await evaluate2(layout);
 for(const [name,l] of [["host",hostLayout],["guest",guestLayout]]){
  if(l.docHeight>l.viewport+2||l.matchBottom>l.viewport+2||
    l.handBottom>l.viewport+2||l.h<65||
    l.langRight>l.viewportWidth-55||
    l.privateCount!==8||!l.opponentBacks||l.opponentCount!==8)
   throw Error(name+" PvP layout, secrecy or hand count failure: "+JSON.stringify(l));
 }
 // Observe actual encrypted packets; JSON wire messages must not contain
 // plaintext "hand" arrays or any complete private deck.
 const wire=await evaluate2("window.__wire.map(x=>JSON.parse(new TextDecoder().decode(new Uint8Array(x))))");
 const sealed=wire.filter(x=>x.kind==="sealed");
 if(!sealed.length||sealed.some(x=>x.hand||x.deck||x.data?.hands))
  throw Error("Private hand was sent without encryption");
 let actions=0;
 for(let step=0;step<12;step++){
  const probe=String.raw`(()=>{
   const visible=id=>!document.getElementById(id).hidden;
   return {
    turn:visible('playActions'),
    target:visible('drawPick'),
    decision:visible('decisionActions'),
    next:visible('roundActions'),
    ended:document.getElementById('gameStatus').textContent.includes('Match complete')
   };
  })()`;
  const a=await evaluate(probe),b=await evaluate2(probe);
  const who=a.turn||a.target||a.decision||a.next?0:
   b.turn||b.target||b.decision?1:-1;
  if(who<0){await sleep(750);continue;}
  const on=who===0?evaluate:evaluate2;
  if((who===0?a:b).next){
   await on("document.getElementById('nextRound').click()");
  }else if((who===0?a:b).target){
   await on("document.querySelector('#field .card.target')?.click()");
  }else if((who===0?a:b).decision){
   await on("document.getElementById('stop').click()");
  }else{
   await on("document.querySelector('#yourHand .card')?.click()");
   await on("document.querySelector('#field .card.match')?.click()");
   await on("document.getElementById('confirm').click()");
  }
  actions++;
  await sleep(600);
 }

 // Vector v0.5 browser/PWA restoration: pagehide invalidates a realtime
 // channel, and a persisted pageshow must join again and recover the session.
 const guestStateBefore=await evaluate2("document.getElementById('roundLabel').textContent");
 const guestWireBefore=await evaluate2("window.__wire.length");
 await evaluate2("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))");
 await evaluate2("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");
 await until(async()=>{
  const count=await evaluate2("window.__wire.length");
  const joined=await evaluate2("window.__channelJoins");
  return count>guestWireBefore&&joined===2;
 },"guest restores encrypted channel after BFCache",8000);
 if(await evaluate2("document.getElementById('roundLabel').textContent")!==guestStateBefore)
  throw Error("PvP round was reset by BFCache return");
 await evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}))");
 await evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))");
 if(await evaluate("window.__channelJoins")!==2)
  throw Error("Host did not rejoin the realtime channel after BFCache");
 await until(async()=>{
  const isAlive=await evaluate("!document.getElementById('match').hidden");
  const guestAlive=await evaluate2("!document.getElementById('match').hidden");
  return isAlive&&guestAlive;
 },"host returns from BFCache with same match",8000);
 // v0.5 landscape and desktop width changes must recompute the card rows
 // without discarding a game or revealing hidden opponent hands.
 await run2("Emulation.setDeviceMetricsOverride",{
  width:740,height:420,deviceScaleFactor:1,mobile:false
 });
 await evaluate2("window.dispatchEvent(new Event('resize'))");
 const rowCount=await evaluate2("document.getElementById('field').style.getPropertyValue('--rows')");
 if(!/^[2-9]\d*$/.test(rowCount))throw Error("Landscape field grid did not resize");

 if(actions<3)throw Error("Real connected browser pair could not progress at least three actions");
 const shot=await run("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
 await fsp.writeFile(path.join(output,"pvp-host.png"),Buffer.from(shot.data,"base64"));
 const shot2=await run2("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});
 await fsp.writeFile(path.join(output,"pvp-guest.png"),Buffer.from(shot2.data,"base64"));
 if(errors.length)throw Error("Uncaught PvP browser error: "+errors.join(" | "));
 console.log(JSON.stringify({status:"PASS",pairingCodeMatched:true,
  encryptedPackets:sealed.length,actions,hostLayout,guestLayout},null,2));
}finally{
 socket.close();child.kill();
 await new Promise(resolve=>server.close(resolve));
 try{await fsp.rm(temp,{recursive:true,force:true,maxRetries:6,retryDelay:150});}
 catch(e){console.warn("Chrome QA temporary cleanup:",e.message);}
}
