import test from "node:test";
import assert from "node:assert/strict";
import {ChatViewModel,QUICK_REPLIES,cannedTranslation} from "../apps/poker/chat-view.js";
test("drawer starts hidden; incoming text updates unread and preview",()=>{
 const c=new ChatViewModel();
 assert.equal(c.visible(),false);
 c.add({id:"1",author:"Seat 2",text:"nice hand!",at:10});
 assert.equal(c.unread,1);assert.deepEqual(c.lastPreview,{author:"Seat 2",text:"nice hand!"});
 c.add({id:"2",author:"You",text:"thanks",own:true,at:11});assert.equal(c.unread,1);
 c.add({id:"1",author:"Seat 2",text:"duplicate",at:12});assert.equal(c.messages.length,2);assert.equal(c.unread,1);
 c.setOpen(true);assert.equal(c.unread,0);assert.equal(c.visible(),true);
 c.add({id:"3",author:"Seat 3",text:"gg",at:13});assert.equal(c.unread,0);
 c.setOpen(false);
 c.add({id:"4",author:"Seat 4",text:"brb 1 min",at:14});assert.equal(c.unread,1);
});
test("inline mode always readable and switching modes clears unread when visible",()=>{
 const c=new ChatViewModel();
 c.add({id:"a",author:"Opponent",text:"gl hf"});
 assert.equal(c.unread,1);
 c.setMode("inline");assert.equal(c.visible(),true);assert.equal(c.unread,0);
 c.add({id:"b",author:"Opponent",text:"gg"});assert.equal(c.unread,0);
 c.setMode("drawer");assert.equal(c.visible(),false);
 assert.equal(c.unread,0);
 assert.throws(()=>c.setMode("sidepanel"),/Unknown chat mode/);
});
test("only canned phrases are translated; original message preserved",()=>{
 const c=new ChatViewModel({mode:"inline"});
 c.add({id:"a",author:"Seat 3",text:"gl hf"});
 c.add({id:"b",author:"Seat 4",text:"a private original sentence"});
 c.setTranslation(true);
 const output=c.displayed("ja");
 assert.equal(output[0].text,"gl hf");assert.equal(output[0].translated,"頑張って、楽しみましょう！");
 assert.equal(output[1].translated,null);
 assert.equal(cannedTranslation("nice hand!","ja"),"いいハンドですね！");
 assert.equal(cannedTranslation("random unknown message","ja"),null);
 assert.equal(QUICK_REPLIES.includes("brb 1 min"),true);
});
test("trim, duplicate drop, bounded history, input validation",()=>{
 const c=new ChatViewModel({mode:"inline",limit:2});
 c.add({id:"1",author:"P",text:"   hello   "});assert.equal(c.messages[0].text,"hello");
 c.add({id:"2",author:"P",text:"next"});
 c.add({id:"3",author:"P",text:"last"});
 assert.equal(c.messages.length,2);assert.equal(c.messages[0].id,"2");
 assert.throws(()=>c.add({id:"4",author:"P",text:"x".repeat(501)}),/Invalid/);
 assert.throws(()=>c.add({id:"5",author:"P",text:" "}),/Invalid/);
 assert.throws(()=>new ChatViewModel({mode:"sidepanel"}),/Unknown/);
});
