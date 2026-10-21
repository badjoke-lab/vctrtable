/**
 * Playing-card renderer for the mobile table.
 *
 * The actual graphics (all 52 faces, including 12 DISTINCT J/Q/K court
 * portraits) come from the bundled CardMeister FULL SVG deck (Unlicense).
 * No generated unicode fonts, external CDN calls or handwritten court faces.
 */
export const SUIT_SYMBOLS={C:"♣",D:"♦",H:"♥",S:"♠"};
const RED=new Set(["D","H"]);
const PIPS={
  2:[[50,27],[50,73]],
  3:[[50,20],[50,50],[50,80]],
  4:[[27,24],[73,24],[27,76],[73,76]],
  5:[[27,24],[73,24],[50,50],[27,76],[73,76]],
  6:[[27,20],[73,20],[27,50],[73,50],[27,80],[73,80]],
  7:[[27,20],[73,20],[50,34],[27,50],[73,50],[27,80],[73,80]],
  8:[[27,20],[73,20],[50,35],[27,50],[73,50],[50,65],[27,80],[73,80]],
  9:[[27,18],[73,18],[27,39],[73,39],[50,50],[27,61],[73,61],[27,82],[73,82]],
  T:[[27,16],[73,16],[50,29],[27,39],[73,39],[27,61],[73,61],[50,72],[27,84],[73,84]]
};
export function cardModel(code){
 if(typeof code!=="string"||!/^[2-9TJQKA][CDHS]$/.test(code))throw new Error("Invalid card artwork code");
 return {rank:code[0],suit:code[1],symbol:SUIT_SYMBOLS[code[1]],red:RED.has(code[1]),pips:PIPS[code[0]]??null,court:"JQK".includes(code[0])};
}
export function makeCard(code,{hidden=false,empty=false,small=false}={}){
 if(empty||!code){
  const el=document.createElement("span");
  el.className="vcard vcard-empty"+(small?" vcard-small":"");
  el.setAttribute("aria-label","Empty community card");
  return el;
 }
 if(!hidden)cardModel(code);
 const el=document.createElement("playing-card");
 el.className="vcard vcard-illustrated"+(small?" vcard-small":"")+(hidden?" vcard-back":"");
 el.setAttribute("cid",hidden?"FS":code);
 el.setAttribute("aria-label",hidden?"Face-down card":code[0]+" of "+({C:"clubs",D:"diamonds",H:"hearts",S:"spades"}[code[1]]));
 // Each instance is an actual SVG rendered locally by the bundled
 // CardMeister full deck. Use no insecure innerHTML or remote image URLs.
 return el;
}
