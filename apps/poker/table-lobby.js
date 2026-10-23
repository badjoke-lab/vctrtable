/**
 * Non-secret shared WebXDC table admission state.
 * One XDC message in ONE Vector chat = one shared event stream.
 * Actor claims in payload are NOT cryptographically authenticated, therefore
 * none of this grants access to private cards, dealer actions or money.
 */
const idOk=x=>typeof x==="string"&&x.length>=6&&x.length<=100&&/^[a-zA-Z0-9_-]+$/.test(x);
const actorOk=x=>typeof x==="string"&&x.length>0&&x.length<=300;
const nameOk=x=>typeof x==="string"&&x.trim().length>0&&x.length<=60&&!/[\x00-\x1f\x7f]/.test(x);
const num=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;

export const TABLE_EVENT_KINDS=Object.freeze([
 "table-create","seat-join","seat-leave","seat-ready","table-close"
]);
export function validTableEvent(e){
 if(!e||typeof e!=="object"||Array.isArray(e)||e.v!==2||e.app!=="poker"||
   !TABLE_EVENT_KINDS.includes(e.kind)||!idOk(e.id)||!actorOk(e.by)||
   !num(e.at,0,Number.MAX_SAFE_INTEGER)||!idOk(e.tableId))return false;
 if(e.kind==="table-create")
   return nameOk(e.name)&&num(e.maxPlayers,2,6);
 if(e.kind==="seat-join")return nameOk(e.name);
 if(e.kind==="seat-ready")return typeof e.ready==="boolean";
 return true;
}
export function normalizeTableOrder(entries){
 // The host messenger's serial orders WebXDC updates across participants.
 // Client timestamps must not decide membership when server serials exist.
 return [...entries].sort((a,b)=>{
  if(Number.isSafeInteger(a.serial)&&Number.isSafeInteger(b.serial)&&a.serial!==b.serial)
   return a.serial-b.serial;
  return a.event.at-b.event.at||a.event.id.localeCompare(b.event.id);
 });
}
export function deriveSharedTable(entries){
 let table=null;
 const seats=new Map(),ready=new Set(),accepted=new Set();
 for(const {event:e} of normalizeTableOrder(entries)){
  if(!validTableEvent(e)||accepted.has(e.id))continue;
  accepted.add(e.id);
  if(e.kind==="table-create"){
   if(table)continue;
   table={id:e.tableId,host:e.by,maxPlayers:e.maxPlayers};
   seats.set(e.by,e.name.trim());
   ready.clear();
   continue;
  }
  if(!table||e.tableId!==table.id)continue;
  switch(e.kind){
   case "seat-join":
    if(!seats.has(e.by)&&seats.size<table.maxPlayers)seats.set(e.by,e.name.trim());
    break;
   case "seat-leave":
    if(e.by===table.host){table=null;seats.clear();ready.clear();}
    else {seats.delete(e.by);ready.delete(e.by);}
    break;
   case "seat-ready":
    if(seats.has(e.by)){
      if(e.ready)ready.add(e.by);else ready.delete(e.by);
    }
    break;
   case "table-close":
    if(e.by===table.host){table=null;seats.clear();ready.clear();}
    break;
  }
 }
 return {table,seats,ready};
}
export function tableInvitationText(locale="en"){
 return locale==="ja"?
  "Vectorのポーカー卓に招待します。同じVectorグループチャットに参加して、そのチャットに共有されたPoker Mini Appを開き「Join Table」を押してください。別のDMやNoteでゲームを開いても同じ卓にはなりません。":
  "You're invited to my Vector poker table. Join our SAME Vector group chat, open the Poker Mini App already shared in that chat and tap Join Table. Opening a separate DM or Note does not join the same table.";
}
