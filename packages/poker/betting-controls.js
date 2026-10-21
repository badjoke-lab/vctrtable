/**
 * Pure betting-controls adapter shared by solo QA and future authenticated PvP.
 * A raise target is the player's TOTAL wager on the current street, not
 * the extra chips to add. Calling may be a short all-in.
 */
export function bettingControls(legal,{pot=0,currentBet=0}={}){
 if(!legal)return {callAmount:0,isAllInCall:false,allIn:null,presets:null};
 const {stack,toCall,canCall,canRaise,minRaiseTo,maxRaiseTo}=legal;
 if(![stack,toCall,minRaiseTo,maxRaiseTo,pot,currentBet].every(x=>Number.isSafeInteger(x)&&x>=0))throw new Error("Invalid legal betting values");
 const callAmount=canCall?Math.min(toCall,stack):0;
 const isAllInCall=Boolean(canCall&&stack>0&&toCall>=stack);
 const allIn=canRaise?{kind:"raise",target:maxRaiseTo}:
    isAllInCall?{kind:"call",target:null}:null;
 let presets=null;
 if(canRaise){
  const min=Math.min(minRaiseTo,maxRaiseTo);
  const clamp=n=>Math.max(min,Math.min(maxRaiseTo,n));
  presets={
   min,
   half:clamp(currentBet+Math.ceil((pot+toCall)/2)),
   pot:clamp(currentBet+pot+toCall),
   max:maxRaiseTo
  };
 }
 return {callAmount,isAllInCall,allIn,presets};
}
