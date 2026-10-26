import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {cardById,startRound,playCard,chooseTarget,drawNextCard,decide,scoreCards} from "../packages/hanafuda/koikoi.js";
import {matchingFieldCards,capturePreview,yakuProgress} from "../packages/hanafuda/guide.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const html=fs.readFileSync(path.join(root,"apps/hanafuda/index.html"),"utf8");
const script=fs.readFileSync(path.join(root,"apps/hanafuda/main.js"),"utf8")
 .replace(/^import .*?;\s*$/gm,"");
class FakeElement{
 constructor(){
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
}
function makeUi(){
 const ids=[...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]);
 const elements=new Map(ids.map(id=>[id,new FakeElement()]));
 const $=id=>elements.get(id);
 const document={
  documentElement:new FakeElement(),body:new FakeElement(),
  getElementById:$,createElement:()=>new FakeElement()
 };
 $("lang").value="en";$("rounds").value="3";
 let seed=19;
 const rng=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 const localStart=()=>startRound({dealer:0,rng});
 const args=["document","window","setTimeout","cardById","startRound","playCard",
  "chooseTarget","drawNextCard","decide","scoreCards","capturePreview",
  "matchingFieldCards","yakuProgress"];
 const create=new Function(...args,script+
  "; return {state:()=>({game,selected,selectedTarget,locked}),render};");
 const ui=create(document,{matchMedia:()=>({matches:true})},setTimeout,
  cardById,localStart,playCard,chooseTarget,drawNextCard,decide,scoreCards,
  capturePreview,matchingFieldCards,yakuProgress);
 return {ui,$};
}
async function flush(){
 for(let i=0;i<200;i++)await Promise.resolve();
}
test("Hanafuda hand selection, replacement and cancellation never commit a game event",async()=>{
 const {ui,$}=makeUi();
 $("start").listeners.click();await flush();
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
