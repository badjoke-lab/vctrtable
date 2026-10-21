/**
 * Complete client-side playing-card artwork for the solo QA table.
 * Court cards have self-contained vector portraits; pip cards use traditional
 * individual pip layouts instead of a single rank/suit label.
 * No network image fetches, fonts or third-party assets.
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
function courtPortrait(rank,symbol,red){
 const coat=red?"#a92e36":"#22537b",coat2=red?"#194a7a":"#9e3341",gold="#cc9d36";
 const hair=rank==="Q"?"#493329":rank==="K"?"#70452d":"#352d31";
 const face=rank==="Q"?"#f5d8ad":"#e9bd8b";
 const crown=rank==="J"
  ?'<path d="M27 28 Q50 6 73 28 L69 37 L31 37Z" fill="#ac2539"/><path d="M30 31h40" stroke="#e9c269" stroke-width="5"/>'
  :'<path d="M22 32 L18 15 33 24 50 8 67 24 82 15 78 32Z" fill="#e1b34d" stroke="#7b4825" stroke-width="2"/><circle cx="50" cy="22" r="4" fill="#ba3240"/><circle cx="31" cy="27" r="3" fill="#166f78"/><circle cx="69" cy="27" r="3" fill="#166f78"/>';
 const body=rank==="Q"
   ?'<path d="M16 102L29 72L48 79L70 69L85 102Z" fill="'+coat+'"/><path d="M36 78L50 97L63 76" fill="none" stroke="#e5b454" stroke-width="5"/>'
   :'<path d="M13 105L23 77L39 69L50 92L62 68L79 76L88 105Z" fill="'+coat+'"/><path d="M25 78L50 100L76 77" fill="none" stroke="#e0b34c" stroke-width="5"/>';
 const details=rank==="Q"
   ?'<path d="M38 66Q50 73 62 66L62 81Q50 91 38 81Z" fill="#faf0d0" stroke="#d1a766"/>'
   :'<path d="M41 67Q50 76 59 67L55 87L45 87Z" fill="#f8e8cf" stroke="#b98b45"/>';
 const moustache=rank==="K"
   ?'<path d="M36 62Q44 58 49 64Q55 58 64 62Q61 72 50 68Q39 72 36 62Z" fill="'+hair+'"/><path d="M42 68Q50 83 58 68" fill="'+hair+'"/>'
   :rank==="J"?'<path d="M43 64Q50 69 57 64" stroke="#81543d" fill="none" stroke-width="2"/>':"";
 const staff=rank==="K"
   ?'<path d="M81 39V97" stroke="#f4d06e" stroke-width="4"/><path d="M76 46L81 34L86 46Z" fill="#e5b04d"/>'
   :rank==="Q"?'<path d="M81 45L78 92" stroke="#d9bc69" stroke-width="3"/><circle cx="81" cy="42" r="6" fill="#df587a"/>'
   :'<path d="M81 41L86 96" stroke="#dbb857" stroke-width="3"/><path d="M75 43L82 30L89 43" fill="none" stroke="#dbb857" stroke-width="3"/>';
 const upper='<path d="M12 111L11 26L88 15L90 112Z" fill="#f6e6c2" stroke="#ba9152" stroke-width="1.2"/>'
 +'<path d="M18 104L32 101L24 84L17 82Z" fill="'+coat2+'"/>'+body
 +'<path d="M32 48Q24 41 31 38L34 37Q50 29 67 37Q77 47 69 62L61 70L37 69Q29 62 32 48Z" fill="'+hair+'"/>'
 +'<ellipse cx="50" cy="52" rx="18" ry="21" fill="'+face+'"/>'
 +'<path d="M37 47Q43 44 47 47M53 47Q57 44 63 47" stroke="#513629" stroke-width="2" fill="none"/>'
 +'<circle cx="42" cy="51" r="1.5" fill="#262d2d"/><circle cx="57" cy="51" r="1.5" fill="#262d2d"/>'
 +'<path d="M50 52L47 59L52 60" fill="none" stroke="#aa7356" stroke-width="1.6"/>'
 +'<path d="M44 65Q50 68 56 65" stroke="#8e584a" fill="none" stroke-width="1.4"/>'
 +moustache+details+crown+staff;
 return '<svg class="vcard-court" viewBox="0 0 100 155" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">'
 +'<defs><clipPath id="portrait-cut"><rect x="9" y="14" width="82" height="127" rx="2"/></clipPath></defs>'
 +'<rect x="8" y="13" width="84" height="129" fill="#fff9ea" stroke="'+gold+'" stroke-width="2"/>'
 +'<g clip-path="url(#portrait-cut)">'+upper+'</g>'
 +'<path d="M15 113H85" stroke="'+gold+'" stroke-width="2"/>'
 +'<g transform="translate(100 155) rotate(180)"><path d="M24 25L50 49L76 25" fill="none" stroke="'+coat+'" stroke-width="4"/><path d="M18 27L50 51L82 27" fill="none" stroke="'+gold+'" stroke-width="2"/></g>'
 +'<text x="50" y="130" text-anchor="middle" font-size="18" fill="'+(red?"#aa2734":"#163c5e")+'">'+symbol+'</text>'
 +'</svg>';
}
export function makeCard(code,{hidden=false,empty=false,small=false}={}){
 const el=document.createElement("span");
 el.className="vcard"+(small?" vcard-small":"");
 if(empty||!code){el.className+=" vcard-empty";el.setAttribute("aria-label","Empty community card");return el;}
 if(hidden){
  el.className+=" vcard-back";
  el.innerHTML='<span class="vcard-back-inner" aria-hidden="true">♠</span>';
  el.setAttribute("aria-label","Face-down card");
  return el;
 }
 const m=cardModel(code);
 el.className+=m.red?" vcard-red":" vcard-black";
 el.setAttribute("aria-label",m.rank+" of "+({C:"clubs",D:"diamonds",H:"hearts",S:"spades"}[m.suit]));
 const corner=(bottom=false)=>'<span class="vcard-corner'+(bottom?" vcard-corner-bottom":"")+'"><b>'+ (m.rank==="T"?"10":m.rank)+'</b><em>'+m.symbol+'</em></span>';
 let art;
 if(m.court)art=courtPortrait(m.rank,m.symbol,m.red);
 else if(m.rank==="A")art='<span class="vcard-ace">'+m.symbol+'</span>';
 else art='<span class="vcard-pips">'+m.pips.map(([x,y],i)=>'<span style="left:'+x+'%;top:'+y+'%;'+(y>50?'transform:translate(-50%,-50%) rotate(180)':'')+'" aria-hidden="true">'+m.symbol+'</span>').join("")+'</span>';
 el.innerHTML=corner()+art+corner(true);
 return el;
}
