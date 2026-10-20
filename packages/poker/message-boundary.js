/**
 * Transport adapter boundary, NOT an actual Vector SDK connection.
 *
 * Verified actor identity must come from the authenticated SDK message
 * context, never from an untrusted command payload. The private envelopes
 * below are plain internal objects awaiting a recipient-encrypted channel.
 */
import {RoomError} from "./dealer-room.js";

const error=code=>{throw new RoomError(code);};
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const validId=x=>typeof x==="string"&&x.length>0&&x.length<=128;
const jsonSize=x=>{try{return JSON.stringify(x).length;}catch{return Infinity;}};

/** Validate the wire-level client command, without ever accepting user identity in it. */
export function parsePlayerRequest(request,roomId){
  if(!request||typeof request!=="object"||Array.isArray(request)||
     request.protocol!==1||request.roomId!==roomId||
     !validId(request.requestId)||!Number.isSafeInteger(request.expectedRevision)||
     request.expectedRevision<0||!request.op||typeof request.op!=="object"||
     Array.isArray(request.op)||typeof request.op.type!=="string"||
     jsonSize(request)>8192)error("INVALID_REQUEST_PACKET");
  // Require no player identity or client timestamp in the top-level packet.
  const keys=Object.keys(request).sort();
  if(keys.join(",")!==["protocol","roomId","requestId","expectedRevision","op"].sort().join(","))error("EXTRA_OR_UNTRUSTED_REQUEST_FIELDS");
  if(has(request.op,"actorId")||has(request.op,"verifiedActorId")||has(request.op,"now"))error("UNTRUSTED_IDENTITY_OR_TIME_IN_OPERATION");
  return {requestId:request.requestId,expectedRevision:request.expectedRevision,op:structuredClone(request.op)};
}

/**
 * Produces disjoint logical destinations. Caller MUST deliver encrypted
 * private packets individually; never route them through group WebXDC.
 */
export function makeOutboundPackets(room){
  const current=room.publicState();
  const publicPacket={
    protocol:1,kind:"public-snapshot",roomId:room.roomId,
    revision:current.revision,
    state:current
  };
  const privatePackets=room.members.map(({id})=>{
    const own=room.privateState(id);
    return {
      protocol:1,kind:"recipient-snapshot",roomId:room.roomId,
      revision:own.revision,recipientId:id,
      ownHole:own.ownHole,
      legal:own.legal
    };
  });
  return {publicPacket,privatePackets};
}

/**
 * Call only after external Vector transport authenticates the real sender.
 * This method is a synchronous in-process harness, not a secure connector.
 */
export function acceptTrustedRequest(room,request,{verifiedActorId,serverNow}={}){
  if(!room||typeof room.command!=="function"||
     !validId(verifiedActorId)||!Number.isSafeInteger(serverNow)||serverNow<0)error("MISSING_TRUSTED_CONTEXT");
  const payload=parsePlayerRequest(request,room.roomId);
  const receipt=room.command({
    actorId:verifiedActorId,now:serverNow,
    requestId:payload.requestId,expectedRevision:payload.expectedRevision,op:payload.op
  });
  const packets=makeOutboundPackets(room);
  return {receipt,...packets};
}

/**
 * Deliberately refuse to "send" here. A future Vector SDK implementation
 * must separately prove group and recipient-specific channel security.
 */
export function assertPacketRouting({publicPacket,privatePackets},roster){
  if(publicPacket?.kind!=="public-snapshot"||
     !Array.isArray(privatePackets)||privatePackets.length!==roster.length)error("BAD_OUTBOX");
  const publicText=JSON.stringify(publicPacket);
  if(publicText.includes('"ownHole"')||publicText.includes('"deck"')||
     publicText.includes('"recipientId"')||publicText.includes('"legal"')||
     publicText.includes('"privateFor"'))error("SECRET_FIELD_IN_PUBLIC_PACKET");
  const intended=new Set(roster.map(p=>p.id));
  if(privatePackets.length!==new Set(privatePackets.map(p=>p.recipientId)).size)error("DUPLICATE_RECIPIENT");
  for(const packet of privatePackets){
    if(packet.kind!=="recipient-snapshot"||!intended.has(packet.recipientId)||
       packet.revision!==publicPacket.revision||packet.roomId!==publicPacket.roomId||
       !Array.isArray(packet.ownHole)||packet.ownHole.length>2)error("WRONG_PRIVATE_PACKET_DESTINATION");
  }
  return true;
}
