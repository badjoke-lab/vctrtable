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
  {width:430,height:932,seats:6},{width:390,height:844,seats:6},{width:360,height:740,seats:6},
  {width:320,height:640,seats:6},{width:320,height:640,seats:2}
 ]){
  const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await ctx.newPage();
  const dialogs=[];
  page.on("pageerror",error=>errors.push(view.width+": "+error.message));
  page.on("dialog",async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
  const response=await page.goto(base+"/",{waitUntil:"networkidle"});
  assert.equal(response.status(),200);
  const topChoice=page.locator(".qa-primary-mode");
  assert.equal(await topChoice.isVisible(),true,"Multiplayer choice must be the first obvious entry");
  assert.equal(await topChoice.getAttribute("href"),"lobby.html");
  assert.equal(await page.locator("#qa-practice-details").evaluate(x=>x.open),false,
    "Solo QA settings must start collapsed, not look like the main app");
  assert.equal(await page.locator("#qa-mode-banner").isVisible(),false,
    "LOCAL QA label should only appear after selecting local practice");
  fs.mkdirSync(dist,{recursive:true});
  await page.screenshot({path:path.join(dist,"poker-landing-"+view.width+".png"),fullPage:true});
  const practiceSummary=page.locator("#qa-practice-details summary");
  await practiceSummary.click();
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
  assert.equal(await page.locator("#qa-top-story-title").textContent(),"NEW HAND",
    "The actual first viewport must visibly announce the new hand");
  assert.equal(await page.locator("#qa-story-title").textContent(),"NEW HAND",
    "Solo practice must explain the initial deal");
  assert.equal(await page.locator("#qa-hero-cards img.vcard.is-dealt").count(),2,
    "Solo private cards must animate as a deal");
  assert.ok(await page.locator("#qa-recent-actions .qa-action-tick").count()>0,
    "Solo practice should show engine-sourced blind/action events");
  assert.equal(await page.locator("#qa-board-cards .vcard").count(),5);
  assert.equal(await page.locator("#qa-players .poker-seat.inspectable").count(),0,
   "Opponent hole cards must not be inspectable before showdown");
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
          parseFloat(css.borderTopLeftRadius)>0&&css.boxShadow==="none"&&
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
  // Real-device regression: initial-view Chat is reachable without scrolling,
  // and the normal betting strip is one row, not a persistent Raise form.
  await page.evaluate(()=>window.scrollTo(0,0));
  const firstView=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {
    x:r.left,y:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height
   };};
   return {chat:rect(document.querySelector("#qa-chat-open")),
    dock:rect(document.querySelector("#qa-controls")),
    hero:[...document.querySelectorAll("#qa-hero-cards img.vcard")].map(rect),
    viewport:window.innerHeight,scroll:scrollY};
  });
  assert.ok(firstView.chat.y>=0&&firstView.chat.bottom<=view.height,
   "Chat action is not visible on first screen: "+JSON.stringify({view,firstView}));
  assert.ok(firstView.dock.height<88,
   "Collapsed betting dock still covers the game: "+JSON.stringify({view,firstView}));
  const dockOverlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*
   Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
  for(const card of firstView.hero){
   assert.ok(card.y>=0&&card.bottom<=view.height&&dockOverlap(card,firstView.dock)<=1,
    "Fixed betting controls obscure actual hero card in initial viewport: "+JSON.stringify({view,firstView}));
  }
  assert.equal(await page.locator("#qa-raise-details").isVisible(),false,
   "Raise amount and presets must start collapsed");
  if(await page.locator("#qa-raise-toggle").isEnabled()){
   await page.locator("#qa-raise-toggle").click();
   assert.equal(await page.locator("#qa-raise-details").isVisible(),true);
   assert.equal(await page.locator("#qa-raise-toggle").getAttribute("aria-expanded"),"true");
   await page.locator("#qa-raise-toggle").click();
   assert.equal(await page.locator("#qa-raise-details").isVisible(),false);
  }
  await page.evaluate(()=>window.scrollTo(0,0));

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
  // Five opponent seats always use the same card, badge and payout slots.
  // Side seats must no longer be compressed compared with the top row.
  if(view.seats===6){
   const widths=placement.seats.map(x=>x.width),heights=placement.seats.map(x=>x.height);
   assert.ok(Math.max(...widths)-Math.min(...widths)<1,
    "All five opponent seats must have identical widths: "+JSON.stringify(placement));
   assert.ok(Math.max(...heights)-Math.min(...heights)<1,
    "All five opponent seats must have identical heights: "+JSON.stringify(placement));
  }
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
  if(view.seats===6){
   // Regressions from actual Vector Android screenshots: bottom seats were
   // visually touching/covering the hero cards in the 740px elongated felt.
   // Check actual PNG rectangles, not only the whole hero container.
   const mobile=await page.evaluate(()=>{
    const rect=x=>{const r=x.getBoundingClientRect();return {
      x:r.left,y:r.top,right:r.right,bottom:r.bottom,w:r.width,h:r.height
    };};
    return {
      felt:rect(document.querySelector(".felt")),
      hero:[...document.querySelectorAll("#qa-hero-cards img.vcard")].map(rect),
      board:[...document.querySelectorAll("#qa-board-cards .vcard")].map(rect),
      seats:[...document.querySelectorAll(".poker-seat")].map(rect)
    };
   });
   assert.ok(mobile.felt.h<=545&&mobile.felt.h>=390,
     "Phone table must be compact and surveyable without a long scroll: "+JSON.stringify(mobile));
   assert.ok(mobile.felt.bottom<=view.height+15,
     "Entire felt must fit the initial phone viewport: "+JSON.stringify({view,mobile}));
   const overlapArea=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*
     Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
   for(let i=0;i<mobile.seats.length;i++){
    for(const [k,card] of [...mobile.hero,...mobile.board].entries())
     assert.ok(overlapArea(mobile.seats[i],card)<=1,
       "Seat "+(i+2)+" overlaps a real card "+k+": "+JSON.stringify(mobile));
   }
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
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.locator("#qa-chat-open").click();
  assert.equal(await page.locator("#qa-table.chat-stage").count(),1,
   "Header Chat shortcut must open the same working chat stage");
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
  assert.equal(await page.locator("#qa-practice-details").evaluate(x=>x.open),false,
    "Reloaded app must return to a simple mode choice, not reopen advanced settings");
  await page.locator("#qa-practice-details summary").click();
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
   assert.match(await page.locator("#qa-top-story-title").textContent(),/SHOWDOWN|HAND WON/,
     "The top banner should show showdown before any scrolling");
   assert.match(await page.locator("#qa-story-title").textContent(),/SHOWDOWN|HAND WON/,
     "Completed Solo hand should announce a verified outcome");
   assert.ok(await page.locator("#qa-story-detail").textContent(),
     "Completed Solo hand must name the award recipients");
   assert.ok(await page.locator("#qa-recent-actions .qa-action-tick").count()>0,
     "Engine event ticker must survive through showdown");
  if(await page.locator("#qa-timer").isVisible()){
   assert.equal(await page.locator("#qa-timer").evaluate(el=>el.classList.contains("qa-hero-hand-rank")),true,
    "The old countdown may only be replaced by the hero's actual hand rank");
   assert.doesNotMatch(await page.locator("#qa-timer").textContent(),/^\d+s$/,
    "No stale countdown may survive at showdown");
  }
  assert.equal(await page.locator("#qa-players .poker-seat .hand-rank").count(),
    await page.locator("#qa-players .poker-seat.inspectable").count(),
    "Every revealed opponent must show a completed hand rank in their own seat");
  assert.equal(await page.locator("#qa-end .qa-settlement-ranks").count(),0,
    "Do not duplicate the same hand rankings in a separate bottom list");
  assert.equal(await page.locator("#qa-pot").isVisible(),false,
    "Do not overlay a redundant Paid out pill on the highlighted winning seat");
  assert.ok(/Paid out|精算済み/.test(await page.locator("#qa-pot").textContent()),
    "Pot cannot appear as active after settlement");
  assert.ok(/Showdown|決着/.test(await page.locator("#qa-round").textContent()),
    "Completed hand must not be labelled as active river");
  assert.equal(await page.locator("#qa-street-label").isVisible(),false,
    "Showdown text must not be tucked behind the top winning seat");
  if(view.seats===6){
   const cleared=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {
     top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height
    };};
    const seats=[...document.querySelectorAll("#qa-players .poker-seat")].map(rect);
    const cards=[...document.querySelectorAll("#qa-board-cards img.vcard:not(.vcard-empty)")].map(rect);
    const arena=rect(document.querySelector(".poker-arena"));
    return {seats,cards,arena,hidden:document.querySelector("#qa-street-label").hidden};
   });
   assert.equal(cleared.hidden,true);
   if(cleared.cards.length===5){
    const topEnd=Math.max(...cleared.seats.slice(0,3).map(x=>x.bottom));
    const boardStart=Math.min(...cleared.cards.map(x=>x.top));
    assert.ok(boardStart>=topEnd+5,
      "Showdown board must leave clear space below top three seats: "+JSON.stringify({view,cleared,topEnd,boardStart}));
    const boardEnd=Math.max(...cleared.cards.map(x=>x.bottom));
    const sideStart=Math.min(...cleared.seats.slice(3).map(x=>x.top));
    assert.ok(boardEnd<=sideStart-4,
      "Showdown board must leave clear space above lower two seats: "+JSON.stringify({view,cleared,boardEnd,sideStart}));
   }
  }
  assert.ok(await page.locator(".qa-settlement-pot").count()>=1,
    "Finished hand must itemize pot recipients");
  assert.equal(await page.locator("#qa-controls").isVisible(),false,
    "Bet controls must be hidden at showdown");
  // Showdown opponent cards are readable individually using the ORIGINAL
  // approved card art; no folded hand may be opened.
  assert.equal(await page.locator("#qa-chat-bubble").count(),0,
   "The old felt-floating Chat action must not exist");
  assert.equal(await page.locator("#qa-chat-open").count(),1,
   "There must be exactly one Chat entry point");
  assert.equal(await page.locator("#qa-players .poker-seat.folded .hand-rank").count(),0,
   "Folded hands must never show a completed rank");
  assert.equal(await page.locator("#qa-players .poker-seat.folded.inspectable").count(),0,
   "Folded opponents must never become inspectable");
  const inspectable=page.locator("#qa-players .poker-seat.inspectable");
  if(await inspectable.count()){
   const labels=await inspectable.first().getAttribute("aria-label");
   assert.match(labels,/tap to inspect|タップで拡大/);
   await inspectable.first().click();
   const modal=page.locator("#qa-card-detail");
   assert.equal(await modal.isVisible(),true);
   assert.equal(await modal.locator("img.vcard").count(),2);
   const detail=await modal.locator("img.vcard").evaluateAll(imgs=>imgs.map(img=>({
     w:img.getBoundingClientRect().width,ratio:img.getBoundingClientRect().width/img.getBoundingClientRect().height,
     radius:getComputedStyle(img).borderTopLeftRadius,src:img.currentSrc
   })));
   for(const c of detail){
    assert.ok(c.w>=90,"Inspect cards must be legible: "+JSON.stringify(c));
    assert.ok(Math.abs(c.ratio-5/7)<.02,"Inspect cards must not be distorted");
    assert.ok(parseFloat(c.radius)>0,"All card corners must be rounded");
    assert.ok(c.src.includes("/card-png/"),"Magnifier must use approved PNG");
   }
   await modal.locator("button").click();
   assert.equal(await modal.isVisible(),false);
  }
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

 // Desktop regression from 2026-10-26 Vector screenshot: the result
 // containers and buttons must stay in normal top-to-bottom document flow.
 for(const view of [{width:960,height:800},{width:1440,height:900}]){
  const ctx=await browser.newContext({viewport:view,deviceScaleFactor:1});
  const page=await ctx.newPage();
  page.on("pageerror",error=>errors.push("desktop-"+view.width+": "+error.message));
  await page.goto(base+"/",{waitUntil:"networkidle"});
  assert.equal(await page.locator(".qa-primary-mode").isVisible(),true,
    "The desktop first screen must also show mode choice instead of developer fields");
  await page.screenshot({path:path.join(dist,"poker-landing-"+view.width+".png"),fullPage:true});
  await page.locator("#qa-practice-details summary").click();
  await page.locator("#qa-seats").fill("6");
  await page.locator("#qa-seconds").fill("0");
  await page.locator("#qa-form button[type=submit]").click();
  await page.locator("#qa-table").waitFor({state:"visible"});
  let turns=0;
  while(!await page.locator("#qa-end").isVisible()){
   if(++turns>65)throw Error("Desktop showdown did not finish at "+view.width);
   if(await page.locator("#qa-check").isEnabled())await page.locator("#qa-check").click();
   else if(await page.locator("#qa-call").isEnabled())await page.locator("#qa-call").click();
   else if(await page.locator("#qa-fold").isEnabled())await page.locator("#qa-fold").click();
   else throw Error("No legal desktop action");
  }
  assert.equal(await page.locator("#qa-street-label").isVisible(),false,
   "Desktop showdown label must not sit behind the top player card");
  const desktopLane=await page.evaluate(()=>{
   const box=x=>{const r=x.getBoundingClientRect();return {top:r.top,bottom:r.bottom};};
   const seats=[...document.querySelectorAll("#qa-players .poker-seat")].map(box);
   const cards=[...document.querySelectorAll("#qa-board-cards img.vcard:not(.vcard-empty)")].map(box);
   return {topSeats:seats.slice(0,3),sideSeats:seats.slice(3),board:cards};
  });
  if(desktopLane.board.length===5){
   const high=Math.max(...desktopLane.topSeats.map(x=>x.bottom));
   const low=Math.min(...desktopLane.sideSeats.map(x=>x.top));
   assert.ok(desktopLane.board.every(x=>x.top>=high+5&&x.bottom<=low-4),
    "Desktop showdown board must be separate from both seat rows: "+JSON.stringify({view,desktopLane}));
  }
  const layout=await page.evaluate(()=>{
   const rect=selector=>{
    const node=document.querySelector(selector),r=node.getBoundingClientRect();
    return {x:r.x,top:r.top,bottom:r.bottom,right:r.right,w:r.width,h:r.height};
   };
   return {
    main:rect(".qa-main"),felt:rect(".felt"),
    end:rect("#qa-end"),result:rect("#qa-result"),
    pot:rect("#qa-end .qa-settlement-pot"),
    next:rect("#qa-next"),buy:rect("#qa-buy"),
    reset:rect("#qa-reset"),history:rect("#qa-history-panel"),
    storage:rect("#qa-storage-panel"),pause:rect(".qa-toolrow"),
    overflow:document.documentElement.scrollWidth-innerWidth
   };
  });
  const order=["result","pot","next","buy","history","storage","pause"];
  for(let i=1;i<order.length;i++){
   const a=layout[order[i-1]],b=layout[order[i]];
   assert.ok(b.top>=a.bottom-2,
    "Desktop blocks overlap/misorder "+order[i-1]+"->"+order[i]+": "+JSON.stringify(layout));
  }
  assert.ok(layout.reset.top>=layout.next.bottom-2&&layout.reset.bottom<=layout.history.top+2,
   "Desktop new-session button is displaced: "+JSON.stringify(layout));
  assert.ok(layout.pot.h>26&&layout.pot.h<105,
   "Desktop pot box must fit text, never stretch over action buttons: "+JSON.stringify(layout));
  assert.ok(layout.next.h>=40&&layout.next.h<=48&&layout.buy.h<=48,
   "Desktop action buttons must stay compact: "+JSON.stringify(layout));
  assert.ok(layout.end.bottom<=layout.history.top+2,
   "History or another section overlaps the result panel: "+JSON.stringify(layout));
  assert.ok(layout.main.w<=682&&layout.overflow<=2,
   "Desktop table must not overflow or stretch across entire browser: "+JSON.stringify(layout));
  await page.screenshot({path:path.join(dist,"poker-desktop-showdown-"+view.width+".png"),fullPage:true});
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
 console.log("Chromium QA smoke OK: visible Chat shortcut, compact Raise dock; 2-6 seats, 320/360/390/430px geometry, uniform seat sizes, rounded cards, card zoom, full hands and chat");
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
 fs.rmSync(temp,{recursive:true,force:true});
}
