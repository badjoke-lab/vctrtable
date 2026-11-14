/**
 * Pure, state-derived Poker motion cues. Never infer an unverified action
 * from the transport or the local wall clock. Only signed host snapshots
 * that have already passed the existing game verifier reach this function.
 * Nothing here changes betting, cards, chips, or WebXDC messages.
 */
export const POKER_STAGES=["preflop","flop","turn","river","complete"];
const validNumber=x=>typeof x==="number"&&Number.isFinite(x);
const name=p=>p?.name||"Player";
const summary=(type,title,detail,extras={})=>({
 type,title,detail,newBoardIndices:[],dealHand:false,
 changedSeats:[],potBump:false,...extras
});
export function stageFor(state){
 if(state?.status==="complete")return "complete";
 return POKER_STAGES.includes(state?.street)?state.street:"preflop";
}
export function describePokerTransition(previous,next,viewer){
 if(!next||!Array.isArray(next.players)||!Array.isArray(next.board))return null;
 const first=!previous||previous._room!==next._room||previous.number!==next.number;
 if(first){
  if(next.board.length||next.status==="complete")
   return summary("sync","TABLE SYNCED","Live hand restored / 対戦状態を再取得");
  return summary("deal","NEW HAND","Two private cards dealt / 手札を2枚配りました",
   {dealHand:true});
 }
 // Updates of a host deadline/pause without any game event are deliberately
 // silent. A one-second UI refresh must not trigger gameplay motion.
 if(previous.status!=="complete"&&next.status==="complete"){
  const winners=next.players.filter((p,i)=>validNumber(next.awards?.[i])&&next.awards[i]>0);
  const awardNames=winners.map(name).join(" + ");
  const settled=next.players.filter(p=>p.inHand&&!p.folded);
  const byFold=settled.length===1;
  return summary("settlement",byFold?"HAND WON":"SHOWDOWN",
   (awardNames||"Hand settled")+" · "+winners.reduce((sum,p)=>sum+
    (next.awards[next.players.indexOf(p)]||0),0)+" chips awarded / 勝敗確定",
   {changedSeats:winners.map(p=>p.id),potBump:true});
 }
 if(next.board.length>previous.board.length){
  const diff=next.board.length-previous.board.length;
  const street=stageFor(next);
  const labels={
   flop:["FLOP","Three community cards / 場札を3枚公開"],
   turn:["TURN","Fourth community card / 4枚目を公開"],
   river:["RIVER","Fifth community card / 5枚目を公開"]
  };
  const [title,detail]=labels[street]||["BOARD","Community cards revealed / 場札を公開"];
  return summary("street",title,detail,
   {newBoardIndices:Array.from({length:diff},(_,i)=>previous.board.length+i)});
 }
 const folded=next.players.find(p=>p.folded&&!previous.players.find(q=>q.id===p.id)?.folded);
 if(folded)return summary("fold","FOLD",name(folded)+" leaves this hand / 降りました",
  {changedSeats:[folded.id]});
 const added=next.players.filter(p=>{
  const old=previous.players.find(q=>q.id===p.id);
  return old&&validNumber(p.total)&&validNumber(old.total)&&p.total>old.total;
 });
 if(added.length){
  const moved=added.reduce((sum,p)=>sum+p.total-
   previous.players.find(q=>q.id===p.id).total,0);
  const actor=added.map(name).join(" + ");
  return summary("chips","CHIPS IN",actor+" · +"+moved+" to the pot / ポットへ追加",
   {changedSeats:added.map(p=>p.id),potBump:next.pot>previous.pot});
 }
 const a=next.players[next.turn]?.id,b=previous.players[previous.turn]?.id;
 if(next.status==="betting"&&a&&a!==b)
  return summary("turn",a===viewer?"YOUR TURN":"NEXT PLAYER",
   (a===viewer?"Make your move / あなたの手番":name(next.players[next.turn])+" to act / 手番交代"),
   {changedSeats:[a]});
 return null;
}
