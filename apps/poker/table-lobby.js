/**
 * Deterministic, PUBLIC-ONLY WebXDC lobby state machine.
 *
 * WebXDC update.payload.by is SELF-ASSERTED and cannot authorize bets or
 * hole-card access. This reducer protects against ordinary stale/duplicate
 * messages and accidental out-of-roster votes; it is NOT authentication.
 * Only the host-issued update.serial is used to order events when available.
 */
const idOk=x=>typeof x==="string"&&x.length>=6&&x.length<=100&&/^[a-zA-Z0-9_-]+$/.test(x);
const actorOk=x=>typeof x==="string"&&x.length>0&&x.length<=300;
const nameOk=x=>typeof x==="string"&&x.trim().length>0&&x.length<=60&&!/[\x00-\x1f\x7f]/.test(x);
const num=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const seatList=x=>Array.isArray(x)&&x.length>=2&&x.length<=6&&
  x.every(actorOk)&&new Set(x).size===x.length;
const noSecretKeys=x=>!["deck","hole","ownHole","nsec","seed","privateKey","verifiedActorId"].some(k=>Object.hasOwn(x,k));
export const TABLE_EVENT_KINDS=Object.freeze([
 "table-create","seat-join","seat-leave","seat-ready","table-close"
]);
const PUBLIC_KINDS=new Set(["rules","vote","pause","pause-vote","chat"]);
export function validTableEvent(e){
 if(!e||typeof e!=="object"||Array.isArray(e)||e.v!==2||e.app!=="poker"||
    !TABLE_EVENT_KINDS.includes(e.kind)||!idOk(e.id)||!actorOk(e.by)||
    !num(e.at,0,Number.MAX_SAFE_INTEGER)||!idOk(e.tableId)||!noSecretKeys(e))return false;
 if(e.kind==="table-create")return nameOk(e.name)&&num(e.maxPlayers,2,6);
 if(e.kind==="seat-join")return nameOk(e.name);
 if(e.kind==="seat-ready")return typeof e.ready==="boolean";
 return true;
}
export function validPublicEvent(e){
 if(!e||typeof e!=="object"||Array.isArray(e)||e.v!==1||e.app!=="poker"||
    !PUBLIC_KINDS.has(e.kind)||!idOk(e.id)||!actorOk(e.by)||!idOk(e.tableId)||
    !num(e.at,0,Number.MAX_SAFE_INTEGER)||!noSecretKeys(e))return false;
 if(e.kind==="chat")return typeof e.text==="string"&&e.text.trim().length>0&&e.text.length<=500;
 if(e.kind==="rules"){
  const s=e.settings;
  return Boolean(s&&typeof s==="object"&&!Array.isArray(s)&&
    num(s.chips,1,100000000)&&num(s.sb,1,100000000)&&
    num(s.bb,2,100000000)&&s.sb<s.bb&&s.bb<s.chips&&
    num(s.timer,0,3600)&&typeof s.rebuy==="boolean"&&seatList(e.seats));
 }
 if(e.kind==="pause")return ["pause","resume"].includes(e.action)&&seatList(e.seats);
 return idOk(e.target);
}
export function normalizeTableOrder(entries){
 // Serial 0 is not valid. WebXDC uses positive serials with possible gaps.
 // Non-serial events must not jump ahead of messages with known host order.
 return [...entries].sort((a,b)=>{
  const left=Number.isSafeInteger(a.serial)&&a.serial>0?a.serial:Number.MAX_SAFE_INTEGER;
  const right=Number.isSafeInteger(b.serial)&&b.serial>0?b.serial:Number.MAX_SAFE_INTEGER;
  if(left!==right)return left-right;
  return a.event.at-b.event.at||a.event.id.localeCompare(b.event.id);
 });
}
function matchesSeats(ids,seats){
 return seatList(ids)&&ids.length===seats.size&&ids.every(id=>seats.has(id));
}
/**
 * A single replay over ALL public events, not independent "last rules" and
 * "all votes" scans. A participant departure invalidates any proposal, all
 * approvals and all readiness even if the same ID later rejoins.
 */
export function deriveSharedTable(entries){
 let table=null,proposal=null,pauseRequest=null,paused=false;
 const seats=new Map(),ready=new Set(),seen=new Set(),messages=[];
 const resetConsent=()=>{
  ready.clear();proposal=null;pauseRequest=null;paused=false;
 };
 const clear=()=>{
  table=null;seats.clear();resetConsent();messages.length=0;
 };
 for(const {event:e} of normalizeTableOrder(entries)){
  if(!(validTableEvent(e)||validPublicEvent(e))||seen.has(e.id))continue;
  seen.add(e.id);
  if(e.kind==="table-create"){
   if(table)continue;
   clear();
   table={id:e.tableId,host:e.by,maxPlayers:e.maxPlayers};
   seats.set(e.by,e.name.trim());
   continue;
  }
  if(!table||e.tableId!==table.id)continue;
  const member=seats.has(e.by);
  switch(e.kind){
   case "seat-join":
    if(!member&&seats.size<table.maxPlayers){
     seats.set(e.by,e.name.trim());resetConsent();
    }
    break;
   case "seat-leave":
    if(member){
     if(e.by===table.host)clear();
     else {seats.delete(e.by);resetConsent();}
    }
    break;
   case "seat-ready":
    if(member){if(e.ready)ready.add(e.by);else ready.delete(e.by);}
    break;
   case "table-close":
    if(e.by===table.host)clear();
    break;
   case "rules":
    if(member&&matchesSeats(e.seats,seats))
     proposal={event:e,approvals:new Set()};
    break;
   case "vote":
    if(member&&proposal&&e.target===proposal.event.id)
     proposal.approvals.add(e.by);
    break;
   case "pause":
    if(member&&!pauseRequest&&matchesSeats(e.seats,seats)&&
       (e.action==="pause"?!paused:paused)){
      pauseRequest={event:e,approvals:new Set([e.by])};
      if(pauseRequest.approvals.size===seats.size){
       paused=e.action==="pause";pauseRequest=null;
      }
    }
    break;
   case "pause-vote":
    if(member&&pauseRequest&&e.target===pauseRequest.event.id){
     pauseRequest.approvals.add(e.by);
     if(pauseRequest.approvals.size===seats.size){
      paused=pauseRequest.event.action==="pause";pauseRequest=null;
     }
    }
    break;
   case "chat":
    if(member){messages.push({by:e.by,text:e.text,id:e.id});if(messages.length>100)messages.shift();}
    break;
  }
 }
 return {table,seats,ready,proposal,pauseRequest,paused,messages};
}
export function tableInvitationText(locale="en"){
 return locale==="ja"?
  "Vectorのポーカー卓に招待します。同じVectorグループチャットに参加して、そのチャットに共有されたPoker Mini Appを開き「Join Table」を押してください。別のDMやNoteでゲームを開いても同じ卓にはなりません。":
  "You're invited to my Vector poker table. Join our SAME Vector group chat, open the Poker Mini App already shared in that chat and tap Join Table. Opening a separate DM or Note does not join the same table.";
}
