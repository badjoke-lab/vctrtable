import test from "node:test";
import assert from "node:assert/strict";
import {deriveSharedTable,validPublicEvent,validTableEvent}
 from "../apps/poker/table-lobby.js";

let n=0;
const mk=(kind,by,tableId="roomAlpha",extra={})=>{
 const v=["table-create","seat-join","seat-leave","seat-ready","table-close"].includes(kind)?2:1;
 return {v,app:"poker",kind,id:"event"+String(++n).padStart(6,"0"),at:123,by,tableId,...extra};
};
const create=()=>mk("table-create","host","roomAlpha",{name:"Host",maxPlayers:6});
const join=by=>mk("seat-join",by,"roomAlpha",{name:by});
const settings={chips:1000,sb:5,bb:10,timer:30,rebuy:true};
const rules=(by,seats=["host","alice"])=>mk("rules",by,"roomAlpha",{settings,seats});
const vote=(by,target)=>mk("vote",by,"roomAlpha",{target});
const ready=(by,flag=true)=>mk("seat-ready",by,"roomAlpha",{ready:flag});
const pause=(by,action="pause",seats=["host","alice"])=>mk("pause",by,"roomAlpha",{action,seats});
const pauseVote=(by,target)=>mk("pause-vote",by,"roomAlpha",{target});
const chat=(by,text)=>mk("chat",by,"roomAlpha",{text});
const run=events=>deriveSharedTable(events.map((event,i)=>({event,serial:(i+1)*10})));
test("public rules proposal requires active member, full roster, exact settings",()=>{
 const outsider=rules("mallory"),badRoster=rules("host",["host","mallory"]);
 let state=run([create(),join("alice"),outsider,badRoster]);
 assert.equal(state.proposal,null);
 const proposal=rules("alice");
 state=run([create(),join("alice"),proposal]);
 assert.equal(state.proposal.event.id,proposal.id);
 assert.equal(state.proposal.approvals.size,0);
});
test("stale votes, impersonated absent members and wrong targets cannot approve",()=>{
 const p=rules("host");
 const oldVote=vote("alice",p.id),absentVote=vote("stranger",p.id),wrong=vote("host","wrong-target");
 const state=run([create(),join("alice"),oldVote,p,absentVote,wrong,vote("alice",p.id)]);
 assert.deepEqual([...state.proposal.approvals],["alice"]);
});
test("leave and rejoin invalidates APPROVED rules and earlier readiness, even same actor id",()=>{
 const p=rules("host");
 const items=[create(),join("alice"),ready("host"),ready("alice"),p,
  vote("alice",p.id),vote("host",p.id)];
 const before=run(items);
 assert.equal(before.proposal.approvals.size,2);
 assert.equal(before.ready.size,2);
 const after=run([...items,mk("seat-leave","alice"),join("alice"),vote("alice",p.id)]);
 assert.equal(after.seats.size,2);
 assert.equal(after.ready.size,0);
 assert.equal(after.proposal,null);
});
test("proposal replacement revokes prior votes and requires fresh unanimous approval",()=>{
 const p1=rules("host"),p2=rules("alice");
 const state=run([create(),join("alice"),p1,vote("host",p1.id),vote("alice",p1.id),p2,vote("alice",p1.id)]);
 assert.equal(state.proposal.event.id,p2.id);
 assert.equal(state.proposal.approvals.size,0);
});
test("only valid present member can initiate pause; requester is counted as approved",()=>{
 const before=run([create(),join("alice"),pause("mallory")]);
 assert.equal(before.pauseRequest,null);
 const request=pause("host");
 let state=run([create(),join("alice"),request]);
 assert.equal(state.paused,false);
 assert.deepEqual([...state.pauseRequest.approvals],["host"]);
 state=run([create(),join("alice"),request,pauseVote("mallory",request.id),
  pauseVote("alice","wrong-target")]);
 assert.equal(state.paused,false);
 state=run([create(),join("alice"),request,pauseVote("alice",request.id)]);
 assert.equal(state.paused,true);
 assert.equal(state.pauseRequest,null);
});
test("resume also requires unanimous votes and ignores duplicate or unsolicited commands",()=>{
 const first=pause("host"),second=pause("host","resume");
 const state=run([create(),join("alice"),
  pause("alice","resume"), // reject resume before approved pause
  first,pauseVote("alice",first.id),second,
  pauseVote("alice",second.id),pauseVote("alice",second.id),
  pauseVote("host",first.id)]);
 assert.equal(state.paused,false);
 assert.equal(state.pauseRequest,null);
});
test("membership change invalidates pending pause, confirmed pause and approvals",()=>{
 const request=pause("host");
 const items=[create(),join("alice"),request];
 const changed=run([...items,mk("seat-leave","alice"),join("alice"),pauseVote("alice",request.id)]);
 assert.equal(changed.paused,false);
 assert.equal(changed.pauseRequest,null);
 const approved=run([...items,pauseVote("alice",request.id)]);
 assert.equal(approved.paused,true);
 const reset=run([...items,pauseVote("alice",request.id),mk("seat-leave","alice")]);
 assert.equal(reset.paused,false);
});
test("chat from unseated actor or after host close is ignored, other room ignored",()=>{
 const a=chat("alice","hello"),b=chat("guest","forged"),c=chat("host","after close");
 const state=run([create(),join("alice"),a,b,mk("table-close","host"),c]);
 assert.equal(state.table,null);
 assert.equal(state.messages.length,0);
});
test("reject unknown secret-bearing keys, including nested dealer settings",()=>{
 const a=create();
 assert.equal(validTableEvent({...a,ownHole:["AH","AS"]}),false);
 const p=rules("host");
 assert.equal(validPublicEvent({...p,private:{deck:["2D"]}}),false);
 assert.equal(validPublicEvent({...p,settings:{...settings,deck:["KH"]}}),false);
 assert.equal(validPublicEvent({...chat("alice","Hi"),nsec:"secret"}),false);
});
test("duplicate event IDs never count twice and host serial wins over client time",()=>{
 const p=rules("host");
 const list=[create(),join("alice"),p,vote("alice",p.id)];
 let state=run([...list,list[3],vote("host",p.id)]);
 assert.equal(state.proposal.approvals.size,2);
 const reversed=[...list].reverse().map((event,i)=>({event,serial:(4-i)*10}));
 state=deriveSharedTable(reversed);
 assert.equal(state.proposal.event.id,p.id);
 assert.equal(state.proposal.approvals.size,1);
});
