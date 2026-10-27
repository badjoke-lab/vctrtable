/**
 * Public-only WebXDC device transport diagnostic, never a poker authority.
 * Probe addresses are WebXDC-scoped pseudonyms, NOT verified Vector identities.
 * No game state, cards, credentials, npubs or chat data are needed.
 */
const APP="vctrtable-transport-diagnostic";
const safeId=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{12,64}$/.test(x);
const actor=x=>typeof x==="string"&&x.length>0&&x.length<=300;
const validTime=t=>Number.isSafeInteger(t)&&t>=0&&t<=Number.MAX_SAFE_INTEGER;
const exact=(x,keys)=>Object.keys(x).sort().join(",")===keys.slice().sort().join(",");
export function validProbe(p){
 if(!p||typeof p!=="object"||Array.isArray(p)||p.app!==APP||
    p.v!==1||!safeId(p.id)||!actor(p.by)||!validTime(p.sentAt))return false;
 if(p.kind==="ping")return exact(p,["app","v","kind","id","by","sentAt"]);
 if(p.kind==="ack")return exact(p,["app","v","kind","id","by","sentAt","ref","to"])&&
  safeId(p.ref)&&actor(p.to);
 return false;
}
export function nonce(random=globalThis.crypto){
 if(!random||typeof random.getRandomValues!=="function")throw Error("Secure randomness is required");
 const b=new Uint8Array(16);random.getRandomValues(b);
 return [...b].map(n=>n.toString(16).padStart(2,"0")).join("");
}
export function makePing(by,now=Date.now(),random=globalThis.crypto){
 const p={app:APP,v:1,kind:"ping",id:nonce(random),by,sentAt:now};
 if(!validProbe(p))throw Error("Invalid diagnostic ping");
 return p;
}
export function makeAck(ping,by,now=Date.now(),random=globalThis.crypto){
 if(!validProbe(ping)||ping.kind!=="ping"||ping.by===by)throw Error("Invalid diagnostic peer ping");
 const p={app:APP,v:1,kind:"ack",id:nonce(random),by,to:ping.by,ref:ping.id,sentAt:now};
 if(!validProbe(p))throw Error("Invalid diagnostic acknowledgement");
 return p;
}
export function hostCapabilities(webxdc){
 const ready=Boolean(webxdc&&typeof webxdc.sendUpdate==="function"&&
  typeof webxdc.setUpdateListener==="function"&&actor(webxdc.selfAddr));
 const interval=Number.isSafeInteger(webxdc?.sendUpdateInterval)&&webxdc.sendUpdateInterval>0?
  webxdc.sendUpdateInterval:10000;
 const maxSize=Number.isSafeInteger(webxdc?.sendUpdateMaxSize)&&webxdc.sendUpdateMaxSize>0?
  webxdc.sendUpdateMaxSize:128000;
 return {ready,sendUpdateInterval:interval,sendUpdateMaxSize:maxSize,
  realtimeAdvertised:typeof webxdc?.joinRealtimeChannel==="function"};
}
export class ProbeTracker {
 constructor(me){
  if(!actor(me))throw Error("No WebXDC peer address");
  this.me=me;
  this.seen=new Set();this.own=null;this.peer=null;this.ack=null;this.lastSerial=0;
 }
 begin(ping){
  if(!validProbe(ping)||ping.kind!=="ping"||ping.by!==this.me)throw Error("Invalid own ping");
  this.own=ping;this.ack=null;
 }
 ingest(p,serial,receivedAt=Date.now()){
  if(!validProbe(p)||!Number.isSafeInteger(serial)||serial<1||
     !validTime(receivedAt)||this.seen.has(p.id))return null;
  this.seen.add(p.id);this.lastSerial=Math.max(serial,this.lastSerial);
  if(p.kind==="ping"){
   if(p.by===this.me)return {type:"own-echo"};
   this.peer=p;
   return {type:"peer-ping",peer:p.by,ref:p.id};
  }
  if(p.to!==this.me||!this.own||p.ref!==this.own.id||p.by===this.me)return null;
  this.ack={by:p.by,ref:p.ref,roundTripMs:Math.max(0,receivedAt-this.own.sentAt)};
  return {type:"ack",...this.ack};
 }
}
