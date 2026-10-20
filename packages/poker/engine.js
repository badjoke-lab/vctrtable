// Offline-only Texas Hold'em engine. Contains secret cards: NEVER broadcast full state over WebXDC.
import { evaluate, compareScores } from './hand.js';
const RANKS='23456789TJQKA',SUITS='CDHS';
export const fullDeck=()=>[...SUITS].flatMap(s=>[...RANKS].map(r=>r+s));
const valid=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const count=h=>h.players.filter(p=>p.inHand&&!p.folded).length;
const capable=h=>h.players.filter(p=>p.inHand&&!p.folded&&p.stack>0);
const nextFrom=(players,from,predicate)=>{for(let k=1;k<=players.length;k++){const i=(from+k)%players.length;if(predicate(players[i],i))return i;}return -1;};
export function shuffleDeck(deck=fullDeck(),random=globalThis.crypto){
 if(!random||typeof random.getRandomValues!=='function')throw new Error('Secure randomness unavailable');
 const a=[...deck];
 for(let i=a.length-1;i>0;i--){const lim=4294967296-(4294967296%(i+1));let n;do{const bits=new Uint32Array(1);random.getRandomValues(bits);n=bits[0];}while(n>=lim);const j=n%(i+1);[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
export function createTable({players,startingChips=1000,smallBlind=5,bigBlind=10,rebuy=true}={}){
 if(!Array.isArray(players)||players.length<2||players.length>6||new Set(players.map(p=>p.id)).size!==players.length||players.some(p=>typeof p.id!=='string'||!p.id||typeof p.name!=='string'))throw new Error('Need 2-6 distinct players');
 if(!valid(startingChips,2,100000000)||!valid(smallBlind,1,100000000)||!valid(bigBlind,2,100000000)||smallBlind>=bigBlind||bigBlind>=startingChips||typeof rebuy!=='boolean')throw new Error('Invalid session settings');
 return {settings:{startingChips,smallBlind,bigBlind,rebuy},players:players.map(p=>({id:p.id,name:p.name,stack:startingChips})),button:players.length-1,handNumber:0,hand:null,minted:players.length*startingChips};
}
function pay(p,n){const value=Math.min(n,p.stack);p.stack-=value;p.street+=value;p.total+=value;return value;}
const roundSeats=h=>h.players.map((p,i)=>p.inHand&&!p.folded&&p.stack>0?i:-1).filter(i=>i>=0);
const nextPending=(h,from)=>nextFrom(h.players,from,(_,i)=>h.pending.includes(i));
const draw=h=>{const c=h.deck.shift();if(!c)throw new Error('Deck exhausted');return c;};
function revealNext(h){
 if(h.streetName==='preflop'){draw(h);h.board.push(draw(h),draw(h),draw(h));h.streetName='flop';}
 else if(h.streetName==='flop'){draw(h);h.board.push(draw(h));h.streetName='turn';}
 else if(h.streetName==='turn'){draw(h);h.board.push(draw(h));h.streetName='river';}
 else throw new Error('No more streets');
 h.currentBet=0;h.lastFullRaise=h.bigBlind;h.acted=[];for(const p of h.players)p.street=0;
 h.pending=roundSeats(h);h.turn=nextPending(h,h.button);
 h.events.push({kind:'street',street:h.streetName,board:[...h.board]});
}
const clockwise=(h,ids)=>[...ids].sort((a,b)=>((a-h.button+h.players.length)%h.players.length)-((b-h.button+h.players.length)%h.players.length));
function settle(h){
 if(h.status==='complete')return;
 const live=h.players.map((p,i)=>p.inHand&&!p.folded?i:-1).filter(i=>i>=0);
 if(live.length>1&&h.board.length!==5)throw new Error('Missing board cards');
 const scores=new Map(live.length>1?live.map(i=>[i,evaluate([...h.board,...h.players[i].hole]).score]):[]);
 const levels=[...new Set(h.players.map(p=>p.total).filter(v=>v>0))].sort((a,b)=>a-b);
 const awards=Array(h.players.length).fill(0),pots=[];let prev=0;
 for(const level of levels){
  const contributors=h.players.map((p,i)=>p.total>=level?i:-1).filter(i=>i>=0),amount=(level-prev)*contributors.length;prev=level;
  const eligible=contributors.filter(i=>live.includes(i));
  if(contributors.length===1){awards[contributors[0]]+=amount;pots.push({amount,winners:[contributors[0]],returned:true});continue;}
  if(!eligible.length)throw new Error('Invalid folded-only pot layer');
  let best=scores.get(eligible[0]);
  if(live.length>1)for(const i of eligible)if(compareScores(scores.get(i),best)>0)best=scores.get(i);
  const winners=clockwise(h,live.length===1?eligible:eligible.filter(i=>compareScores(scores.get(i),best)===0));
  const share=Math.floor(amount/winners.length),odd=amount%winners.length;
  for(let k=0;k<winners.length;k++)awards[winners[k]]+=share+(k<odd?1:0);
  pots.push({amount,winners,returned:false});
 }
 for(let i=0;i<h.players.length;i++)h.players[i].stack+=awards[i];
 h.awards=awards;h.pots=pots;h.status='complete';h.turn=-1;h.pending=[];
 h.events.push({kind:'complete',awards:[...awards],pots:structuredClone(pots)});
}
function progress(h){
 if(count(h)===1){settle(h);return;}
 if(capable(h).length<=1){
  const only=capable(h)[0];
  if(only&&h.currentBet>only.street){h.pending=[h.players.indexOf(only)];h.turn=h.pending[0];return;}
  while(h.board.length<5)revealNext(h);
  settle(h);return;
 }
 if(h.pending.length){if(h.turn<0||!h.pending.includes(h.turn))h.turn=nextPending(h,h.button);return;}
 if(h.streetName==='river'){settle(h);return;}
 revealNext(h);progress(h);
}
export function startHand(table,{deck}={}){
 if(table.hand&&table.hand.status!=='complete')throw new Error('Hand already active');
 const eligible=table.players.filter(p=>p.stack>0);
 if(eligible.length<2)throw new Error('Need two players with chips; rebuy or reset session');
 if(deck!==undefined&&(!Array.isArray(deck)||deck.length!==52||new Set(deck).size!==52||deck.some(c=>!fullDeck().includes(c))))throw new Error('Deck must be a 52-card permutation');
 table.button=nextFrom(table.players,table.button,p=>p.stack>0);
 const h={number:++table.handNumber,players:table.players.map(p=>({id:p.id,name:p.name,stack:p.stack,hole:[],inHand:p.stack>0,folded:false,street:0,total:0})),button:table.button,smallBlind:table.settings.smallBlind,bigBlind:table.settings.bigBlind,board:[],deck:deck?[...deck]:shuffleDeck(),streetName:'preflop',currentBet:table.settings.bigBlind,lastFullRaise:table.settings.bigBlind,acted:[],pending:[],turn:-1,status:'betting',pots:[],awards:[],events:[]};
 const sb=nextFrom(h.players,h.button,p=>p.inHand),sbSeat=eligible.length===2?h.button:sb,bb=nextFrom(h.players,sbSeat,p=>p.inHand);
 h.sbSeat=sbSeat;h.bbSeat=bb;
 for(let round=0;round<2;round++)for(let step=1;step<=h.players.length;step++){const i=(h.button+step)%h.players.length;if(h.players[i].inHand)h.players[i].hole.push(draw(h));}
 const paidSmall=pay(h.players[sbSeat],h.smallBlind),paidBig=pay(h.players[bb],h.bigBlind);
 h.events.push({kind:'blinds',sb:sbSeat,bb,paidSmall,paidBig});
 h.pending=roundSeats(h);h.turn=nextPending(h,bb);table.hand=h;progress(h);syncStacks(table);return h;
}
function syncStacks(table){if(!table.hand)return;for(let i=0;i<table.players.length;i++)table.players[i].stack=table.hand.players[i].stack;}
export function legalActions(table){
 const h=table.hand;if(!h||h.status!=='betting'||h.turn<0)return null;
 const p=h.players[h.turn],toCall=Math.max(0,h.currentBet-p.street),maxTotal=p.street+p.stack;
 const canRaise=capable(h).length>=2&&!h.acted.includes(h.turn)&&maxTotal>h.currentBet;
 const minRaiseTo=h.currentBet===0?h.bigBlind:h.currentBet+h.lastFullRaise;
 return {seat:h.turn,playerId:p.id,stack:p.stack,toCall,canCheck:toCall===0,canCall:toCall>0,canFold:true,canRaise,minRaiseTo,maxRaiseTo:maxTotal,shortAllInOnly:canRaise&&maxTotal<minRaiseTo};
}
export function act(table,playerId,kind,target){
 const h=table.hand,L=legalActions(table);if(!L||L.playerId!==playerId)throw new Error('Out-of-turn or finished hand');
 const p=h.players[h.turn],actor=h.turn;
 if(kind==='fold'){p.folded=true;h.pending=h.pending.filter(i=>i!==actor);h.acted.push(actor);}
 else if(kind==='check'){if(!L.canCheck)throw new Error('Cannot check facing bet');h.pending=h.pending.filter(i=>i!==actor);h.acted.push(actor);}
 else if(kind==='call'){if(!L.canCall)throw new Error('Nothing to call');pay(p,L.toCall);h.pending=h.pending.filter(i=>i!==actor);h.acted.push(actor);}
 else if(kind==='raise'){
  if(!L.canRaise||!valid(target,h.currentBet+1,L.maxRaiseTo))throw new Error('Invalid raise');
  const fullRaise=target>=L.minRaiseTo;
  if(!fullRaise&&target!==L.maxRaiseTo)throw new Error('Below minimum raise, not all-in');
  const old=h.currentBet;pay(p,target-p.street);h.currentBet=target;
  if(fullRaise){h.lastFullRaise=target-old;h.acted=[actor];h.pending=roundSeats(h).filter(i=>i!==actor);}
  else{h.acted.push(actor);h.pending=[...new Set([...h.pending.filter(i=>i!==actor),...roundSeats(h).filter(i=>i!==actor&&h.players[i].street<target)])];}
 }else throw new Error('Unknown action');
 h.events.push({kind:'action',seat:actor,action:kind,target:kind==='raise'?target:null});
 h.turn=nextPending(h,actor);progress(h);syncStacks(table);return h;
}
export function rebuyPlayer(table,id){
 if(!table.settings.rebuy)throw new Error('Rebuy disallowed');
 if(table.hand&&table.hand.status!=='complete')throw new Error('Rebuy allowed only between hands');
 const p=table.players.find(p=>p.id===id);if(!p)throw new Error('Unknown player');
 if(p.stack>0)throw new Error('This QA engine only rebuys busted players');
 p.stack=table.settings.startingChips;table.minted+=p.stack;return p.stack;
}
export function totalChips(table){return table.players.reduce((s,p)=>s+p.stack,0)+(table.hand&&table.hand.status==='betting'?table.hand.players.reduce((s,p)=>s+p.total,0):0);}
export function assertConservation(table){if(totalChips(table)!==table.minted)throw new Error('Chip conservation violated');return true;}
