import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {cardById,startRound,chooseInitialDealer,playCard,chooseTarget,drawNextCard,decide,scoreCards} from "../packages/hanafuda/koikoi.js";
import {matchingFieldCards,capturePreview,yakuProgress,publicYakuOutlook} from "../packages/hanafuda/guide.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const html=fs.readFileSync(path.join(root,"apps/hanafuda/index.html"),"utf8");
const script=fs.readFileSync(path.join(root,"apps/hanafuda/main.js"),"utf8")
 .replace(/^import .*?;\s*$/gm,"");
class FakeElement{
 constructor(animationLog=[]){
  this.animationLog=animationLog;
  this.children=[];this.style={};this.listeners={};this.dataset={};
  this.hidden=false;this.disabled=false;this.className="";this.textContent="";
  this.value="";this.attrs={};
  this.classList={add:name=>{this.className+=" "+name;}};
 }
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=items;}
 setAttribute(name,value){this.attrs[name]=value;}
 addEventListener(name,fn){this.listeners[name]=fn;}
 querySelector(){return this.children.find(el=>el.className.includes("card"))||null;}
 getBoundingClientRect(){return {left:0,top:0,width:70,height:115};}
 animate(frames,options){
  this.animationLog.push({frames,options,src:this.src});
  return {finished:Promise.resolve(),cancel(){}};
 }
 remove(){}
}
function makeUi({motion=false}={}){
 const animations=[];
 const ids=[...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
 const elements=new Map(ids.map(id=>[id,new FakeElement(animations)]));
 const $=id=>elements.get(id);
 const story=[];
 const narration=$("actionNarration");
 let narrationValue="";
 Object.defineProperty(narration,"textContent",{
  get:()=>narrationValue,
  set:value=>{narrationValue=String(value);if(value)story.push(String(value));}
 });
 const document={
  documentElement:new FakeElement(animations),body:new FakeElement(animations),
  getElementById:$,createElement:()=>new FakeElement(animations)
 };
 $("lang").value="en";$("rounds").value="3";
 let seed=19;
 const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 const localStart=()=>startRound({dealer:0,rng});
 const args=["document","window","setTimeout","cardById","startRound","chooseInitialDealer","playCard",
  "chooseTarget","drawNextCard","decide","scoreCards","capturePreview",
  "matchingFieldCards","yakuProgress","publicYakuOutlook"];
 const create=new Function(...args,script+
  "; return {state:()=>({game,selected,selectedTarget,locked}),render};");
 const ui=create(document,{innerWidth:390,matchMedia:()=>({matches:!motion})},
  callback=>queueMicrotask(callback),
  cardById,localStart,()=>({dealer:0,monthBySeat:[1,12]}),playCard,chooseTarget,drawNextCard,decide,scoreCards,
  capturePreview,matchingFieldCards,yakuProgress,publicYakuOutlook);
 return {ui,$,story,animations};
}
async function flush(){
 for(let i=0;i<2000;i++)await Promise.resolve();
}
test("Hanafuda hand selection, replacement and cancellation never commit a game event",async()=>{
 const {ui,$}=makeUi();
 $("start").listeners.click();
 assert.equal($("roundIntro").hidden,false,"round intro must be visible");
 assert.ok($("roundIntroTitle").textContent.includes("Round"));
 $("beginRound").listeners.click();await flush();
 const s=ui.state().game;
 assert.equal(s.active,0);assert.equal(s.phase,"turn");
 const before=JSON.stringify(s);
 const hand=$("yourHand").children;
 assert.equal(hand.length,8);
 hand[0].listeners.click();assert.equal(ui.state().selected,hand[0].dataset.cardId);
 assert.equal(JSON.stringify(s),before);
 $("cancel").listeners.click();assert.equal(ui.state().selected,null);
 assert.equal(JSON.stringify(s),before);
 $("yourHand").children[0].listeners.click();
 $("yourHand").children[1].listeners.click();
 assert.equal(ui.state().selected,$("yourHand").children[1].dataset.cardId);
 assert.equal(JSON.stringify(s),before);
});
test("2 candidate highlights require explicit field target; confirmed capture draws exactly once",async()=>{
 const {ui,$}=makeUi();
 $("start").listeners.click();await flush();
 const s=ui.state().game;
 // Fixture swaps only publicly staged card arrays. Nothing is sent to peers.
 s.active=0;s.phase="turn";
 s.field=["7-1","7-2","8-1"];s.hands[0]=["7-3","8-4"];
 ui.render();
 const previousDeck=s.deck.length,previousMoves=s.log.length;
 $("yourHand").children.find(el=>el.dataset.cardId==="7-3").listeners.click();
 assert.equal($("confirm").disabled,true);
 assert.equal($("field").children.filter(el=>el.className.includes("target")).length,2);
 const baseline=JSON.stringify(s);
 $("field").children.find(el=>el.dataset.cardId==="7-2").listeners.click();
 assert.equal($("confirm").disabled,false);
 assert.equal(JSON.stringify(s),baseline);
 $("confirm").listeners.click();await flush();
 assert.ok(s.captured[0].includes("7-3"));
 assert.ok(s.captured[0].includes("7-2"));
 assert.ok(!s.captured[0].includes("7-1"));
 assert.ok(s.log.length>previousMoves);
 assert.equal(s.deck.length,previousDeck-2); // confirmed human draw + scripted opponent draw
 assert.equal(ui.state().selected,null);
 assert.equal(ui.state().locked,false);
});
test("Bilingual guide and selection descriptions are translated",async()=>{
 const {ui,$}=makeUi();
 $("start").listeners.click();await flush();
 $("guideToggle").listeners.click();
 assert.equal($("guidePanel").hidden,false);
 assert.ok($("guideExamples").children.length>=8);
 $("lang").value="ja";$("lang").listeners.change();
 assert.equal($("confirm").textContent,"この札を出す");
 assert.equal($("cancel").textContent,"キャンセル・選び直す");
 assert.equal($("guideTitle").textContent,"役の集め方");
 assert.equal($("guidePanel").hidden,false);
});

test("Hand capture finishes BEFORE the drawn card flips, with a clear outcome",async()=>{
 const {ui,$,story}=makeUi();
 $("start").listeners.click();await flush();
 const s=ui.state().game;
 s.active=0;s.phase="turn";
 // No matching hand card; draw has exactly one matching September field card.
 s.hands[0]=["3-3"];s.field=["9-2","5-1"];
 s.deck=["9-1",...s.deck.filter(id=>id!=="9-1")];
 ui.render();
 $("yourHand").children[0].listeners.click();
 $("confirm").listeners.click();await flush();
 const firstPlayed=story.findIndex(line=>line.includes("plays")&&line.includes("from hand"));
 const place=story.findIndex(line=>line.includes("No matching month"));
 const deck=story.findIndex(line=>line.includes("flip one card"));
 const reveal=story.findIndex(line=>line.includes("Draw revealed"));
 const capture=story.findIndex(line=>line.includes("Captured 2 cards"));
 assert.ok(firstPlayed>=0&&place>firstPlayed&&deck>place&&reveal>deck,
  "hand → field → deck → reveal must be visually distinct: "+story.join(" | "));
 assert.ok(capture>reveal,"the flipped card capture must be stated after the reveal");
 assert.ok(s.captured[0].includes("9-1"));
 assert.ok(s.captured[0].includes("9-2"));
 assert.equal($("drawReveal").hidden,true);
});
test("A drawn card with two matches stays face-up until a legal field card is chosen",async()=>{
 const {ui,$,story}=makeUi();
 $("start").listeners.click();await flush();
 const s=ui.state().game;
 s.active=0;s.phase="turn";
 s.hands[0]=["3-3"];
 s.field=["7-1","7-2","8-1"];
 s.deck=["7-3",...s.deck.filter(id=>id!=="7-3")];
 ui.render();
 $("yourHand").children[0].listeners.click();
 $("confirm").listeners.click();await flush();
 assert.equal(s.phase,"choose");
 assert.equal(s.pending.step,"draw");
 assert.equal($("drawReveal").hidden,false);
 assert.equal($("drawRevealCard").src,"cards/7-3.svg");
 assert.equal($("drawStep").className,"timeline-step active");
 assert.equal($("field").children.filter(el=>el.className.includes("target")).length,2);
 assert.ok(story.some(line=>line.includes("Two matches")));
 const first=$("field").children.find(el=>el.dataset.cardId==="7-2");
 assert.ok(first?.listeners.click);
 first.listeners.click();await flush();
 assert.ok(s.captured[0].includes("7-3"));
 assert.ok(s.captured[0].includes("7-2"));
 assert.ok(!s.captured[0].includes("7-1"));
 assert.equal($("drawReveal").hidden,true);
 assert.ok(story.some(line=>line.includes("Captured 2 cards")));
});

test("Actual animated path moves physical pairs and flips the drawn card",async()=>{
 const {ui,$,animations,story}=makeUi({motion:true});
 $("start").listeners.click();await flush();
 const s=ui.state().game;
 s.active=0;s.phase="turn";s.hands[0]=["3-3"];
 s.field=["9-2","5-1"];
 s.deck=["9-1",...s.deck.filter(id=>id!=="9-1")];
 ui.render();
 $("yourHand").children[0].listeners.click();
 $("confirm").listeners.click();await flush();
 assert.equal(ui.state().locked,false);
 assert.ok(s.captured[0].includes("9-1")&&s.captured[0].includes("9-2"));
 assert.ok(animations.some(a=>a.options.duration===150),"deck flip front half must animate");
 assert.ok(animations.some(a=>a.options.duration===170),"deck flip back half must animate");
 assert.ok(animations.filter(a=>a.options.duration===340).length>=4,
  "hand, deck, field and capture movement must each animate");
 const played=story.findIndex(s=>s.includes("plays")&&s.includes("from hand"));
 const drawn=story.findIndex(s=>s.includes("Draw revealed"));
 assert.ok(played>=0&&drawn>played);
});

test("Opening round is visible BEFORE opponent moves and subsequent rounds get their own intro",async()=>{
 const {ui,$}=makeUi();
 $("start").listeners.click();
 assert.equal($("roundIntro").hidden,false);
 assert.ok($("roundIntroParent").textContent.includes("Dealer"));
 assert.ok($("roundIntroNote").textContent.includes("month"));
 assert.equal($("beginRound").textContent,"Deal & start");
 assert.equal(ui.state().game.deck.length,24,"No draw before pressing Deal & start");
 $("beginRound").listeners.click();await flush();
 assert.equal($("roundIntro").hidden,true);
 // Force a completed local round only to test visible next-round transition.
 const s=ui.state().game;
 s.phase="ended";s.winner=0;s.points=5;s.endedReason="stop";
 ui.render();
 assert.equal($("result").hidden,false);
 assert.ok($("resultReason").textContent.includes("Stop"));
 $("next").listeners.click();await flush();
 assert.equal($("roundIntro").hidden,false);
 assert.equal($("roundIntroTitle").textContent,"Round 2 of 3");
});
test("A completed yaku has a visible announcement then a Stop/Koi modal",async()=>{
 const {ui,$}=makeUi();
 const flashed=[];
 Object.defineProperty($("yakuFlashTitle"),"textContent",{
  get:()=>flashed.at(-1)||"",
  set:v=>flashed.push(String(v))
 });
 $("start").listeners.click();$("beginRound").listeners.click();await flush();
 const s=ui.state().game;
 s.active=0;s.phase="turn";s.hands[0]=["1-1"];
 s.field=["1-2"];s.captured[0]=["3-1","8-1"];
 s.deck=["7-2",...s.deck.filter(id=>id!=="7-2")];
 ui.render();
 $("yourHand").children[0].listeners.click();
 $("confirm").listeners.click();await flush();
 assert.equal(s.phase,"decision");
 assert.ok(flashed.some(v=>v.includes("Three Bright")));
 assert.equal($("decision").hidden,false);
 assert.ok($("decisionSummary").textContent.includes("5"));
 $("stop").listeners.click();await flush();
 assert.equal($("result").hidden,false);
 assert.ok($("resultReason").textContent.includes("Stop"));
 assert.equal(s.endedReason,"stop");
});
test("Six-point dealt opening is explicitly explained, never silently skipped",async()=>{
 const {ui,$}=makeUi();
 $("start").listeners.click();
 const s=ui.state().game;
 s.phase="ended";s.endedReason="initial-bonus";
 s.initialBonus={winner:0,kind:"teshi"};s.winner=0;s.points=6;
 ui.render();
 assert.ok($("roundIntroNote").textContent.includes("Teshi"));
 $("beginRound").listeners.click();await flush();
 assert.equal($("result").hidden,false);
 assert.ok($("resultReason").textContent.includes("6 points"));
});

test("Yaku formed by hand capture announces BEFORE mandatory deck reveal",async()=>{
 const {ui,$,story}=makeUi();
 const notice=$("yakuFlashTitle");
 let label="";
 Object.defineProperty(notice,"textContent",{
  get:()=>label,
  set:v=>{label=String(v);story.push("ROLE: "+label);}
 });
 $("start").listeners.click();$("beginRound").listeners.click();await flush();
 const s=ui.state().game;
 s.active=0;s.phase="turn";
 s.captured[0]=["3-1","8-1"];
 s.field=["1-2","4-3"];
 s.hands[0]=["1-1"];
 s.deck=["7-2",...s.deck.filter(id=>id!=="7-2")];
 ui.render();
 $("yourHand").children[0].listeners.click();
 $("confirm").listeners.click();await flush();
 const roleAt=story.findIndex(v=>v.includes("ROLE:")&&v.includes("Three Bright"));
 const deckAt=story.findIndex(v=>v.includes("flip one card"));
 assert.ok(roleAt>=0,"Sanko should visibly announce after the hand capture");
 assert.ok(deckAt>roleAt,"The yaku must be visible before the compulsory draw");
 assert.equal(s.phase,"decision","Stop/Koi offered only after the deck draw");
 assert.equal($("decision").hidden,false);
});


test("Japanese yaku identity comes first even in English, with romanization and meaning",async()=>{
 const {ui,$}=makeUi();
 $("start").listeners.click();$("beginRound").listeners.click();await flush();
 const s=ui.state().game;
 s.captured[0]=["7-1","10-1","6-1"];
 ui.render();
 assert.ok($("yourYaku").textContent.includes("猪鹿蝶"));
 $("guideToggle").listeners.click();
 const guideText=$("guideExamples").children.find(
  x=>x.children[0]?.textContent.includes("猪鹿蝶")).children[0].textContent;
 assert.equal(guideText,"猪鹿蝶 (Inoshikachō — Boar, Deer & Butterfly)");
 $("lang").value="ja";$("lang").listeners.change();
 assert.equal($("yourYaku").textContent.includes("猪鹿蝶"),true);
 assert.equal($("guideExamples").children.find(
  x=>x.children[0]?.textContent==="猪鹿蝶").children[0].textContent,"猪鹿蝶");
});
test("Hint mode distinguishes opponent's exposed captures and blocked yaku from secret deck",async()=>{
 const {ui,$}=makeUi();
 $("start").listeners.click();$("beginRound").listeners.click();await flush();
 const s=ui.state().game;
 s.captured[1]=["7-1","10-1"];
 s.captured[0]=["6-1"];
 ui.render();
 $("hintsToggle").listeners.click();
 assert.equal($("hintsToggle").textContent,"Hints: On");
 assert.equal($("hintsToggle").attrs["aria-pressed"],"true");
 $("guideToggle").listeners.click();
 assert.ok($("outlookDisclaimer").textContent.includes("hidden hand"));
 const opponent=$("oppOutlook").children.find(x=>x.children[0]?.textContent.includes("猪鹿蝶"));
 assert.ok(opponent);
 assert.ok(opponent.children[1].textContent.includes("Blocked"));
 assert.ok(opponent.className.includes("outlook-blocked"));
 const before=JSON.stringify(s);
 $("hintsToggle").listeners.click();
 assert.equal(JSON.stringify(s),before,"Toggling hints must not change game state");
 assert.equal($("hintsToggle").textContent,"Hints: Off");
});
test("Captured card tap or hand long-press opens inspection without selecting or playing",async()=>{
 const {ui,$}=makeUi();
 $("start").listeners.click();$("beginRound").listeners.click();await flush();
 const s=ui.state().game;
 s.captured[0]=["7-1"];
 s.captured[1]=["6-1"];
 ui.render();
 const before=JSON.stringify(s);
 const captured=$("opponentCaptured").children[0];
 captured.listeners.click();
 assert.equal($("cardInspect").hidden,false);
 assert.equal($("cardInspectImage").src,"cards/6-1.svg");
 assert.ok($("cardInspectYaku").children.some(x=>x.textContent.includes("猪鹿蝶")));
 assert.equal(JSON.stringify(s),before);
 $("cardInspectClose").listeners.click();
 assert.equal($("cardInspect").hidden,true);
 const hand=$("yourHand").children[0],id=hand.dataset.cardId;
 hand.listeners.pointerdown({pointerType:"touch"});
 await flush();
 assert.equal($("cardInspect").hidden,false);
 assert.equal($("cardInspectImage").src,"cards/"+id+".svg");
 assert.equal(ui.state().selected,null);
 assert.equal(JSON.stringify(s),before);
 $("cardInspectClose").listeners.click();
});
test("Inspect never exposes the opponent's actual hidden hand",async()=>{
 const {ui,$}=makeUi();
 $("start").listeners.click();$("beginRound").listeners.click();await flush();
 assert.ok($("opponentHand").children.every(e=>e.dataset.cardId===undefined));
 assert.ok($("opponentHand").children.every(e=>!e.listeners.click));
});
