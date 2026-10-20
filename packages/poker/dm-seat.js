/**
 * Non-networked WebXDC DM seat protocol.
 * Parses only manually pasted DM replies. Neither this file nor its UI
 * may call webxdc.sendUpdate: private cards belong to one seat only.
 *
 * Pasted JSON is NOT cryptographically authenticated by this parser.
 * Trust requires verifying the actual DM sender in the Vector host UI.
 */
const RANKS="23456789TJQKA",SUITS="CDHS";
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const id=x=>typeof x==="string"&&x.length>0&&x.length<=128;
const card=x=>typeof x==="string"&&x.length===2&&RANKS.includes(x[0])&&SUITS.includes(x[1]);
const bad=code=>{const e=new Error(code);e.code=code;throw e;};
const own=(obj,k)=>Object.prototype.hasOwnProperty.call(obj,k);
function requirePlayer(playerId){if(!id(playerId)||!playerId.startsWith("npub1"))bad("INVALID_PLAYER_ID");}
function requireRoom(roomId){if(!id(roomId))bad("INVALID_ROOM_ID");}
function checkCards(cards){
 if(!Array.isArray(cards)||!(cards.length===0||cards.length===2)||cards.some(c=>!card(c))||new Set(cards).size!==cards.length)bad("BAD_PRIVATE_CARDS");
}
function decode(raw){
 if(typeof raw!=="string"||raw.length>131072)bad("INVALID_SNAPSHOT");
 try{return JSON.parse(raw);}catch{bad("INVALID_SNAPSHOT_JSON");}
}
/** Local-only generation of the bot DM's wire request. Never includes nsec. */
export function commandJson({roomId,revision,op,random=globalThis.crypto}={}){
 requireRoom(roomId);
 if(!integer(revision,0,Number.MAX_SAFE_INTEGER)||!op||typeof op!=="object"||Array.isArray(op))bad("INVALID_COMMAND");
 const types=["propose","approve","startHand","act","rebuy","requestPause","votePause"];
 if(!types.includes(op.type))bad("UNKNOWN_ACTION");
 if(op.type==="act"&&!["fold","check","call","raise"].includes(op.action))bad("UNKNOWN_ACTION");
 if(op.type==="propose"){
  const x=op.settings;
  if(!x||!integer(x.startingChips,2,100000000)||!integer(x.smallBlind,1,100000000)||!integer(x.bigBlind,2,100000000)||x.smallBlind>=x.bigBlind||x.bigBlind>=x.startingChips||!integer(x.actionSeconds,0,3600)||typeof x.rebuy!=="boolean")bad("INVALID_RULES");
 }
 if(op.type==="approve"&&!integer(op.proposalId,1,Number.MAX_SAFE_INTEGER))bad("INVALID_PROPOSAL");
 if(op.type==="votePause"&&(!integer(op.pauseId,1,Number.MAX_SAFE_INTEGER)||typeof op.approve!=="boolean"))bad("INVALID_VOTE");
 if(op.type==="requestPause"&&!["pause","resume"].includes(op.mode))bad("INVALID_PAUSE_MODE");
 if(op.type==="act"&&op.action==="raise"&&!integer(op.target,1,Number.MAX_SAFE_INTEGER))bad("INVALID_RAISE");
 if(own(op,"actorId")||own(op,"verifiedActorId")||own(op,"now"))bad("UNTRUSTED_COMMAND_FIELDS");
 if(!random||typeof random.getRandomValues!=="function")bad("SECURE_RANDOMNESS_REQUIRED");
 const buf=new Uint8Array(16);random.getRandomValues(buf);
 const requestId=Array.from(buf,x=>x.toString(16).padStart(2,"0")).join("");
 return JSON.stringify({protocol:1,roomId,requestId,expectedRevision:revision,op});
}
/** Bot's resync message via user-selected, one-to-one DM. */
export const syncJson=()=>JSON.stringify({kind:"sync"});

/** Pure structural validation of a one-recipient DM reply, not a signature check. */
export function parseSeatSnapshot(raw,{roomId,playerId,minimumRevision=-1}={}){
 requireRoom(roomId);requirePlayer(playerId);
 const packet=decode(raw);
 if(!packet||packet.protocol!==1||packet.kind!=="vctrtable-poker-state"||
    packet.roomId!==roomId||!integer(packet.revision,0,Number.MAX_SAFE_INTEGER)||
    packet.revision<minimumRevision||!packet.state||packet.state.roomId!==roomId||
    packet.state.revision!==packet.revision||!Array.isArray(packet.state.members)||
    !packet.state.members.some(p=>p?.id===playerId)||!packet.private||
    typeof packet.private!=="object"||packet.private.recipientId!==playerId)bad("SNAPSHOT_NOT_FOR_THIS_SEAT");
 if(own(packet,"deck")||own(packet.state,"deck")||own(packet.state,"ownHole"))bad("UNEXPECTED_SECRET_FIELD");
 const {ownHole,legal}=packet.private;
 checkCards(ownHole);
 const h=packet.state.hand;
 if(h!==null){
  if(!h||!Array.isArray(h.players)||!Array.isArray(h.board)||
     !integer(h.number,1,Number.MAX_SAFE_INTEGER)||
     !integer(h.pot,0,1000000000000)||
     !["preflop","flop","turn","river"].includes(h.street)||
     !["betting","complete"].includes(h.status)||
     ![0,3,4,5].includes(h.board.length)||
     h.board.some(c=>!card(c))||
     !h.players.some(p=>p?.id===playerId))bad("INVALID_PUBLIC_TABLE");
  const duplicates=[...h.board,...ownHole];
  if(new Set(duplicates).size!==duplicates.length)bad("DUPLICATE_CARD");
 }else if(ownHole.length!==0)bad("UNEXPECTED_PRIVATE_HAND");
 if(legal!==null){
  if(!legal||legal.playerId!==playerId||h?.status!=="betting"||
     h.playerToAct!==playerId||!integer(legal.toCall,0,1000000000000)||
     typeof legal.canCheck!=="boolean"||typeof legal.canCall!=="boolean"||
     typeof legal.canRaise!=="boolean"||
     !integer(legal.maxRaiseTo,0,1000000000000)||
     !integer(legal.minRaiseTo,0,1000000000000))bad("INVALID_SEAT_ACTIONS");
 }
 return {
  roomId,playerId,revision:packet.revision,
  state:structuredClone(packet.state),
  private:{ownHole:[...ownHole],legal:legal===null?null:structuredClone(legal)}
 };
}
