/** Authoritative local kernel adapter for the 2-player friendly-host PvP lane.
 * This module NEVER exports deck order or the opponent's hand in a snapshot.
 * Host is trusted to deal; this is NOT provably fair mental poker.
 */
import {startRound,chooseInitialDealer,playCard,chooseTarget,
 drawNextCard,decide,scoreCards,getPublicState,cardById} from "./koikoi.js";

export function secureRandom() {
 if(!globalThis.crypto?.getRandomValues)throw Error("Secure RNG unavailable");
 const array=new Uint32Array(1);
 crypto.getRandomValues(array);
 return array[0]/4294967296;
}
export function matchingTargets(field,cardId) {
 const card=cardById(cardId);
 if(!card)throw Error("Unknown card");
 return field.filter(id=>cardById(id).month===card.month);
}
export function createAuthoritativeMatch({rounds=12,rng=secureRandom}={}) {
 if(![3,6,12].includes(rounds))throw Error("Match must have 3, 6 or 12 rounds");
 let round=1,scores=[0,0],revision=0;
 let dealer=chooseInitialDealer(rng).dealer;
 let game=startRound({dealer,rng});
 let settled=false;
 const events=[];
 function settleOnce(){
  if(game.phase!=="ended"||settled)return;
  settled=true;
  if(game.winner!==null)scores[game.winner]+=game.points;
 }
 function snapshot(seat) {
  if(seat!==0&&seat!==1)throw Error("Invalid seat");
  const pub=getPublicState(game);
  const lastDraw=game.log.filter(item=>item.kind==="draw").at(-1)?.cardId??null;
  return {
   protocol:1,round,rounds,scores:scores.slice(),revision,
   seat, hand:game.hands[seat].slice(),
   public:{...pub,
    // The draw-pile card is public ONLY after drawNextCard().
    revealedDraw:game.phase==="choose"&&game.pending?.step==="draw"?
      game.pending.cardId:lastDraw,
    pendingChoices:game.phase==="choose"&&game.pending?.step==="draw"?
      game.pending.choices.slice():[],
    pendingStep:game.phase==="choose"?game.pending?.step:null,
    // The dealt hand type, not the dealt cards, is already revealed if
    // the initial six-point bonus ends the round.
    initialBonus:game.endedReason==="initial-bonus"?
      {...game.initialBonus}:null
   },
   lastAction:events.at(-1)||null,
   finished:round===rounds&&game.phase==="ended"
  };
 }
 function send(seat,intent) {
  if(!intent||typeof intent!=="object")throw Error("Invalid action");
  if(seat!==game.active)throw Error("It is not your turn");
  const kind=intent.kind;
  if(kind==="play") {
   if(game.phase!=="turn")throw Error("Not accepting a played card");
   if(typeof intent.cardId!=="string"||!game.hands[seat].includes(intent.cardId))
    throw Error("Card is not yours");
   const targets=matchingTargets(game.field,intent.cardId);
   if(targets.length===2&&!targets.includes(intent.targetId))
    throw Error("Choose one of the two matching field cards");
   const played=intent.cardId;
   playCard(game,played,{deferDraw:true});
   if(game.phase==="choose"&&game.pending?.step==="hand")
    chooseTarget(game,intent.targetId,{deferDraw:true});
   if(game.phase!=="draw-pending")throw Error("Hand play did not reach draw");
   drawNextCard(game);
   // Do not broadcast deck order or any still-hidden card.
   events.push({kind:"play",seat,cardId:played,
    targetId:targets.length===2?intent.targetId:null,
    drawCardId:game.log.filter(i=>i.kind==="draw").at(-1)?.cardId||null});
  }else if(kind==="choose") {
   if(game.phase!=="choose"||game.pending?.step!=="draw")
    throw Error("Not choosing a drawn card target");
   if(!game.pending.choices.includes(intent.targetId))
    throw Error("Illegal drawn-card target");
   chooseTarget(game,intent.targetId);
   events.push({kind:"choose",seat,targetId:intent.targetId});
  }else if(kind==="decide") {
   if(game.phase!=="decision")throw Error("No yaku decision pending");
   if(!["stop","koi"].includes(intent.choice))throw Error("Invalid decision");
   decide(game,intent.choice);
   events.push({kind:"decide",seat,choice:intent.choice});
  }else throw Error("Unknown action");
  revision++;settleOnce();
  return snapshot(seat);
 }
 function nextRound() {
  if(game.phase!=="ended")throw Error("Current round is still active");
  if(round>=rounds)throw Error("Match has finished");
  dealer=game.winner===null?1-game.dealer:game.winner;
  round++;
  game=startRound({dealer,rng});
  settled=false;revision++;
  settleOnce();
  events.push({kind:"new-round",seat:dealer,round});
  return snapshot(0);
 }
 settleOnce();
 return Object.freeze({snapshot,send,nextRound});
}
