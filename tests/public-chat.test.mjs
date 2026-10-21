import test from "node:test";
import assert from "node:assert/strict";
import {createPublicChatTransport,parsePublicChatUpdate,PUBLIC_CHAT_KIND} from "../apps/poker/public-chat.js";
import {ChatViewModel} from "../apps/poker/chat-view.js";
const rng={getRandomValues(a){a.fill(37);return a;}};
function fakeWebxdc(){
 const sends=[];let listener=null;
 const api={
  selfAddr:"local-test-identity",selfName:"Alice",
  setUpdateListener(fn,serial){listener=fn;return 0;},
  sendUpdate(update,summary){sends.push({update,summary});return Promise.resolve();}
 };
 return {api,sends,inject(update){if(!listener)throw Error("listener missing");listener(update);}};
}
test("public Vector chat transmits text only, with a strict allowlist and secure random ID",async()=>{
 const f=fakeWebxdc(),got=[];
 const transport=createPublicChatTransport({api:f.api,receive:m=>got.push(m),random:rng,clock:()=>120000});
 assert.equal(transport.available,true);
 assert.equal(transport.subscribe(),true);
 assert.equal(transport.subscribe(),false);
 await transport.send(" Hello everyone ");
 assert.equal(f.sends.length,1);
 const {update,summary}=f.sends[0];
 assert.equal(summary,"Poker chat message");
 const p=update.payload;
 assert.deepEqual(Object.keys(p).sort(),["app","at","id","kind","nickname","text","v"].sort());
 assert.deepEqual(p,{app:"poker",kind:PUBLIC_CHAT_KIND,v:1,id:"25".repeat(16),text:"Hello everyone",nickname:"Alice",at:120000});
 const json=JSON.stringify(update);
 for(const forbidden of ["hole","deck","journal","private","nsec","stack","bet"]){
  assert.equal(json.includes('"'+forbidden+'"'),false);
 }
 f.inject({payload:p,sender:"local-test-identity",serial:3});
 assert.equal(got.length,1);
 assert.equal(got[0].own,true);
 assert.equal(got[0].sender,"local-test-identity");
});
test("receive rejects other apps, secret-shaped payloads, malformed updates and oversized text",()=>{
 const f=fakeWebxdc(),received=[];
 const transport=createPublicChatTransport({api:f.api,receive:m=>received.push(m),random:rng,clock:()=>1});
 transport.subscribe();
 const p={app:"poker",kind:PUBLIC_CHAT_KIND,v:1,id:"ab".repeat(16),text:"hi",nickname:"Bob",at:3};
 for(const invalid of [
  {...p,app:"other"},
  {...p,deck:["AS"]},
  {...p,ownHole:["AH"]},
  {...p,nickname:"x".repeat(61)},
  {...p,text:"x".repeat(501)},
  {...p,text:"hello\u0000bad"},
  {...p,id:"invalid"},
  {...p,at:-1},
  {...p,kind:"poker-action"},
 ]) f.inject({payload:invalid,sender:"remote-player",serial:15});
 assert.equal(received.length,0);
 f.inject({payload:p,sender:"remote-player",serial:16});
 assert.equal(received.length,1);
 assert.equal(received[0].own,false);
 assert.equal(received[0].nickname,"Bob");
 assert.equal(received[0].serial,16);
 assert.equal(parsePublicChatUpdate({payload:null}),null);
});
test("public chat is not available without WebXDC; rejects empty, control and huge outbound messages",async()=>{
 const t=createPublicChatTransport({api:{},receive:()=>{}});
 assert.equal(t.available,false);
 assert.equal(t.subscribe(),false);
 await assert.rejects(t.send("hi"),/unavailable/);
 const f=fakeWebxdc();
 const chat=createPublicChatTransport({api:f.api,receive:()=>{},random:rng,clock:()=>4});
 await assert.rejects(chat.send("   "),/Invalid/);
 await assert.rejects(chat.send("x".repeat(501)),/Invalid/);
 await assert.rejects(chat.send("line\u0001invalid"),/Invalid/);
 assert.equal(f.sends.length,0);
});
test("SDK send failure can be retried without silently accepting an update",async()=>{
 let listener,tries=0;
 const api={
  selfAddr:"me",selfName:"Me",
  setUpdateListener(fn){listener=fn;},
  async sendUpdate(){tries++;if(tries===1)throw Error("relay offline");}
 };
 const seen=[],c=createPublicChatTransport({api,receive:m=>seen.push(m),random:rng,clock:()=>3});
 c.subscribe();
 await assert.rejects(c.send("first"),/relay offline/);
 assert.equal(tries,1);
 await c.send("second");
 assert.equal(tries,2);
});
test("replayed old messages remain visible but never add notifications",()=>{
 const c=new ChatViewModel();
 assert.equal(c.visible(),false);
 c.add({id:"old",author:"P",text:"old message",at:1,silent:true});
 assert.equal(c.messages.length,1);
 assert.equal(c.unread,0);
 c.add({id:"new",author:"P",text:"new message",at:2});
 assert.equal(c.unread,1);
 assert.deepEqual(c.lastPreview,{author:"P",text:"new message"});
});
