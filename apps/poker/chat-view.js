/**
 * Shared chat presentation state for inline/overlay table layouts.
 * Transport independent. This module does not send to Vector or any API.
 */
const MODES=new Set(["inline","drawer"]);
const phrases=new Map([
 ["gl hf",["頑張って、楽しみましょう！","Good luck, have fun!"]],
 ["nice hand!",["いいハンドですね！","Nice hand!"]],
 ["nice hand",["いいハンドですね！","Nice hand!"]],
 ["gg",["お疲れさまでした！","Good game!"]],
 ["brb 1 min",["1分だけ離れます","Be right back in one minute"]],
 ["ty!",["ありがとう！","Thank you!"]],
 ["ok",["了解です","OK"]]
]);
export const QUICK_REPLIES=["gl hf","nice hand","brb 1 min","gg","ty!","ok"];
export function cannedTranslation(text,locale){
 const value=phrases.get(String(text).toLowerCase().trim());
 return value?value[locale==="ja"?0:1]:null;
}
export class ChatViewModel {
 constructor({mode="drawer",limit=120}={}){
  if(!MODES.has(mode))throw new Error("Unknown chat mode");
  this.mode=mode;
  this.opened=false;
  this.limit=limit;
  this.unread=0;
  this.messages=[];
  this.lastPreview=null;
  this.automaticTranslation=false;
 }
 visible(){return this.mode==="inline"||this.opened;}
 setMode(mode){
  if(!MODES.has(mode))throw new Error("Unknown chat mode");
  this.mode=mode;this.opened=false;
  if(this.visible())this.unread=0;
 }
 setOpen(open){
  this.opened=this.mode==="drawer"&&Boolean(open);
  if(this.visible())this.unread=0;
 }
 setTranslation(enabled){this.automaticTranslation=Boolean(enabled);}
 add({id,author,text,own=false,at=Date.now()}){
  if(typeof id!=="string"||!id||typeof author!=="string"||author.length>60||typeof text!=="string"||!text.trim()||text.length>500||!Number.isSafeInteger(at))throw new Error("Invalid chat message");
  if(this.messages.some(m=>m.id===id))return false;
  const msg={id,author,text:text.trim(),own:Boolean(own),at};
  this.messages.push(msg);
  if(this.messages.length>this.limit)this.messages.shift();
  if(!msg.own&&!this.visible()){
   this.unread=Math.min(999,this.unread+1);
   this.lastPreview={author:msg.author,text:msg.text};
  }
  return true;
 }
 displayed(locale){
  return this.messages.map(m=>({...m,translated:this.automaticTranslation?cannedTranslation(m.text,locale):null}));
 }
}
