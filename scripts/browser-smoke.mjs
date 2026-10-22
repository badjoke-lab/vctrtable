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
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".png":"image/png"};
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
  assert.equal(await page.locator("#qa-hero-cards > img.vcard").count(),2,
    "Each hero card must be one PNG image directly in the hand");
  assert.equal(await page.locator("#qa-hero-cards .vcard span").count(),0,
    "No overlaid ranks or suit symbols in hole cards");
  assert.equal(await page.locator(".poker-seat-cards .vcard img").count(),0,
    "Opponent PNG cards must not be wrapped with an extra frame");
  // 52 independently decoded PNG assets must be shipped INSIDE the XDC.
  const fullDeckArt=await page.evaluate(async()=>{
    const {makeCard}=await import("./cards.js");
    const holder=document.createElement("div");
    holder.style.cssText="position:absolute;left:-9999px;top:0;display:flex;flex-wrap:wrap;width:450px";
    document.body.append(holder);
    const cards=[];
    for(const suit of "CDHS")for(const rank of "23456789TJQKA"){
      const el=makeCard(rank+suit);holder.append(el);cards.push(el);
    }
    const back=makeCard("AS",{hidden:true});holder.append(back);
    // The <img> element itself must be the COMPLETE card. No wrapper,
    // nested corner markings, suit text, decorative CSS frame, or distortion.
    const imgs=cards;
    try{
      await Promise.all([...imgs,back].map(img=>img.decode()));
      const singleImage=imgs.every(img=>img.tagName==="IMG"&&img.childElementCount===0)&&
        back.tagName==="IMG"&&back.childElementCount===0;
      const styleClean=[...imgs,back].every(img=>{
        const css=getComputedStyle(img);
        const r=img.getBoundingClientRect();
        return css.borderTopWidth==="0px"&&css.borderLeftWidth==="0px"&&
          css.borderBottomWidth==="0px"&&css.borderRightWidth==="0px"&&
          css.borderRadius==="0px"&&css.boxShadow==="none"&&
          css.backgroundColor==="rgba(0, 0, 0, 0)"&&
          Math.abs(r.width/r.height-img.naturalWidth/img.naturalHeight)<0.01;
      });
      const result={
        total:imgs.length,
        png:imgs.every(img=>img.naturalWidth>0&&img.naturalHeight>0&&
         img.currentSrc.endsWith(".png")),
        unique:new Set(imgs.map(img=>img.currentSrc)).size,
        back:back.naturalWidth>0,
        courts:new Set(["JC","QD","KH","JS"].map(code=>cards.find(e=>e.dataset.card===code).currentSrc)).size,
        singleImage,styleClean,
        originalSize:[...imgs,back].every(img=>img.naturalWidth===240&&img.naturalHeight===336),
        approvedDeck:imgs.every(img=>img.currentSrc.includes("/card-png/"))&&
          cards.find(img=>img.dataset.card==="2D").currentSrc.endsWith("/2D.png")&&
          cards.find(img=>img.dataset.card==="5C").currentSrc.endsWith("/5C.png")&&
          back.currentSrc.endsWith("/BACK.png")
      };
      holder.remove();return result;
    }catch(error){holder.remove();return {error:String(error)};}
  });
  assert.deepEqual(fullDeckArt,
    {total:52,png:true,unique:52,back:true,courts:4,singleImage:true,styleClean:true,originalSize:true,approvedDeck:true},
    "Every card must be ONE undistorted PNG with no wrapper, overlay or extra CSS frame");
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
  const assertChatStage=async(where)=>{
    const m=await page.evaluate(()=>{
      const box=id=>{const x=document.querySelector(id),r=x.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      return {visibleHeight:window.visualViewport?.height??innerHeight,
        stage:box("#qa-table"),hud:box("#qa-chat-hud"),chat:box("#qa-chat"),
        input:box("#qa-chat-text"),send:box("#qa-chat-form button"),controlsVisible:
        getComputedStyle(document.querySelector("#qa-controls")).display!=="none"};
    });
    assert.ok(m.hud.y>=m.stage.y-2&&m.hud.bottom<m.chat.y+5,
      "Hand/timer HUD hidden behind chat at "+where+": "+JSON.stringify(m));
    assert.ok(m.input.y>=m.chat.y&&m.input.bottom<=m.stage.bottom+2,
      "Composer clipped at "+where+": "+JSON.stringify(m));
    assert.ok(m.send.y>=m.chat.y&&m.send.bottom<=m.stage.bottom+2,
      "Send button clipped at "+where+": "+JSON.stringify(m));
    assert.ok(!m.controlsVisible,"Bet dock must not cover composer during "+where);
    assert.equal(await page.locator("#qa-hud-cards .vcard").count(),2);
    assert.ok(await page.locator("#qa-hud-timer").isVisible());
  };
  await page.locator("#qa-chat-bubble").click();
  await page.locator("#qa-chat").waitFor({state:"visible"});
  await assertChatStage("drawer open");
  await page.screenshot({path:path.join(dist,"poker-mobile-drawer-"+view.width+".png")});
  await page.locator("#qa-chat-text").fill("one-device smoke");
  await page.locator("#qa-chat-form button[type=submit]").click();
  assert.equal(await page.locator(".chat-line.own").count(),1);
  await page.locator("#qa-chat-close").click();
  await page.locator("#qa-chat-mode").selectOption("inline");
  await page.locator("#qa-chat").waitFor({state:"visible"});
  assert.equal(await page.locator(".chat-line.own").count(),1,"Mode switch lost messages");
  // No input focus yet: merely scrolling to read ALWAYS-ON chat must NOT
  // leave the fixed betting dock covering the message composer.
  await page.locator("#qa-chat-form").scrollIntoViewIfNeeded();
  await page.waitForTimeout(160);
  const composerState=await page.evaluate(()=>{
    const node=document.querySelector("#qa-chat-form"),r=node.getBoundingClientRect();
    return {classes:document.querySelector(".qa-main").className,
      mode:document.querySelector("#qa-chat-mode").value,
      form:{y:r.y,bottom:r.bottom,h:r.height},viewport:innerHeight,
      stage:document.querySelector("#qa-table").className,scrollY};
  });
  assert.ok(composerState.classes.includes("qa-inline-reading"),
    "Inline composer must disable dock when visible: "+JSON.stringify(composerState));
  assert.equal(await page.locator("#qa-controls").isVisible(),false,
    "Inline chat must not be obscured by the betting dock");
  const inlineInput=await page.locator("#qa-chat-text").boundingBox();
  assert.ok(inlineInput&&inlineInput.y>=0&&inlineInput.y+inlineInput.height<=view.height,
    "Idle inline composer is offscreen");
  await page.screenshot({path:path.join(dist,"poker-mobile-inline-reading-"+view.width+"-"+view.seats+".png")});
  // On focus, even the inline mode must enter an isolated composer scene so
  // Android IME never covers the input behind the betting dock.
  await page.locator("#qa-chat-text").click();
  await assertChatStage("inline focus");
  await page.screenshot({path:path.join(dist,"poker-mobile-inline-focus-"+view.width+".png")});
  await page.setViewportSize({width:view.width,height:Math.min(view.height,480)});
  await page.waitForTimeout(80);
  await assertChatStage("simulated smaller visible area / keyboard");
  await page.setViewportSize({width:view.width,height:view.height});
  await page.locator("#qa-chat-close").click();
  assert.equal(await page.locator("#qa-table.chat-stage").count(),0,
    "Closing inline composer must return betting dock");
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForFunction(()=>!document.querySelector(".qa-main").classList.contains("qa-inline-reading"));
  assert.ok(await page.locator("#qa-controls").isVisible());
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

  // This would have caught the real Android screenshot regression: the old
  // geometry checks measured five EMPTY placeholders only, not five rendered
  // community cards at RIVER, where mid-left/right seats obscured 10/A.
  let riverSteps=0;
  while((await page.locator("#qa-street-label").textContent())!=="RIVER" &&
        !await page.locator("#qa-end").isVisible()){
    if(++riverSteps>20)throw Error("Could not reach river for card-overlap check");
    if(await page.locator("#qa-check").isEnabled())await page.locator("#qa-check").click();
    else if(await page.locator("#qa-call").isEnabled())await page.locator("#qa-call").click();
    else throw Error("No safe non-fold river progression");
  }
  assert.equal(await page.locator("#qa-street-label").textContent(),"RIVER",
    "Browser test must reach five real board cards before checking collisions");
  {
    const actual=await page.evaluate(()=>{
      const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
      return {seats:[...document.querySelectorAll(".poker-seat")].map(rect),
        cards:[...document.querySelectorAll("#qa-board-cards .vcard:not(.vcard-empty)")].map(rect),
        hero:rect(document.querySelector(".hero-spot"))};
    });
    assert.equal(actual.cards.length,5,"Must check FIVE real community cards at RIVER");
    assert.equal(await page.locator("#qa-board-cards > img.vcard").count(),5,
      "Revealed river must be five direct PNG images");
    assert.equal(await page.locator("#qa-board-cards .vcard img").count(),0,
      "Community card must not have a nested image or additional corner layer");
    const overlaps=(a,b)=>Math.min(a.right,b.right)>Math.max(a.x,b.x)+2&&
      Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y)+2;
    for(const [i,seat] of actual.seats.entries()){
      for(const [j,card] of actual.cards.entries())
        assert.ok(!overlaps(seat,card),
          "Seat "+(i+2)+" obscures real river board card "+(j+1)+" at "+view.width+": "+JSON.stringify(actual));
      assert.ok(!overlaps(seat,actual.hero),
        "Seat "+(i+2)+" obscures hero cards at "+view.width);
    }
    await page.screenshot({path:path.join(dist,"poker-river-"+view.width+"-"+view.seats+".png")});
  }
  // No duplicate action dock may be mounted, regardless of full-page capture
  // stitching quirks in Chromium/Android screenshots.
  assert.equal(await page.locator("#qa-controls").count(),1,"No duplicate action dock");
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
  // Regression: Next hand must be a compact button BELOW settlement cards,
  // never a huge flex-stretched block next to the pot (Android screenshot).
  const resultBoxes=await page.evaluate(()=>{
    const r=id=>{const b=document.querySelector(id).getBoundingClientRect();
      return {top:b.top,bottom:b.bottom,height:b.height,width:b.width};};
    return {end:r("#qa-end"),summary:r("#qa-settlement"),
      next:r("#qa-next"),buy:r("#qa-buy"),reset:r("#qa-reset"),
      chat:r("#qa-chat"),info:r("#qa-info"),
      visible:getComputedStyle(document.querySelector("#qa-chat")).display!=="none",
      footerCount:document.querySelectorAll(".qa-main > footer").length,
      actionsCount:document.querySelectorAll("#qa-end .qa-end-actions").length};
  });
  assert.equal(resultBoxes.footerCount,1,"There must be exactly one footer node");
  assert.equal(resultBoxes.actionsCount,1,"Finished hand has one actions toolbar");
  assert.ok(resultBoxes.next.height>=36&&resultBoxes.next.height<=48,
    "Next hand must not stretch: "+JSON.stringify(resultBoxes));
  assert.ok(resultBoxes.buy.height<=48&&resultBoxes.reset.height<=48,
    "Rebuy/new session must be compact: "+JSON.stringify(resultBoxes));
  assert.ok(resultBoxes.next.top>=resultBoxes.summary.bottom-2,
    "Next hand must be BELOW pot/rank breakdown: "+JSON.stringify(resultBoxes));
  assert.ok(resultBoxes.buy.top>=resultBoxes.next.bottom-2,
    "Secondary actions must follow Next hand: "+JSON.stringify(resultBoxes));
  assert.ok(resultBoxes.end.bottom<=resultBoxes.chat.top+2 || !resultBoxes.visible,
    "Shown inline chat must follow results, not push them offscreen");
  // Switch to always-on after a completed hand and verify the compact chat.
  await page.locator("#qa-chat-mode").selectOption("inline");
  const finishedInline=await page.evaluate(()=>{
    const chat=document.querySelector("#qa-chat"),history=document.querySelector("#qa-history-panel");
    return {height:chat.querySelector(".chat-stream").getBoundingClientRect().height,
      resultsBottom:document.querySelector("#qa-end").getBoundingClientRect().bottom,
      chatTop:chat.getBoundingClientRect().top,
      historyTop:history.getBoundingClientRect().top,
      chatBottom:chat.getBoundingClientRect().bottom};
  });
  assert.ok(finishedInline.height<=85,"Inline message window too tall");
  assert.ok(finishedInline.chatTop>=finishedInline.resultsBottom-2,
    "Completed result must precede inline chat: "+JSON.stringify(finishedInline));
  assert.ok(finishedInline.historyTop>=finishedInline.chatBottom-2,
    "History should follow inline chat");
  await page.screenshot({path:path.join(dist,
    "poker-showdown-compact-"+view.width+"-"+view.seats+".png"),fullPage:true});
  await page.locator("#qa-chat-mode").selectOption("drawer");
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
