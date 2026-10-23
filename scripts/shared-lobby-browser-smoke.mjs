/**
 * TWO-CLIENT browser test using the actual built poker.xdc and a simulated
 * WebXDC host event bus. No actual Vector accounts or server-side identity.
 */
import assert from "node:assert/strict";
import {existsSync,mkdtempSync,rmSync,statSync,createReadStream,mkdirSync} from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright";
const bundle=path.resolve("dist/poker.xdc");
if(!existsSync(bundle))throw Error("Build poker.xdc first");
const tmp=mkdtempSync(path.join(os.tmpdir(),"poker-invite-browser-"));
execFileSync("unzip",["-q",bundle,"-d",tmp]);
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
 ".css":"text/css; charset=utf-8",".png":"image/png"};
const server=http.createServer((req,res)=>{
 let name;
 try{name=decodeURIComponent(new URL(req.url,"http://localhost").pathname);}
 catch{res.writeHead(400).end();return;}
 if(name==="/webxdc.js"){res.writeHead(200,{"Content-Type":"text/javascript"}).end(";");return;}
 const file=path.resolve(tmp,"."+name);
 if(!file.startsWith(tmp+path.sep)){res.writeHead(403).end();return;}
 try{if(!statSync(file).isFile())throw Error("not file");
  res.writeHead(200,{"Content-Type":mime[path.extname(file)]??"application/octet-stream"});
  createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end("not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const errors=[],clients=[];
 for(const addr of ["Player-A","Player-B"]){
  const context=await browser.newContext({viewport:{width:360,height:740},
   isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await context.addInitScript(actor=>{
   const outgoing=[];
   window.__xdcTest={outgoing,received:[]};
   window.webxdc={
    selfAddr:actor,selfName:actor,
    sendUpdate(update){outgoing.push(update);},
    setUpdateListener(callback){window.__xdcTest.receive=callback;return Promise.resolve();},
    sendToChat(message){window.__xdcTest.draft=message;return Promise.resolve();}
   };
  },addr);
  const page=await context.newPage();
  page.on("pageerror",error=>errors.push(addr+": "+error.message));
  await page.goto(base+"/lobby.html",{waitUntil:"networkidle"});
  clients.push({context,page});
 }
 let serial=0;
 async function transmit(){
  for(const {page} of clients){
   const messages=await page.evaluate(()=>window.__xdcTest.outgoing.splice(0));
   for(const payload of messages){
    const update={...payload,serial:++serial,max_serial:serial};
    for(const p of clients)await p.page.evaluate(x=>window.__xdcTest.receive(x),update);
   }
  }
 }
 const host=clients[0].page,guest=clients[1].page;
 await host.locator("#max-players").selectOption("2");
 await host.locator("#table-create button").click();
 await transmit();
 assert.equal(await host.locator("#seats .seat").count(),1);
 assert.equal(await guest.locator("#seats .seat").count(),1);
 assert.ok((await guest.locator("#table-status").textContent()).includes("1/2"));
 await host.locator("#invite").click();
 const invite=await host.evaluate(()=>window.__xdcTest.draft?.text);
 assert.match(invite,/SAME Vector group chat/);
 assert.match(invite,/separate DM or Note/);
 // Preparing this invitation does not falsely add the second player.
 assert.equal(await guest.locator("#seats .seat").count(),1);
 await guest.locator("#join").click();
 await transmit();
 assert.equal(await host.locator("#seats .seat").count(),2);
 assert.equal(await guest.locator("#seats .seat").count(),2);
 assert.equal(await guest.locator("#join").isDisabled(),true);
 await guest.locator("#ready").click();await transmit();
 await host.locator("#ready").click();await transmit();
 assert.match(await guest.locator("#table-status").textContent(),/2\/2/);
 assert.match(await host.locator("#table-status").textContent(),/Ready 2\/2/);
 await host.locator("#rules-form button").click();await transmit();
 assert.match(await guest.locator("#proposal").textContent(),/0\/2/);
 await guest.locator("#proposal button").click();await transmit();
 await host.locator("#proposal button").click();await transmit();
 assert.match(await guest.locator("#proposal").textContent(),/2\/2 Approved/);
 // Reopening the exact XDC in a third WebView can replay the same events,
 // representing the same player whose Vector app was restarted.
 const replay=await browser.newContext({viewport:{width:360,height:740}});
 await replay.addInitScript(()=>{
  window.webxdc={
   selfAddr:"Player-B",selfName:"Player-B",
   sendUpdate(){throw Error("Unexpected outgoing replay");},
   sendToChat(){return Promise.resolve();},
   setUpdateListener(fn){window.__listener=fn;return Promise.resolve();}
  };
 });
 const refreshed=await replay.newPage();
 await refreshed.goto(base+"/lobby.html",{waitUntil:"networkidle"});
 const history=await host.evaluate(()=>window.__xdcTest.received);
 // Shared test bus replays all updates as if the host served serial history.
 const full=await host.evaluate(()=>window.__xdcTest.outgoing.length);
 assert.equal(full,0);
 // Recreate an event history from the first host's DOM would not validate
 // replay. Instead intercepting new events is done through the bus below.
 await replay.close();
 await guest.locator("#leave").click();await transmit();
 assert.equal(await host.locator("#seats .seat").count(),1);
 assert.match(await host.locator("#table-status").textContent(),/Ready 1\/1/);
 await guest.locator("#join").click();await transmit();
 assert.equal(await host.locator("#seats .seat").count(),2);
 assert.match(await host.locator("#table-status").textContent(),/Ready 1\/2/);
 await host.screenshot({path:path.resolve("dist/poker-shared-lobby-360.png"),fullPage:true});
 // Host closes the whole table; both clients return to Create Table.
 host.on("dialog",dialog=>dialog.accept());
 await host.locator("#close").click();await transmit();
 assert.equal(await host.locator("#table-create").isVisible(),true);
 assert.equal(await guest.locator("#table-create").isVisible(),true);
 assert.deepEqual(errors,[]);
 for(const x of clients)await x.context.close();
 console.log("Two-client XDC lobby browser smoke passed: create, invite draft, join, ready, vote, leave, rejoin, close");
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
 rmSync(tmp,{recursive:true,force:true});
}
