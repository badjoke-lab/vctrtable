/**
 * Explicitly opt-in PUBLIC WebXDC text-chat transport for the poker UI.
 *
 * WebXDC sendUpdate broadcasts to EVERY member of the current chat.
 * The only outbound data is a strict text-only allowlist. No card, deck,
 * bet, session journal, wallet key, or private dealer state is ever sent.
 *
 * This is NOT the private PvP transport.
 */
export const PUBLIC_CHAT_KIND="vctrtable-public-chat-v1";
const exact=(obj,names)=>Boolean(obj)&&typeof obj==="object"&&!Array.isArray(obj)&&
  Object.keys(obj).sort().join("|")===names.slice().sort().join("|");
const id=s=>typeof s==="string"&&/^[a-f0-9]{32}$/.test(s);
const nick=s=>typeof s==="string"&&s.length>0&&s.length<=60;
const validText=s=>typeof s==="string"&&s.trim().length>0&&s.length<=500&&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);
const idFactory=random=>{
 if(!random||typeof random.getRandomValues!=="function")throw new Error("Secure randomness unavailable");
 const bytes=new Uint8Array(16);random.getRandomValues(bytes);
 return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
};
export function parsePublicChatUpdate(update){
 const p=update?.payload;
 if(!exact(p,["app","kind","v","id","text","nickname","at"])||
    p.app!=="poker"||p.kind!==PUBLIC_CHAT_KIND||p.v!==1||
    !id(p.id)||!validText(p.text)||!nick(p.nickname)||
    !Number.isSafeInteger(p.at)||p.at<0)return null;
 const sender=typeof update.sender==="string"?update.sender:null;
 const serial=Number.isSafeInteger(update.serial)&&update.serial>0?update.serial:null;
 return {id:p.id,sender,nickname:p.nickname,text:p.text.trim(),at:p.at,serial};
}
export function createPublicChatTransport({api,receive,random=globalThis.crypto,clock=()=>Date.now()}={}){
 if(typeof receive!=="function")throw new Error("Chat receiver required");
 const available=Boolean(api&&typeof api.sendUpdate==="function"&&typeof api.setUpdateListener==="function");
 const selfAddr=typeof api?.selfAddr==="string"?api.selfAddr:null;
 const nickname=nick(api?.selfName)?api.selfName:"Player";
 const outgoing=new Set();
 let subscribed=false;
 return {
  available,
  subscribe(){
   if(!available||subscribed)return false;
   subscribed=true;
   api.setUpdateListener(update=>{
    const msg=parsePublicChatUpdate(update);
    if(!msg)return;
    const own=outgoing.has(msg.id)||(selfAddr!==null&&msg.sender===selfAddr);
    outgoing.delete(msg.id);
    receive({...msg,own});
   },0);
   return true;
  },
  async send(text){
   if(!available)throw new Error("WebXDC chat transport unavailable");
   if(!validText(text))throw new Error("Invalid public chat text");
   const e={app:"poker",kind:PUBLIC_CHAT_KIND,v:1,
    id:idFactory(random),text:text.trim(),nickname,at:clock()};
   if(!Number.isSafeInteger(e.at)||e.at<0)throw new Error("Invalid send time");
   outgoing.add(e.id);
   try{
    await api.sendUpdate({payload:e},"Poker chat message");
   }catch(error){outgoing.delete(e.id);throw error;}
   return e.id;
  }
 };
}
