/**
 * Volatile seat-action outbox for the host-trusted WebXDC experiment.
 *
 * Retrying MUST reuse the exact signed packet (nonce, revision and signature).
 * Never create a second command for an unresolved action, and never send
 * private cards or Vector credentials through this transport.
 */
export class SeatActionOutbox {
 constructor(){this.reset();}
 reset(){this.packet=null;this.sentAt=null;this.attempts=0;this.failure=null;}
 prepare(packet){
  if(this.packet)throw Error("An action is already awaiting a host state");
  if(!packet||packet.kind!=="action"||packet.app!=="vctrtable-pvp"||
    packet.v!==1||typeof packet.id!=="string"||!packet.id||
    typeof packet.sig!=="string"||!packet.sig||
    typeof packet.by!=="string"||!packet.by||
    typeof packet.tableId!=="string"||!packet.tableId||
    !Number.isSafeInteger(packet.revision)||packet.revision<1)
   throw Error("Not a signed poker action");
  this.packet=structuredClone(packet);
  this.attempts=0;this.sentAt=null;this.failure=null;
  return this.packet;
 }
 retryPacket(){if(!this.packet)throw Error("No pending action");return structuredClone(this.packet);}
 acknowledge(tableId,revision){
  if(!this.packet||this.packet.tableId!==tableId||!Number.isSafeInteger(revision)||
    revision<=this.packet.revision)return false;
  this.reset();return true;
 }
 canRetry({tableId,revision,playerId,turnId,paused=false}={}){
  const p=this.packet;
  return Boolean(p&&!paused&&tableId===p.tableId&&revision===p.revision&&
    playerId===p.by&&turnId===p.by);
 }
 async transmit(send,now=Date.now()){
  if(typeof send!=="function"||!this.packet||!Number.isSafeInteger(now)||now<0)
   throw Error("No pending signed action to transmit");
  this.attempts++;
  this.sentAt=now;
  try{
   await send(this.retryPacket());
   this.failure=null;
   return true; // Accepted by local WebXDC API, NOT confirmed by remote host.
  }catch(error){
   this.failure=String(error?.message||error);
   throw error;
  }
 }
}
