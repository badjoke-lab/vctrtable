/**
 * Local manual Vector DM handoff status. NO network calls or storage.
 * "Prepared" means JSON exists, NOT sent. "Awaiting" means the user
 * explicitly indicated they sent it; nothing here verifies relay delivery.
 */
import {parseSeatSnapshot} from "./dm-seat.js";

const intTime=n=>Number.isSafeInteger(n)&&n>=0;
const err=code=>{const e=new Error(code);e.code=code;throw e;};
export const DELAY_MS=15_000;
export class SeatSyncTracker {
 constructor({roomId,playerId,delayMs=DELAY_MS}={}){
  if(typeof roomId!=="string"||!roomId||typeof playerId!=="string"||!playerId.startsWith("npub1")||!Number.isSafeInteger(delayMs)||delayMs<1)err("INVALID_SEAT_CONTEXT");
  this.roomId=roomId;this.playerId=playerId;this.delayMs=delayMs;
  this.snapshot=null;this.pending=null;this.needsSync=false;this.lastImportedAt=null;
  this.failure=null;
 }
 status(now=Date.now()){
  if(!intTime(now))err("INVALID_LOCAL_TIME");
  if(this.needsSync)return "needs-sync";
  if(this.pending){
   if(this.pending.sentAt===null)return "prepared";
   return now-this.pending.sentAt>=this.delayMs?"delayed":"awaiting";
  }
  return this.snapshot?"current":"empty";
 }
 /** Outgoing text is a draft. Only private DM sending by the user counts. */
 prepare(raw,{kind="action",now=Date.now()}={}){
  if(typeof raw!=="string"||!raw||raw.length>8192||!["action","sync"].includes(kind)||!intTime(now))err("INVALID_OUTBOUND");
  // A sync supersedes the UI's outstanding draft, but NEVER cancels a DM
  // that may have already been transmitted to the dealer.
  if(kind==="action"&&(this.pending||this.needsSync))err("SYNC_REQUIRED_BEFORE_ACTION");
  const wire=JSON.parse(raw);
  if(kind==="sync"){
   if(Object.keys(wire).join(",")!=="kind"||wire.kind!=="sync")err("INVALID_SYNC_REQUEST");
  }else if(wire.roomId!==this.roomId||wire.protocol!==1||!Number.isSafeInteger(wire.expectedRevision)||
       wire.expectedRevision!==(this.snapshot?.revision??0)||typeof wire.requestId!=="string")err("INVALID_COMMAND_DRAFT");
  this.pending={raw,kind,preparedAt:now,sentAt:null,baseRevision:this.snapshot?.revision??-1};
  this.needsSync=false;this.failure=null;
  return raw;
 }
 markSent(now=Date.now()){
  if(!this.pending||!intTime(now))err("NO_PREPARED_DM");
  // Repeated button presses must not reset the timeout.
  if(this.pending.sentAt===null)this.pending.sentAt=now;
  return this.status(now);
 }
 retryText(){
  if(!this.pending)err("NO_PREPARED_DM");
  // Idempotent action request ID retained byte-for-byte. Not a new command.
  return this.pending.raw;
 }
 importReply(raw,{now=Date.now()}={}){
  if(!intTime(now))err("INVALID_LOCAL_TIME");
  if(typeof raw==="string"&&raw.startsWith("poker error: ")){
   const code=raw.slice("poker error: ".length).trim();
   if(!/^[A-Z0-9_]{1,100}$/.test(code))err("INVALID_BOT_ERROR");
   this.needsSync=true;this.failure=code;this.pending=null;
   return {kind:"error",code};
  }
  const candidate=parseSeatSnapshot(raw,{
   roomId:this.roomId,playerId:this.playerId,
   minimumRevision:this.snapshot?.revision??-1
  });
  if(this.snapshot&&candidate.revision===this.snapshot.revision&&
     JSON.stringify(candidate)!==JSON.stringify(this.snapshot)){
   err("CONFLICTING_SAME_REVISION");
  }
  const changed=!this.snapshot||candidate.revision>this.snapshot.revision;
  this.snapshot=candidate;
  this.lastImportedAt=now;
  this.needsSync=false;this.failure=null;
  // Inbound state is NOT a signed action receipt. Importing a newer state
  // resolves the stale screen but doesn't attest which command was applied.
  if(changed||this.pending?.kind==="sync")this.pending=null;
  return {kind:"snapshot",changed,revision:candidate.revision};
 }
 requireResync(code="SYNC_REQUIRED"){
  this.pending=null;this.needsSync=true;this.failure=code;
 }
}
