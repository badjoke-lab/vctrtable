/**
 * Full 52-face traditional PNG deck: actual raster assets ship with poker.xdc.
 * No SVG/card custom elements, remote URL, or runtime image conversion.
 */
export const SUIT_SYMBOLS={C:"♣",D:"♦",H:"♥",S:"♠"};
const SUIT_NAMES={C:"clubs",D:"diamonds",H:"hearts",S:"spades"};
const SUIT_FILES={C:"club",D:"diamond",H:"heart",S:"spade"};
const RANK_FILES={A:"Ace",K:"King",Q:"Queen",J:"Jack",T:"10"};
export function cardModel(code){
 if(typeof code!=="string"||!/^[2-9TJQKA][CDHS]$/.test(code))
  throw new Error("Invalid card artwork code");
 const rank=code[0],suit=code[1];
 return {code,rank,suit,symbol:SUIT_SYMBOLS[suit],red:"DH".includes(suit),court:"JQK".includes(rank)};
}
export function cardPngPath(code){
 if(code==="BACK")return "./card-png/blueBack.png";
 const {rank,suit}=cardModel(code);
 return "./card-png/"+SUIT_FILES[suit]+(RANK_FILES[rank]||rank)+".png";
}
export function makeCard(code,{hidden=false,empty=false,small=false}={}){
 if(empty||!code){
  const blank=document.createElement("span");
  blank.className="vcard vcard-empty"+(small?" vcard-small":"");
  blank.setAttribute("aria-label","Empty community card");
  return blank;
 }
 const model=cardModel(code);
 const el=document.createElement("span");
 el.className="vcard vcard-illustrated"+(small?" vcard-small":"")+(hidden?" vcard-back":"");
 el.setAttribute("data-card",hidden?"BACK":model.code);
 el.setAttribute("aria-label",hidden?"Face-down card":model.rank+" of "+SUIT_NAMES[model.suit]);
 const img=document.createElement("img");
 img.src=cardPngPath(hidden?"BACK":model.code);
 img.alt="";
 img.decoding="async";
 img.draggable=false;
 el.append(img);
 return el;
}
