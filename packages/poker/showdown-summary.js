/**
 * View-only showdown breakdown. Input is a trusted local dealer/table state.
 * NEVER broadcast this state via WebXDC: it includes all hidden hole cards.
 */
import {evaluate} from "./hand.js";
const en=["High card","One pair","Two pair","Three of a kind","Straight","Flush","Full house","Four of a kind","Straight flush"];
const ja=["ハイカード","ワンペア","ツーペア","スリーカード","ストレート","フラッシュ","フルハウス","フォーカード","ストレートフラッシュ"];
export function describeHand(cards,locale="en"){
 const score=evaluate(cards).score;
 if(score[0]===8&&score[1]===14)return locale==="ja"?"ロイヤルフラッシュ":"Royal flush";
 return (locale==="ja"?ja:en)[score[0]];
}
export function settlementSummary(table,{locale="en",heroId}={}){
 const h=table?.hand;
 if(!h||h.status!=="complete")throw new Error("Hand not settled");
 if(!Array.isArray(h.awards)||h.awards.length!==h.players.length)throw new Error("Invalid awards");
 const formatSeat=i=>{
  if(!Number.isSafeInteger(i)||i<0||i>=h.players.length)throw new Error("Invalid settlement winner");
  return h.players[i];
 };
 const contributions=h.players.reduce((n,p)=>n+p.total,0);
 const awards=h.awards.reduce((n,v)=>n+v,0);
 if(contributions!==awards)throw new Error("Settlement amount mismatch");
 let contested=0;
 const allocated=Array(h.players.length).fill(0);
 const pots=h.pots.map(p=>{
  if(!Number.isSafeInteger(p.amount)||p.amount<=0||!Array.isArray(p.winners)||!p.winners.length)throw new Error("Invalid pot");
  const winners=p.winners.map(formatSeat);
  if(p.returned&&winners.length!==1)throw new Error("Invalid uncalled return");
  const share=Math.floor(p.amount/winners.length),odd=p.amount%winners.length;
  const payout=p.winners.map((seat,i)=>{
   const amount=share+(i<odd?1:0);
   allocated[seat]+=amount;
   return {id:winners[i].id,name:winners[i].name,amount};
  });
  const label=p.returned?
    (locale==="ja"?"未コール分の返却":"Uncalled bet returned"):
    contested++===0?(locale==="ja"?"メインポット":"Main pot"):
    (locale==="ja"?"サイドポット "+(contested-1):"Side pot "+(contested-1));
  return {label,amount:p.amount,returned:Boolean(p.returned),payout};
 });
 if(pots.reduce((n,p)=>n+p.amount,0)!==contributions||
   allocated.some((n,i)=>n!==h.awards[i]))throw new Error("Pot breakdown mismatch");
 const show=Boolean(h.board.length===5&&h.players.filter(p=>p.inHand&&!p.folded).length>1);
 const seats=h.players.map((p,i)=>({
  id:p.id,name:p.name,contributed:p.total,awarded:h.awards[i],net:h.awards[i]-p.total,
  folded:p.folded,
  // Only reveal at a fully contested showdown. Never show mucked/folded hands.
  handName:show&&p.inHand&&!p.folded?describeHand([...h.board,...p.hole],locale):null
 }));
 const hero=seats.find(s=>s.id===heroId)??null;
 return {seats,pots,hero,totalPot:contributions};
}
