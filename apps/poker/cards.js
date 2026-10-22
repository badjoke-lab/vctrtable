/**
 * Each visible card IS a single complete PNG <img> with zero child nodes.
 * No outer CSS border, rank/suit overlay, SVG/card custom elements or external URL.
 */
export const SUIT_SYMBOLS={C:"♣",D:"♦",H:"♥",S:"♠"};
const SUIT_NAMES={C:"clubs",D:"diamonds",H:"hearts",S:"spades"};
export function cardModel(code){
 if(typeof code!=="string"||!/^[2-9TJQKA][CDHS]$/.test(code))
  throw new Error("Invalid card artwork code");
 const rank=code[0],suit=code[1];
 return {code,rank,suit,symbol:SUIT_SYMBOLS[suit],red:"DH".includes(suit),court:"JQK".includes(rank)};
}
export function cardPngPath(code){
 if(code==="BACK")return "./card-png/BACK.png";
 return "./card-png/"+cardModel(code).code+".png";
}
export function makeCard(code,{hidden=false,empty=false,small=false}={}){
 if(empty||!code){
  const blank=document.createElement("span");
  blank.className="vcard vcard-empty"+(small?" vcard-small":"");
  blank.setAttribute("aria-label","Empty community card");
  return blank;
 }
 // One complete PNG IS the card. No wrapper, CSS frame, overlays, suit
 // glyphs or other child nodes: corners and all artwork belong to the image.
 const model=cardModel(code);
 const img=document.createElement("img");
 img.className="vcard vcard-illustrated"+(small?" vcard-small":"")+(hidden?" vcard-back":"");
 img.setAttribute("data-card",hidden?"BACK":model.code);
 img.src=cardPngPath(hidden?"BACK":model.code);
 img.alt=hidden?"Face-down card":model.rank+" of "+SUIT_NAMES[model.suit];
 img.width=240;
 img.height=336;
 img.decoding="async";
 img.draggable=false;
 return img;
}
