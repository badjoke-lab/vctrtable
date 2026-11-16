import test from "node:test";
import assert from "node:assert/strict";
import {pvpSetupProgress} from "../apps/poker/pvp-setup-progress.js";

const start={connected:true,hasTable:true,seated:true,seatCount:2,
 readyCount:2,rulesApproved:true,keyCount:2,host:true,gameActive:false};
test("not-connected browsers never appear ready",()=>{
 const p=pvpSetupProgress();
 assert.equal(p.next.id,"transport");
 assert.equal(p.completed,0);
 assert.equal(p.complete,false);
 assert.equal(p.total,8);
});
test("incomplete lobby and key exchange identify actionable blocker",()=>{
 let p=pvpSetupProgress({...start,seatCount:1,readyCount:1,keyCount:1});
 assert.equal(p.next.id,"players");
 p=pvpSetupProgress({...start,seated:false});
 assert.equal(p.next.id,"seat");
 p=pvpSetupProgress({...start,readyCount:1});
 assert.equal(p.next.id,"ready");
 p=pvpSetupProgress({...start,rulesApproved:false});
 assert.equal(p.next.id,"rules");
 p=pvpSetupProgress({...start,keyCount:1});
 assert.equal(p.next.id,"keys");
 assert.equal(p.steps.find(x=>x.id==="keys").progress,"1/2");
});
test("all session keys do not prove Vector account identity",()=>{
 const p=pvpSetupProgress(start);
 assert.equal(p.next.id,"deal");
 assert.equal(p.complete,false);
 assert.ok(p.steps.find(x=>x.id==="keys").name.includes("Session"));
 assert.equal(pvpSetupProgress({...start,host:false}).next.id,"deal");
 assert.match(pvpSetupProgress({...start,host:false}).next.instruction,/only the host/);
 const complete=pvpSetupProgress({...start,gameActive:true});
 assert.equal(complete.complete,true);
 assert.equal(complete.next,null);
});
test("ignore invalid counts and never claim a ready full table",()=>{
 assert.equal(pvpSetupProgress({...start,seatCount:999}).next.id,"players");
 assert.equal(pvpSetupProgress({...start,keyCount:-1}).next.id,"keys");
});
