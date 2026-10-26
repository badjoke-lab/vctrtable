/**
 * Host-trusted WebXDC turn clock. The host supplies wall time and is NOT an
 * independent arbiter. Do not reuse this in the authenticated SDK dealer.
 * A turn key includes journal length so a new street / same actor gets a
 * fresh full turn. Pause freezes only after shared lobby unanimity.
 */
import {legalActions} from "./engine.js";

const finiteTime=n=>Number.isSafeInteger(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
export function validTurnClock(c){
 if(c===null)return true;
 return Boolean(c&&typeof c==="object"&&!Array.isArray(c)&&
  typeof c.key==="string"&&c.key.length>=3&&c.key.length<=450&&
  Number.isSafeInteger(c.seconds)&&c.seconds>=1&&c.seconds<=3600&&
  typeof c.paused==="boolean"&&finiteTime(c.remainingMs)&&
  c.remainingMs<=c.seconds*1000&&
  (c.paused?c.deadlineAt===null:finiteTime(c.deadlineAt)));
}
const currentKey=(session,L)=>[
 session.table.hand.number,session.journal.events.length,L.playerId
].join(":");

export function reconcileTurnClock(session,seconds,paused,previous,now){
 if(!Number.isSafeInteger(seconds)||seconds<0||seconds>3600||
    typeof paused!=="boolean"||!finiteTime(now))
  throw Error("Invalid host clock input");
 const L=legalActions(session.table);
 if(!L||seconds===0)return null;
 const key=currentKey(session,L);
 if(!previous||!validTurnClock(previous)||previous.key!==key||
    previous.seconds!==seconds){
  const remainingMs=seconds*1000;
  return {key,seconds,paused,remainingMs,
   deadlineAt:paused?null:now+remainingMs};
 }
 if(previous.paused===paused)return previous;
 if(paused)return {...previous,paused:true,
  remainingMs:Math.max(0,previous.deadlineAt-now),deadlineAt:null};
 return {...previous,paused:false,deadlineAt:now+previous.remainingMs};
}

export function timeoutAction(session,clock,now){
 if(!finiteTime(now)||clock===null||!validTurnClock(clock)||
    clock.paused||now<clock.deadlineAt)return null;
 const L=legalActions(session.table);
 if(!L||currentKey(session,L)!==clock.key)return null;
 return {playerId:L.playerId,action:L.canCheck?"check":"fold"};
}
