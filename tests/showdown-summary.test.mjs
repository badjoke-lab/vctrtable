import test from "node:test";
import assert from "node:assert/strict";
import {createTable,startHand,act,legalActions,fullDeck,assertConservation} from "../packages/poker/engine.js";
import {settlementSummary,describeHand} from "../packages/poker/showdown-summary.js";
const players=n=>Array.from({length:n},(_,i)=>({id:"p"+i,name:"Player "+i}));
const move=(t,kind,target)=>{
 const L=legalActions(t);if(!L)throw Error("Expected action");
 act(t,L.playerId,kind,target);assertConservation(t);
};
function board(cards,positions=[7,8,9,11,13]){
 const deck=fullDeck();
 for(let i=0;i<cards.length;i++){
  const from=deck.indexOf(cards[i]),to=positions[i];
  [deck[from],deck[to]]=[deck[to],deck[from]];
 }
 return deck;
}
test("one uncontested folded hand shows pot win and uncalled blind returned, never hand rankings",()=>{
 const t=createTable({players:players(2),startingChips:100,smallBlind:1,bigBlind:2});
 startHand(t,{deck:fullDeck()});move(t,"fold");
 const r=settlementSummary(t,{locale:"en",heroId:"p0"});
 assert.equal(r.totalPot,3);
 assert.equal(r.hero.net,-1);
 assert.equal(r.hero.awarded,0);
 assert.equal(r.pots.length,2);
 assert.equal(r.pots[0].label,"Main pot");
 assert.equal(r.pots[0].amount,2);
 assert.equal(r.pots[1].label,"Uncalled bet returned");
 assert.equal(r.pots[1].amount,1);
 assert.equal(r.pots[0].payout[0].id,"p1");
 assert.equal(r.pots[1].payout[0].id,"p1");
 assert.ok(r.seats.every(s=>s.handName===null));
});
test("odd chip is paid to first eligible winning seat left of the dealer",()=>{
 const t=createTable({players:players(3),startingChips:100,smallBlind:1,bigBlind:2});
 startHand(t,{deck:board(["AS","KS","QS","JS","TS"])});
 move(t,"call");move(t,"fold");move(t,"check");
 while(t.hand.status==="betting")move(t,"check");
 const r=settlementSummary(t,{locale:"en",heroId:"p0"});
 assert.equal(r.totalPot,5);
 assert.deepEqual(r.pots.map(p=>p.amount),[4,1]);
 assert.deepEqual(r.pots[0].payout.map(p=>[p.id,p.amount]),[["p2",2],["p0",2]]);
 assert.equal(r.seats[1].handName,null);
 assert.equal(r.seats[0].handName,"Royal flush");
 assert.equal(r.seats[2].handName,"Royal flush");
 assert.equal(r.hero.net,0);
 assertConservation(t);
});
test("main/side pots, refund and net results exactly reproduce authoritative awards",()=>{
 const t=createTable({players:players(4),startingChips:120,smallBlind:1,bigBlind:2});
 const stacks=[30,60,90,120];
 for(let i=0;i<4;i++)t.players[i].stack=stacks[i];
 t.minted=stacks.reduce((s,n)=>s+n,0);
 startHand(t,{deck:fullDeck()});
 let guard=0;
 while(t.hand.status==="betting"){
  if(++guard>100)throw Error("Stuck multiway all-in");
  const l=legalActions(t);
  if(l.canRaise)move(t,"raise",l.maxRaiseTo);
  else move(t,l.toCall?"call":"check");
 }
 const r=settlementSummary(t,{locale:"ja",heroId:"p0"});
 assert.equal(r.totalPot,300);
 assert.equal(r.pots.reduce((s,p)=>s+p.amount,0),300);
 assert.ok(r.pots.some(p=>p.label.startsWith("サイドポット")));
 assert.deepEqual(r.seats.map(p=>p.awarded),t.hand.awards);
 assert.deepEqual(r.seats.map(p=>p.net),t.hand.players.map((p,i)=>t.hand.awards[i]-p.total));
 assert.equal(r.pots.flatMap(p=>p.payout).reduce((s,w)=>s+w.amount,0),300);
 assert.equal(r.seats.reduce((s,p)=>s+p.net,0),0);
 assertConservation(t);
});
test("winning hand names are localized for all 9 categories",()=>{
 const examples=[
  [["AS","KD","QH","JS","9D"],"High card","ハイカード"],
  [["AS","AD","QH","JS","9D"],"One pair","ワンペア"],
  [["AS","AD","QH","QS","9D"],"Two pair","ツーペア"],
  [["AS","AD","AH","JS","9D"],"Three of a kind","スリーカード"],
  [["AS","2D","3H","4S","5D"],"Straight","ストレート"],
  [["AS","KS","QS","8S","5S"],"Flush","フラッシュ"],
  [["AS","AD","AH","QS","QD"],"Full house","フルハウス"],
  [["AS","AD","AH","AC","9D"],"Four of a kind","フォーカード"],
  [["9S","8S","7S","6S","5S"],"Straight flush","ストレートフラッシュ"],
  [["AS","KS","QS","JS","TS"],"Royal flush","ロイヤルフラッシュ"]
 ];
 for(const [cards,en,ja] of examples){
  assert.equal(describeHand(cards,"en"),en);
  assert.equal(describeHand(cards,"ja"),ja);
 }
});
test("refuses incomplete or tampered settlement rather than showing false wins",()=>{
 const t=createTable({players:players(2),startingChips:100,smallBlind:1,bigBlind:2});
 assert.throws(()=>settlementSummary(t),/Hand not settled/);
 startHand(t,{deck:fullDeck()});
 assert.throws(()=>settlementSummary(t),/Hand not settled/);
 move(t,"fold");
 const good=settlementSummary(t);
 assert.equal(good.totalPot,3);
 t.hand.awards[1]=999;
 assert.throws(()=>settlementSummary(t),/Settlement amount mismatch/);
});
