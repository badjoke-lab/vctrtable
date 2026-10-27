/**
 * Publicly explainable Koi-Koi decisions, with no access to a hidden deck or
 * the opponent's hand. Selection does NOT modify the rules engine.
 */
import {cardById,scoreCards} from "./koikoi.js";

const assertCard = id => {
 const card=cardById(id);
 if(!card)throw new Error("Unknown card: "+id);
 return card;
};
export const matchingFieldCards=(field,handId)=>{
 const month=assertCard(handId).month;
 return field.filter(id=>assertCard(id).month===month);
};
export function capturePreview(captured,field,handId,targetId=null) {
 const matches=matchingFieldCards(field,handId);
 const mustChoose=matches.length===2;
 if(mustChoose && !matches.includes(targetId))
   return {matches,mustChoose,ready:false,taken:[],addedPoints:0,newYaku:[]};
 const taken=matches.length===0?[]:matches.length===3?matches:
   mustChoose?[targetId]:[matches[0]];
 const before=scoreCards(captured);
 const after=taken.length?scoreCards([...captured,handId,...taken]):before;
 const prior=new Set(before.yaku.map(y=>y.key));
 return {matches,mustChoose,ready:true,taken,
  addedPoints:after.points-before.points,
  newYaku:after.yaku.filter(y=>!prior.has(y.key)),
  beforePoints:before.points,afterPoints:after.points};
}
const SPECIAL=[
 ["inoshikacho",["7-1","10-1","6-1"],5],
 ["akatan",["1-2","2-2","3-2"],5],
 ["aotan",["6-2","9-2","10-2"],5],
 ["hanami",["3-1","9-1"],5],
 ["tsukimi",["8-1","9-1"],5]
];
/** Each progress entry represents confirmed OWN captures only. */
export function yakuProgress(captured) {
 const own=new Set(captured);
 const entries=SPECIAL.map(([key,required,points])=>({
  key,have:required.filter(id=>own.has(id)).length,need:required.length,
  missing:required.filter(id=>!own.has(id)),points
 }));
 const cards=captured.map(assertCard);
 const counts={
  h:cards.filter(c=>c.type==="h").length,
  a:cards.filter(c=>c.type==="a").length,
  t:cards.filter(c=>c.type==="t").length,
  k:cards.filter(c=>c.type==="k").length+Number(own.has("9-1"))
 };
 for(const [key,type,need] of [["tane","a",5],["tan","t",5],["kasu","k",10]])
  entries.push({key,have:Math.min(counts[type],need),need,missing:[],points:1,
   total:counts[type]});
 // Bright set progression follows the actual three/four/rain/five tiers.
 // Three Bright excludes the rain card, Four Bright requires the four
 // non-rain brights, and Rain Four requires rain + any three non-rain.
 const nonRain=["1-1","3-1","8-1","12-1"],rain="11-1";
 const n=nonRain.filter(id=>own.has(id)).length,hasRain=own.has(rain);
 entries.push({key:"sanko",have:Math.min(n,3),need:3,missing:[],points:5});
 entries.push({key:"shiko",have:n,need:4,
  missing:nonRain.filter(id=>!own.has(id)),points:8});
 entries.push({key:"ame-shiko",have:Math.min(n,3)+Number(hasRain),need:4,
  missing:hasRain?[]:[rain],points:7});
 entries.push({key:"goko",have:counts.h,need:5,
  missing:["1-1","3-1","8-1","11-1","12-1"].filter(id=>!own.has(id)),points:10});
 return entries.sort((a,b)=>{
  const aDistance=a.need-a.have,bDistance=b.need-b.have;
  if(aDistance!==bDistance)return aDistance-bDistance;
  return b.have-a.have;
 });
}

/**
 * Public-capture threat guide. Only the local player's own private hand is
 * used. The opponent's hidden hand and the deck must never be inspected.
 */
export function publicYakuOutlook(theirCaptured,yourCaptured,yourHand=[]) {
 const mine=new Set(yourCaptured),inHand=new Set(yourHand);
 const counts=(ids,kind)=>ids.reduce((n,id)=>{
  const card=assertCard(id);
  return n+Number(card.type===kind||(kind==="k"&&id==="9-1"));
 },0);
 const all=Array.from({length:12},(_,m)=>
  Array.from({length:4},(_,i)=>(m+1)+"-"+(i+1))).flat();
 const scored=new Set(scoreCards(theirCaptured).yaku.map(y=>y.key));
 return yakuProgress(theirCaptured).map(p=>{
  const missing=p.missing||[];
  const blockedIds=missing.filter(id=>mine.has(id));
  const heldIds=missing.filter(id=>inHand.has(id));
  let impossible=blockedIds.length>0;
  let possibleTotal=null;
  if(p.key==="sanko"||p.key==="shiko"||p.key==="ame-shiko"){
   const nonRain=["1-1","3-1","8-1","12-1"];
   const possible=nonRain.filter(id=>!mine.has(id)).length;
   impossible=p.key==="sanko"?possible<3:
    p.key==="shiko"?possible<4:
     mine.has("11-1")||possible<3;
   possibleTotal=possible;
  }
  if(["tane","tan","kasu"].includes(p.key)) {
   const kind=p.key==="tane"?"a":p.key==="tan"?"t":"k";
   possibleTotal=counts(all,kind)-counts(yourCaptured,kind);
   impossible=possibleTotal<p.need;
  }
  const completed=scored.has(p.key);
  // Three-Bright may appear as 3/3 while Four-Bright / Rain Four-Bright
  // supersedes it. Only the actually scored yaku may say "Completed".
  const superseded=p.have>=p.need&&!completed;
  return {...p,blockedIds,heldIds,impossible,possibleTotal,
   completed,superseded,
   oneAway:p.need-p.have===1&&!impossible&&!superseded};
 });
}
