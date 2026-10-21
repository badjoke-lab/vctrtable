/**
 * Full 52-card SVG deck (CardMeister FULL, Unlicense).
 * Bundled cardmeister.full.js renders all real faces including distinct
 * J/Q/K figures. No external CDN or Unicode suit overlay is required.
 */
export const SUIT_SYMBOLS={C:"♣",D:"♦",H:"♥",S:"♠"};
const NAMES={C:"clubs",D:"diamonds",H:"hearts",S:"spades"};
export function cardModel(code){
 if(typeof code!=="string"||!/^[2-9TJQKA][CDHS]$/.test(code))
  throw new Error("Invalid card artwork code");
 return {code,rank:code[0],suit:code[1],symbol:SUIT_SYMBOLS[code[1]],red:"DH".includes(code[1]),court:"JQK".includes(code[0])};
}
export function makeCard(code,{hidden=false,empty=false,small=false}={}){
 if(empty||!code){
  const el=document.createElement("span");
  el.className="vcard vcard-empty"+(small?" vcard-small":"");
  el.setAttribute("aria-label","Empty community card");
  return el;
 }
 const model=cardModel(code);
 const el=document.createElement("playing-card");
 el.className="vcard vcard-illustrated"+(small?" vcard-small":"")+(hidden?" vcard-back":"");
 // CardMeister's official face-down CID is FS (not "back").
 el.setAttribute("cid",hidden?"FS":model.code);
 el.setAttribute("aria-label",hidden?"Face-down card":model.rank+" of "+NAMES[model.suit]);
 return el;
}
