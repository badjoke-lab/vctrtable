import test from 'node:test';
import assert from 'node:assert/strict';
import {fullDeck,createTable,startHand,legalActions,act,assertConservation} from '../packages/poker/engine.js';
import {createSession,startSessionHand,sessionAction,sessionRebuy,serializeSession,restoreSession} from '../packages/poker/session.js';
const seats=(n=2)=>Array.from({length:n},(_,i)=>({id:'p'+i,name:'Player '+i}));
function forcedBoard(cards){
 const deck=fullDeck();
 const locations=[7,8,9,11,13];
 for(let i=0;i<cards.length;i++){const pos=deck.indexOf(cards[i]);[deck[locations[i]],deck[pos]]=[deck[pos],deck[locations[i]]];}
 return deck;
}
test('heads-up deals the first card to the dealer/small blind',()=>{
 const deck=fullDeck(),t=createTable({players:seats(),startingChips:100,smallBlind:1,bigBlind:2});
 startHand(t,{deck});
 assert.equal(t.hand.button,0);
 assert.deepEqual(t.hand.players[0].hole,[deck[0],deck[2]]);
 assert.deepEqual(t.hand.players[1].hole,[deck[1],deck[3]]);
});
test('odd chip is assigned to earliest winner left of button (not button)',()=>{
 const t=createTable({players:seats(3),startingChips:100,smallBlind:1,bigBlind:2});
 startHand(t,{deck:forcedBoard(['AS','KS','QS','JS','TS'])});
 function step(k){const a=legalActions(t);act(t,a.playerId,k);assertConservation(t);}
 step('call');step('fold');step('check');
 while(t.hand.status==='betting')step('check');
 assert.deepEqual(t.hand.board,['AS','KS','QS','JS','TS']);
 assert.deepEqual(t.hand.awards,[2,0,3]);
 assert.deepEqual(t.players.map(p=>p.stack),[100,99,101]);
});
test('short all-in does not reopen raising rights to player who already raised',()=>{
 const t=createTable({players:seats(3),startingChips:100,smallBlind:1,bigBlind:2});
 t.players[2].stack=7;t.minted=207;
 startHand(t,{deck:fullDeck()});
 const move=(kind,target)=>{const x=legalActions(t);act(t,x.playerId,kind,target);assertConservation(t);};
 move('call');move('raise',6);move('raise',7); // big blind short all-in
 assert.equal(legalActions(t).seat,0);move('call');
 assert.equal(legalActions(t).seat,1);
 assert.equal(legalActions(t).toCall,1);
 assert.equal(legalActions(t).canRaise,false);
 assert.throws(()=>act(t,legalActions(t).playerId,'raise',15),/Invalid raise/);
 move('call');
});
test('journal reproduces exact table with multiple hands and rebuy',()=>{
 const session=createSession({players:seats(3),startingChips:100,smallBlind:1,bigBlind:2,rebuy:true});
 startSessionHand(session,fullDeck());
 let guard=0;
 while(session.table.hand.status==='betting'){
  if(++guard>80)throw new Error('stuck');
  const L=legalActions(session.table);sessionAction(session,L.playerId,L.toCall?'call':'check');
 }
 startSessionHand(session,fullDeck().reverse());
 sessionAction(session,legalActions(session.table).playerId,'fold');
 const saved=serializeSession(session),loaded=restoreSession(saved);
 assert.deepEqual(loaded.table,session.table);
 assert.equal(serializeSession(loaded),saved);
 assertConservation(loaded.table);
});
test('journal can restore mid-hand and continue without changing result',()=>{
 const x=createSession({players:seats(),startingChips:100,smallBlind:1,bigBlind:2,rebuy:true});
 startSessionHand(x,fullDeck());
 sessionAction(x,legalActions(x.table).playerId,'call');
 const y=restoreSession(serializeSession(x));
 assert.deepEqual(y.table,x.table);
 while(x.table.hand.status==='betting'){
  const a=legalActions(x.table),b=legalActions(y.table);
  assert.deepEqual(b,a);
  const k=a.toCall?'call':'check';
  sessionAction(x,a.playerId,k);
  sessionAction(y,b.playerId,k);
 }
 assert.deepEqual(y.table,x.table);
});
test('QA journal rejects forged, truncated and out-of-turn actions',()=>{
 const session=createSession({players:seats(),startingChips:100,smallBlind:1,bigBlind:2,rebuy:true});
 startSessionHand(session,fullDeck());
 const source=JSON.parse(serializeSession(session));
 assert.throws(()=>restoreSession('{}'),/Invalid/);
 assert.throws(()=>restoreSession('{bad json'),/JSON/);
 assert.throws(()=>restoreSession(JSON.stringify({...source,version:2})),/Invalid/);
 source.events.push({kind:'act',playerId:'p1',action:'fold',target:null});
 assert.throws(()=>restoreSession(JSON.stringify(source)),/Out-of-turn/);
 source.events.pop();
 source.events[0].deck[0]=source.events[0].deck[1];
 assert.throws(()=>restoreSession(JSON.stringify(source)),/52-card/);
});
test('journal permits rebuy only on a completed hand and only for busted seat',()=>{
 const x=createSession({players:seats(),startingChips:100,smallBlind:1,bigBlind:2,rebuy:true});
 startSessionHand(x,fullDeck());
 assert.throws(()=>sessionRebuy(x,'p0'),/between hands/);
 sessionAction(x,legalActions(x.table).playerId,'fold');
 assert.throws(()=>sessionRebuy(x,'p0'),/busted/);
 x.table.players[0].stack=0;x.table.minted=100; // artificial QA balance edit is NOT recorded in journal
 assert.throws(()=>restoreSession(serializeSession(x)).table.players[0].stack===0?new Error('unexpected'):new Error('Expected distinct reconstructed balances'),/Expected distinct/);
});
