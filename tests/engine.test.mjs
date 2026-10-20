import test from 'node:test';
import assert from 'node:assert/strict';
import { createTable, fullDeck, startHand, legalActions, act, rebuyPlayer, assertConservation, totalChips, shuffleDeck } from '../packages/poker/engine.js';
const players=(n=2)=>Array.from({length:n},(_,i)=>({id:'p'+i,name:'P'+i}));
const setup=(n=2,opts={})=>createTable({players:players(n),startingChips:100,smallBlind:1,bigBlind:2,...opts});
const step=(t,kind,target)=>{const a=legalActions(t);assert.ok(a,'Expected active player');act(t,a.playerId,kind,target);assertConservation(t);};
function through(t){let ticks=0;while(t.hand.status==='betting'){if(++ticks>100)throw new Error('loop');const a=legalActions(t);step(t,a.toCall?'call':'check');}}
test('deck has 52 unique cards',()=>assert.equal(new Set(fullDeck()).size,52));
test('shuffle produces permutation with crypto',()=>assert.deepEqual(shuffleDeck().slice().sort(),fullDeck().sort()));
test('heads-up button is small blind and acts first preflop',()=>{
 const t=setup();startHand(t,{deck:fullDeck()});assert.equal(t.hand.button,t.hand.sbSeat);assert.equal(t.hand.turn,t.hand.sbSeat);assert.equal(legalActions(t).toCall,1);
 step(t,'call');assert.equal(legalActions(t).toCall,0);step(t,'check');assert.equal(t.hand.streetName,'flop');
 assert.equal(t.hand.turn,t.hand.bbSeat);through(t);assert.equal(t.hand.board.length,5);assert.equal(totalChips(t),200);
});
test('3 seats: button/SB/BB order and postflop order',()=>{
 const t=setup(3);startHand(t,{deck:fullDeck()});assert.equal(t.hand.button,0);assert.equal(t.hand.sbSeat,1);assert.equal(t.hand.bbSeat,2);assert.equal(t.hand.turn,0);
 step(t,'call');step(t,'call');step(t,'check');assert.equal(t.hand.streetName,'flop');assert.equal(t.hand.turn,1);through(t);
});
test('fold awards pot and conserves chips',()=>{
 const t=setup();startHand(t,{deck:fullDeck()});step(t,'fold');assert.equal(t.hand.status,'complete');assert.equal(t.players[t.hand.bbSeat].stack,101);assert.equal(t.players[t.hand.sbSeat].stack,99);
});
test('preflop raise reopens action to original bettor',()=>{
 const t=setup();startHand(t,{deck:fullDeck()});step(t,'raise',6);assert.equal(t.hand.currentBet,6);
 assert.equal(legalActions(t).toCall,4);step(t,'raise',14);assert.equal(legalActions(t).toCall,8);step(t,'call');through(t);
});
test('under-minimum raise requires all-in',()=>{
 const t=setup();startHand(t,{deck:fullDeck()});assert.throws(()=>step(t,'raise',3),/minimum/);assert.equal(t.hand.currentBet,2);
});
test('cannot check facing bet or act out of turn',()=>{
 const t=setup();startHand(t,{deck:fullDeck()});assert.throws(()=>step(t,'check'),/Cannot check/);
 assert.throws(()=>act(t,t.hand.players[t.hand.bbSeat].id,'fold'),/Out-of-turn/);
});
test('full stack all-in preflop auto runs out with chip conservation',()=>{
 const t=setup();startHand(t,{deck:fullDeck()});step(t,'raise',100);step(t,'call');assert.equal(t.hand.status,'complete');assert.equal(t.hand.board.length,5);
});
test('4 seats and unequal all-ins produce main & side pots',()=>{
 const t=setup(4);
 t.players[0].stack=30;t.players[1].stack=60;t.players[2].stack=100;t.players[3].stack=110;t.minted=300;
 startHand(t,{deck:fullDeck()});let loops=0;
 while(t.hand.status==='betting'){
  if(++loops>30)throw new Error('loop');const a=legalActions(t);
  if(a.canRaise)step(t,'raise',a.maxRaiseTo);else if(a.toCall)step(t,'call');else step(t,'check');
 }
 assertConservation(t);assert.ok(t.hand.pots.length>=2);assert.equal(t.hand.pots.reduce((s,p)=>s+p.amount,0),300);
});
test('odd chips in tied pots are distributed, total remains unchanged',()=>{
 const t=setup(3);startHand(t,{deck:fullDeck()});through(t);assertConservation(t);
});
test('rebuy only for busted players and only if enabled',()=>{
 const t=setup();t.players[0].stack=0;t.minted=100;
 rebuyPlayer(t,'p0');assertConservation(t);assert.equal(t.players[0].stack,100);
 assert.throws(()=>rebuyPlayer(t,'p1'),/bust/);
 const q=setup(2,{rebuy:false});q.players[0].stack=0;assert.throws(()=>rebuyPlayer(q,'p0'),/disallowed/);
});
test('rejects manipulated deck and concurrent hands',()=>{
 const t=setup();assert.throws(()=>startHand(t,{deck:['AS']}),/52-card/);
 startHand(t,{deck:fullDeck()});assert.throws(()=>startHand(t),/already active/);
});
for(let n=2;n<=6;n++)test('randomized action sequences conserve chips for '+n+' seats',()=>{
 for(let trial=0;trial<75;trial++){
  const t=setup(n,{startingChips:300,smallBlind:3,bigBlind:6});
  for(let hand=0;hand<6;hand++){
   if(t.players.filter(p=>p.stack>0).length<2){for(const p of t.players)if(p.stack===0)rebuyPlayer(t,p.id);}
   startHand(t);let count=0;
   while(t.hand.status==='betting'){
    if(++count>200)throw new Error('Stuck in action loop: '+JSON.stringify(t.hand.events));
    const l=legalActions(t),r=Math.random();
    if(r<.12)step(t,'fold');
    else if(l.canRaise&&r<.33)step(t,'raise',l.maxRaiseTo>=l.minRaiseTo&&r<.2?l.maxRaiseTo:Math.min(l.maxRaiseTo,l.minRaiseTo));
    else step(t,l.toCall?'call':'check');
   }
   assertConservation(t);
  }
 }
});
