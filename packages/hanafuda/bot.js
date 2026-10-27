/**
 * Deterministic LOCAL QA opponent. Chooses legal plays from its OWN hand,
 * public field and public captures only. It never inspects player hand or deck.
 * This is a readable heuristic, not a perfect-information solver.
 */
import {cardById,scoreCards} from "./koikoi.js";
import {capturePreview,matchingFieldCards,yakuProgress,publicYakuOutlook} from "./guide.js";

const VALUES={h:14,a:8,t:5,k:1};
const GRADE={inoshikacho:13,akatan:11,aotan:11,hanami:8,tsukimi:8,
 sanko:10,shiko:10,"ame-shiko":10,goko:12,tane:3,tan:3,kasu:2};

function threatsAgainst(captured,oppCaptured,hand){
 return publicYakuOutlook(oppCaptured,captured,hand).filter(p=>
  p.have>0&&!p.impossible&&!p.completed&&!p.superseded);
}
function opponentRisk(threats,id){
 return threats.reduce((sum,p)=>{
  if(!p.missing.includes(id))return sum;
  return sum+(p.oneAway?GRADE[p.key]*3:Math.round(GRADE[p.key]*0.6));
 },0);
}
function ownProgressDelta(before,after){
 const m=new Map(before.map(p=>[p.key,p.have]));
 return after.reduce((n,p)=>{
  const delta=p.have-(m.get(p.key)||0);
  return delta>0?n+Math.min(3,delta)*GRADE[p.key]:n;
 },0);
}
export function chooseBotMove({hand,field,captured,opponentCaptured}){
 if(!Array.isArray(hand)||!hand.length)throw Error("Bot has no hand");
 const threats=threatsAgainst(captured,opponentCaptured,hand);
 const before=yakuProgress(captured);
 const scored=scoreCards(captured).points;
 const options=[];
 for(const id of hand){
  const card=cardById(id);
  if(!card)throw Error("Unknown bot hand card: "+id);
  const matches=matchingFieldCards(field,id);
  const targets=matches.length===2?matches:[null];
  for(const targetId of targets){
   const outcome=capturePreview(captured,field,id,targetId);
   if(!outcome.ready)continue;
   const obtained=outcome.taken.length?[id,...outcome.taken]:[];
   const after=obtained.length?yakuProgress([...captured,...obtained]):before;
   let value=(outcome.afterPoints-scored)*70+
    ownProgressDelta(before,after);
   value+=obtained.reduce((n,x)=>n+VALUES[cardById(x).type],0);
   value+=obtained.reduce((n,x)=>n+opponentRisk(threats,x),0);
   if(!obtained.length){
    value-=VALUES[card.type]*1.8;
    // Giving away a critical unique card helps the opponent.
    value-=opponentRisk(threats,id)*1.8;
   }
   // Preserve deterministic reproducibility for the local QA.
   options.push({cardId:id,targetId,value,
    capturedCards:obtained,immediatePoints:outcome.afterPoints-scored});
  }
 }
 options.sort((a,b)=>b.value-a.value||
  a.cardId.localeCompare(b.cardId,"en")||
  String(a.targetId).localeCompare(String(b.targetId),"en"));
 return options[0];
}
export function chooseBotDecision({points,hand,opponentCaptured,captured}){
 if(points<=0)throw Error("Cannot decide Koi-Koi without a scored yaku");
 if(points>=5||hand.length<=2)return "stop";
 const threats=threatsAgainst(captured,opponentCaptured,hand);
 if(threats.some(p=>p.oneAway&&GRADE[p.key]>=8))return "stop";
 if(points>=3&&hand.length<=3)return "stop";
 return "koi";
}
