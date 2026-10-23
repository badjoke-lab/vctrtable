/**
 * Host-trusted, recreational WebXDC PvP. The host keeps the shuffled deck
 * IN MEMORY. Only sanitized public game state and ECDH/AES-GCM ciphertexts
 * cross the shared update stream. This deliberately cannot secure a game
 * against a malicious host. No monetary value or verified Vector identity.
 */
import {createSession,startSessionHand,sessionAction,sessionRebuy} from "./session.js";
import {legalActions,assertConservation} from "./engine.js";
import {signPacket,verifyPacket,sealForRecipient,unsealForRecipient,newNonce} from "./pvp-crypto.js";

const ranks="23456789TJQKA",suits="CDHS";
export const validHole=cards=>Array.isArray(cards)&&cards.length===2&&
 cards.every(c=>typeof c==="string"&&c.length===2&&ranks.includes(c[0])&&suits.includes(c[1]));
export function publicGameState(session,seq){
 const t=session.table,h=t.hand,L=legalActions(t);
 if(!h)throw Error("No hand active");
 return {
  seq,number:h.number,status:h.status,street:h.streetName,
  board:[...h.board],button:h.button,turn:h.turn,
  currentBet:h.currentBet,
  pot:h.players.reduce((a,p)=>a+p.total,0),
  players:h.players.map(({id,name,stack,street,total,folded,inHand})=>
   ({id,name,stack,street,total,folded,inHand})),
  legal:L?{playerId:L.playerId,toCall:L.toCall,canCheck:L.canCheck,
   canCall:L.canCall,canFold:L.canFold,canRaise:L.canRaise,
   minRaiseTo:L.minRaiseTo,maxRaiseTo:L.maxRaiseTo,shortAllInOnly:L.shortAllInOnly}:null,
  awards:h.status==="complete"?[...h.awards]:null,
  pots:h.status==="complete"?structuredClone(h.pots):null
 };
}
export function makeHostSession(snapshot){
 if(!snapshot?.table||!snapshot.proposal||
    snapshot.seats.size<2||snapshot.seats.size>6||
    snapshot.ready.size!==snapshot.seats.size||
    snapshot.proposal.approvals.size!==snapshot.seats.size)
  throw Error("Players must be ready and unanimously approve settings");
 const settings=snapshot.proposal.event.settings;
 const players=[...snapshot.seats].map(([id,name])=>({id,name}));
 return createSession({players,startingChips:settings.chips,
  smallBlind:settings.sb,bigBlind:settings.bb,rebuy:settings.rebuy});
}
export async function makeStateEvent({session,keys,host,tableId,peers,seq}){
 if(!session?.table?.hand)throw Error("Cannot share an empty hand");
 if(!Number.isSafeInteger(seq)||seq<1)throw Error("Invalid state revision");
 assertConservation(session.table);
 const state=publicGameState(session,seq);
 const privateHands={};
 for(const player of session.table.hand.players){
  const recipient=peers.get(player.id);
  if(!recipient?.dh)throw Error("Missing recipient encryption key");
  privateHands[player.id]=await sealForRecipient(keys,recipient,
   {tableId,number:state.number,for:player.id,hole:player.hole});
 }
 const unsigned={v:1,app:"vctrtable-pvp",kind:"state",id:newNonce(),
  by:host,tableId,state,privateHands};
 const packet=await signPacket(keys,unsigned);
 // Defence in depth: no plaintext hole/deck key in any outgoing payload.
 const rendered=JSON.stringify(packet);
 if(/"deck"|"hole"|"ownHole"|"nsec"|"privateKey"/.test(rendered))
  throw Error("Secret field escaped private envelope");
 return packet;
}
export async function readMyHand({packet,keys,hostPublic,me}){
 if(!await verifyPacket(packet,hostPublic.sign))throw Error("Host signature invalid");
 const cipher=packet.privateHands?.[me];
 if(!cipher)throw Error("Missing encrypted hand for current player");
 const result=await unsealForRecipient(keys,hostPublic,cipher);
 if(result.tableId!==packet.tableId||result.number!==packet.state.number||
    result.for!==me||!validHole(result.hole))throw Error("Private hand binding failed");
 return result.hole;
}
export async function makeSignedAction(keys,{me,tableId,revision,action,target}){
 if(!["fold","check","call","raise"].includes(action))throw Error("Invalid action");
 if(!Number.isSafeInteger(revision)||revision<1)throw Error("Missing revision");
 if(action==="raise"&&(!Number.isSafeInteger(target)||target<1))throw Error("Invalid raise");
 return signPacket(keys,{v:1,app:"vctrtable-pvp",kind:"action",id:newNonce(),
   by:me,tableId,revision,action,...(action==="raise"?{target}:{})});
}
export async function acceptSignedAction({packet,session,peers,tableId,revision}){
 if(packet?.kind!=="action"||packet.tableId!==tableId||
    packet.revision!==revision)throw Error("Stale or mismatched action");
 const signer=peers.get(packet.by);
 if(!signer?.sign||!await verifyPacket(packet,signer.sign))
  throw Error("Invalid player signature");
 if(!["fold","check","call","raise"].includes(packet.action))
  throw Error("Unsupported player action");
 const L=legalActions(session.table);
 if(!L||L.playerId!==packet.by)throw Error("Not this player's turn");
 if(packet.action==="raise")sessionAction(session,packet.by,"raise",packet.target);
 else sessionAction(session,packet.by,packet.action);
 assertConservation(session.table);
 return session.table;
}
export function nextHostHand(session){
 startSessionHand(session);return session.table;
}
