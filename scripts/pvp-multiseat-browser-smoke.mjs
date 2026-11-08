/**
 * Multiway host-trusted PvP integration from the ACTUAL packaged XDC.
 * Independent browser contexts share a simulated WebXDC stream.
 * This is NOT real Vector relay/device or Vector-account verification.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright";

const xdc=path.resolve("dist/poker.xdc");
assert.ok(fs.existsSync(xdc),"Run npm run build before the multiseat smoke");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"vctrtable-multiseat-"));
execFileSync("unzip",["-q",xdc,"-d",temp]);
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png"};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,"http://localhost");
 if(url.pathname==="/webxdc.js"){
  res.writeHead(200,{"Content-Type":"text/javascript"}).end(";");
  return;
 }
 const file=path.resolve(temp,"."+url.pathname);
 if(!file.startsWith(temp+path.sep)){
  res.writeHead(403).end();return;
 }
 try{
  if(!fs.statSync(file).isFile())throw Error("not a file");
  res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});
  fs.createReadStream(file).pipe(res);
 }catch{res.writeHead(404).end("not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const playerCount of [3,6]){
  const clients=[],errors=[],history=[],blocked=new Set(),signedActions=[];
  let serial=0,idNumber=0,tableId="room-multi-"+playerCount+"-first";
  const ids=Array.from({length:playerCount},(_,i)=>"seat"+i);
  const mk=(kind,by,extra={})=>({
   v:["table-create","table-close","seat-join","seat-leave","seat-ready"].includes(kind)?2:1,
   app:"poker",kind,id:"evt"+String(++idNumber).padStart(9,"0"),
   by,at:1000+idNumber,tableId,...extra
  });
  async function deliver(payload){
   serial+=serial%4===0?3:1; // Nonconsecutive positive serials.
   const event={payload,serial,max_serial:serial};
   history.push(event);
   for(const c of clients){
    if(blocked.has(c.name))continue;
    await c.page.evaluate(e=>window.__sim.receive(e),event);
   }
  }
  async function flush(){
   for(const c of clients){
    const envelopes=await c.page.evaluate(()=>window.__sim.out.splice(0));
    for(const envelope of envelopes){
     const payload=envelope.payload;
     if(payload?.app==="vctrtable-pvp"&&payload.kind==="state"){
      const raw=JSON.stringify(payload);
      for(const secret of ['"hole":','"deck":','"ownHole":','"nsec":','"privateKey":'])
       assert.ok(!raw.includes(secret),"Private data leaked into shared WebXDC event: "+secret);
      assert.equal(payload.state.players.length,playerCount,"Wrong number of public seats");
     }
     if(payload?.app==="vctrtable-pvp"&&payload.kind==="action")
      signedActions.push(payload);
     await deliver(payload);
    }
   }
  }
  async function cycles(n=2){
   for(let i=0;i<n;i++){
    await clients[0].page.waitForTimeout(85);
    await flush();
   }
  }
  async function until(label,fn,limit=70){
   for(let i=0;i<limit;i++){
    await cycles(1);
    if(await fn())return;
   }
   const diagnostics=[];
   for(const c of clients){
    diagnostics.push({seat:c.name,
     status:await c.page.locator("#pvp-status").textContent(),
     turn:await c.page.locator("#pvp-turn").textContent(),
     roster:await c.page.locator("#pvp-table-seats").textContent(),
     check:await c.page.locator("#pvp-check").isEnabled(),
     call:await c.page.locator("#pvp-call").isEnabled(),
     pendingOutbound:await c.page.evaluate(()=>window.__sim.out.length),
     received:await c.page.evaluate(()=>window.__sim.incoming.slice(-8))});
   }
   throw Error(label+" did not converge for "+playerCount+
    " players; states="+(await statePackets()).length+
    " actions="+signedActions.length+
    " diagnostics="+JSON.stringify(diagnostics)+
    " browserErrors="+JSON.stringify(errors));
  }
  async function statePackets(){
   return history.filter(x=>x.payload.app==="vctrtable-pvp"&&
    x.payload.kind==="state"&&x.payload.tableId===tableId);
  }
  async function startRoom(){
   await deliver(mk("table-create",ids[0],{name:ids[0],maxPlayers:playerCount}));
   for(const name of ids.slice(1))
    await deliver(mk("seat-join",name,{name}));
   for(const name of ids)
    await deliver(mk("seat-ready",name,{ready:true}));
   const rules=mk("rules",ids[0],{
    settings:{chips:1000,sb:5,bb:10,timer:0,rebuy:true},
    seats:[...ids]
   });
   await deliver(rules);
   for(const name of ids)await deliver(mk("vote",name,{target:rules.id}));
   await until("all session signing/encryption keys",async()=>
    clients[0].page.locator("#pvp-start").isEnabled());
   for(const c of clients)
    assert.doesNotMatch(await c.page.locator("#pvp-players").textContent(),
     /key pending/,"A roster key was missing: "+c.name);
   await clients[0].page.locator("#pvp-start").click();
   await until("all private hands",async()=>{
    for(const c of clients){
     if(!await c.page.locator("#pvp-game").isVisible())return false;
     const own=await c.page.locator("#pvp-hole img").evaluateAll(xs=>
      xs.map(x=>x.dataset.card));
     if(own.length!==2||own.includes("BACK"))return false;
    }
    return true;
   });
   const all=[];
   for(const c of clients){
    const cards=await c.page.locator("#pvp-hole img").evaluateAll(xs=>
     xs.map(x=>x.dataset.card));
    all.push(...cards);
   }
   assert.equal(new Set(all).size,playerCount*2,
    "Each seat must decrypt a distinct private 2-card hand");
   // Validate rendered tabletop geometry for every seat rather than trusting
   // CSS class names. Desktop host and mobile guest have different stages.
   for(const c of clients){
    const layout=await c.page.evaluate(()=>{
     const rect=el=>{
      const r=el.getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
       width:r.width,height:r.height};
     };
     return {
      width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      felt:rect(document.querySelector(".pvp-felt")),
      seats:[...document.querySelectorAll("#pvp-table-seats .pvp-seat:not(.is-self)")].map(rect),
      board:[...document.querySelectorAll("#pvp-board > *")].map(rect),
      hand:[...document.querySelectorAll("#pvp-hole img")].map(rect),
      controls:rect(document.querySelector(".pvp-action-row"))
     };
    });
    const intersects=(x,y)=>{
     const ix=Math.min(x.right,y.right)-Math.max(x.left,y.left);
     const iy=Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top);
     return ix>5&&iy>5;
    };
    assert.ok(layout.scrollWidth<=layout.width+2,
     "Poker table overflows viewport: "+JSON.stringify({playerCount,seat:c.name,layout}));
    assert.equal(layout.seats.length,playerCount-1);
    assert.equal(layout.hand.length,2);
    assert.equal(layout.board.length,5);
    for(const box of [...layout.seats,...layout.hand,...layout.board]){
     assert.ok(box.left>=layout.felt.left-1&&box.right<=layout.felt.right+1,
      "Table item clipped horizontally: "+JSON.stringify({playerCount,seat:c.name,layout,box}));
    }
    for(const box of layout.seats){
     for(const hero of layout.hand)assert.equal(intersects(box,hero),false,
      "Opponent obscures private hand: "+JSON.stringify({playerCount,seat:c.name,layout}));
     for(const card of layout.board)assert.equal(intersects(box,card),false,
      "Opponent obscures community-card slot: "+JSON.stringify({playerCount,seat:c.name,layout}));
    }
    if(playerCount===6&&(c.name===ids[0]||c.name===ids[1])){
     const suffix=c.name===ids[0]?"desktop-1200":"mobile-360";
     await c.page.screenshot({path:path.resolve("dist/poker-pvp-felt-"+suffix+".png"),
      fullPage:true});
    }
   }
  }
  async function chooseAction(){
   for(const c of clients){
    if(await c.page.locator("#pvp-check").isEnabled())
     return {c,kind:"check"};
    if(await c.page.locator("#pvp-call").isEnabled())
     return {c,kind:"call"};
   }
   return null;
  }
  async function actOnce(){
   const action=await chooseAction();
   assert.ok(action,"No active seat had an available Check or Call");
   const before=(await statePackets()).length;
   await action.c.page.locator("#pvp-"+action.kind).click();
   await until("signed action settlement "+action.c.name+" "+action.kind,async()=>
    (await statePackets()).length>before);
   return action;
  }
  try{
   for(const name of ids){
    const desktop=playerCount===6&&name===ids[0];
    const mobileWidth=playerCount===3?320:
     name===ids[playerCount-1]?430:360;
    const ctx=await browser.newContext({viewport:desktop?
     {width:1200,height:900}:{width:mobileWidth,height:mobileWidth===320?640:760},
     isMobile:!desktop,hasTouch:!desktop});
    await ctx.addInitScript(who=>{
     const out=[];
     window.__sim={out,receive:null,incoming:[]};
     window.webxdc={selfAddr:who,selfName:who,
      sendUpdate(packet){out.push(packet);},
      setUpdateListener(fn){
       window.__sim.receive=update=>{
        const e=update?.payload;
        window.__sim.incoming.push({kind:e?.kind,app:e?.app,
         by:e?.by,id:e?.id,revision:e?.revision,serial:update?.serial});
        fn(update);
       };
       return Promise.resolve();
      }
     };
    },name);
    const page=await ctx.newPage();
    page.on("pageerror",error=>errors.push(name+": "+error.message));
    await page.goto(base+"/pvp.html",{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>typeof window.__sim?.receive==="function");
    clients.push({name,ctx,page});
   }
   await startRoom();
   // A non-acting observer loses one committed game state. They must NOT
   // silently update while disconnected, and must recover by serial-0 replay.
   const first=await chooseAction();
   assert.ok(first);
   // Keep the host connected: it is the authoritative game executor.
   // Drop an idle NON-HOST seat, never the actor or the host.
   const observer=clients.find(c=>c.name!==first.c.name&&c.name!==ids[0]);
   assert.ok(observer,"No non-host observer available");
   const oldTurn=await observer.page.locator("#pvp-turn").textContent();
   blocked.add(observer.name);
   await actOnce();
   assert.equal(await observer.page.locator("#pvp-turn").textContent(),oldTurn,
    "Simulated disconnect unexpectedly delivered an update");
   blocked.delete(observer.name);
   await observer.page.reload({waitUntil:"domcontentloaded"});
   await observer.page.waitForFunction(()=>typeof window.__sim?.receive==="function");
   for(const update of history)
    await observer.page.evaluate(e=>window.__sim.receive(e),update);
   // The local YOUR TURN/Waiting text legitimately differs by seat.
   // Compare the identical public roster (stacks + marked active turn)
   // and public pot instead of the actor-relative private UI message.
   await until("dropped-state replay",async()=>
    (await observer.page.locator("#pvp-table-seats").textContent())===
     (await clients[0].page.locator("#pvp-table-seats").textContent())&&
    (await observer.page.locator("#pvp-pot").textContent())===
     (await clients[0].page.locator("#pvp-pot").textContent()));
   // Replay the EXACT signed action with a new WebXDC serial. No second bet.
   const replay=signedActions.at(-1);
   assert.ok(replay,"No signed action captured");
   const stateCount=(await statePackets()).length;
   await deliver(replay);
   await cycles(4);
   assert.equal((await statePackets()).length,stateCount,
    "Duplicate action caused a second state publication");
   // Host crash/reopen while the six-way hand is still in progress. The
   // encrypted device-local full deck must be restored before it can act.
   if(playerCount===6){
    const host=clients[0].page;
    await host.reload({waitUntil:"domcontentloaded"});
    await host.waitForFunction(()=>typeof window.__sim?.receive==="function");
    for(const update of history)
     await host.evaluate(e=>window.__sim.receive(e),update);
    await until("six-seat host encrypted restoration",async()=>
     /restored/i.test(await host.locator("#pvp-key-status").textContent()));
   }
   let actions=1;
   while(actions<60){
    if((await clients[0].page.locator("#pvp-turn").textContent())==="Hand complete")
     break;
    await actOnce();actions++;
   }
   assert.ok(actions>playerCount*2&&actions<60,
    "Expected multiway betting through flop, turn and river");
   await until("all showdown screens",async()=>{
    for(const c of clients)
     if((await c.page.locator("#pvp-turn").textContent())!=="Hand complete")
      return false;
    return true;
   });
   const finished=(await statePackets()).at(-1).payload.state;
   assert.equal(finished.status,"complete");
   assert.equal(finished.board.length,5);
   assert.equal(finished.players.length,playerCount);
   assert.equal(finished.players.reduce((n,p)=>n+p.stack,0),
    playerCount*1000,"Stack conservation after multiway showdown");
   const results=[];
   for(const c of clients)
    results.push(await c.page.locator("#pvp-result").textContent());
   assert.equal(new Set(results).size,1,"Clients disagree on payout");
   if(playerCount===3){
    // A second table in the same XDC must perform a FRESH scoped seat-key
    // exchange. Prior peers must not mask a missing key or block creation.
    await deliver(mk("table-close",ids[0]));
    await cycles(5);
    tableId="room-multi-3-second";
    await startRoom();
    assert.equal((await statePackets()).at(-1).payload.state.number,1,
     "New table incorrectly reused the previous session");
   }
   assert.deepEqual(errors,[],"Uncaught browser errors");
   console.log("Multiseat PvP smoke PASS: "+playerCount+
    " distinct seats, encrypted hands, disconnect/replay, duplicate action,"+
    " full showdown, settlement"+(playerCount===6?", host reload":", fresh table/key exchange"));
  }finally{
   for(const c of clients)await c.ctx.close();
  }
 }
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
 fs.rmSync(temp,{recursive:true,force:true});
}
