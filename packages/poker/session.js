// Developer-only solo QA journal; contains entire deck and all private cards.
// NEVER send or expose this object through WebXDC shared updates or telemetry.
import {createTable,startHand,act,rebuyPlayer,shuffleDeck,assertConservation} from './engine.js';
const MAX_BYTES=2_000_000;
const MAX_EVENTS=20_000;
function freshConfig({players,startingChips,smallBlind,bigBlind,rebuy}){
 return {players:players.map(({id,name})=>({id,name})),startingChips,smallBlind,bigBlind,rebuy};
}
export function createSession(config){
 const table=createTable(config);
 return {table,journal:{version:1,config:freshConfig({...table.settings,players:table.players}),events:[]}};
}
function next(session,event){
 // Commit to journal only after the game engine accepts the operation.
 if(event.kind==='start') startHand(session.table,{deck:event.deck});
 else if(event.kind==='act')act(session.table,event.playerId,event.action,event.target);
 else if(event.kind==='rebuy')rebuyPlayer(session.table,event.playerId);
 else throw new Error('Unsupported journal event');
 assertConservation(session.table);
 if(session.journal.events.length>=MAX_EVENTS)throw new Error('Session journal limit reached');
 session.journal.events.push(structuredClone(event));
 return session.table;
}
export function startSessionHand(session,deck=shuffleDeck()){
 return next(session,{kind:'start',deck:[...deck]});
}
export function sessionAction(session,playerId,action,target){
 return next(session,{kind:'act',playerId,action,target:action==='raise'?target:null});
}
export function sessionRebuy(session,playerId){return next(session,{kind:'rebuy',playerId});}
export function serializeSession(session){
 if(!session?.journal)throw new Error('No session to save');
 const json=JSON.stringify(session.journal);
 if(json.length>MAX_BYTES)throw new Error('Session too large');
 return json;
}
export function restoreSession(json){
 if(typeof json!=='string'||json.length>MAX_BYTES)throw new Error('Unsupported session data');
 const doc=JSON.parse(json);
 if(!doc||doc.version!==1||!doc.config||!Array.isArray(doc.events)||doc.events.length>MAX_EVENTS)throw new Error('Invalid session version or events');
 const session=createSession(doc.config);
 for(const event of doc.events){
  if(!event||typeof event.kind!=='string')throw new Error('Bad recorded event');
  if(event.kind==='start'){
   if(!Array.isArray(event.deck)||event.deck.length!==52)throw new Error('Invalid recorded deck');
   next(session,{kind:'start',deck:event.deck});
  }else if(event.kind==='act'){
   if(typeof event.playerId!=='string'||!['fold','check','call','raise'].includes(event.action))throw new Error('Invalid recorded action');
   if(event.action==='raise'&&!Number.isSafeInteger(event.target))throw new Error('Invalid recorded bet');
   next(session,{kind:'act',playerId:event.playerId,action:event.action,target:event.target});
  }else if(event.kind==='rebuy'){
   if(typeof event.playerId!=='string')throw new Error('Invalid recorded rebuy');
   next(session,{kind:'rebuy',playerId:event.playerId});
  }else throw new Error('Unexpected journal event');
 }
 return session;
}
