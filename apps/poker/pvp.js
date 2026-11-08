/**
 * Experimental host-trusted WebXDC poker. No Vector account authentication.
 * Host alone retains deck in memory. Signatures bind actions to a seat key,
 * but they do not prove an actual Vector account; no real-money wagering.
 */
import {deriveSharedTable,validPublicEvent,validTableEvent} from "./table-lobby.js";
import {seatKeys,publicKeys,signPacket,verifyPacket,newNonce} from "./pvp-crypto.js";
import {makeHostSession,makeStateEvent,readMyHand,makeSignedAction,
 acceptSignedAction,nextHostHand,publicGameState} from "./pvp-game.js";
import {serializeSession,restoreSession,sessionAction} from "./session.js";
import {reconcileTurnClock,timeoutAction} from "./pvp-turn-clock.js";
import {SeatActionOutbox} from "./pvp-action-outbox.js";
import {saveHostCheckpoint,loadHostCheckpoint} from "./pvp-host-checkpoint.js";
import {makeCard} from "./cards.js";
const $=id=>document.getElementById(id),api=window.webxdc;
const live=Boolean(api?.selfAddr&&typeof api.sendUpdate==="function"&&
 typeof api.setUpdateListener==="function"&&globalThis.crypto?.subtle);
const me=live?api.selfAddr:"",updates=new Map(),peers=new Map(),seen=new Set();
let keys=null,hostSession=null,game=null,hole=null,seq=0,turnClock=null,queue=Promise.resolve();
let keySent=false,pending=false,errorMessage="",hostRecovered=false,hostProposalId=null;
let activeTableId=null,outboundInFlight=false;
const actionOutbox=new SeatActionOutbox();
function room(){
 return deriveSharedTable([...updates.values()].map(x=>({event:x.payload,serial:x.serial}))
 .filter(x=>validPublicEvent(x.event)||validTableEvent(x.event)));
}
const unanimous=r=>Boolean(r.table&&r.seats.has(me)&&r.seats.size>=2&&
 r.ready.size===r.seats.size&&r.proposal&&r.proposal.approvals.size===r.seats.size);
function draw(){
 const r=room(),host=r.table?.host===me;
 const root=document.querySelector(".pvp");
 root.classList.toggle("is-playing",Boolean(game));
 root.classList.toggle("is-betting",game?.status==="betting");
 root.classList.toggle("is-complete",game?.status==="complete");
 root.classList.toggle("has-error",Boolean(errorMessage));
 $("pvp-status").textContent=errorMessage||(!live?
 "Secure WebXDC is required (not a local or separate Note session).":
 !r.table?"No shared table. Create one in Lobby first.":
 !r.seats.has(me)?"Join the table in Lobby first.":
 !unanimous(r)?"Everyone must be Ready and approve rules in Lobby.":
 "Experimental host-trusted table; signatures bind only local session keys.");
 $("pvp-ready").textContent=r.table?r.ready.size+"/"+r.seats.size+" Ready":"No table";
 const roster=$("pvp-players");roster.replaceChildren();
 for(const [id,name] of r.seats){
  const element=document.createElement("span");element.className="seat";
  element.textContent=name+(id===r.table?.host?" (host)":"")+
    (id===me?" ★":"")+(peers.has(id)?" 🔒":" — key pending");
  roster.append(element);
 }
 $("pvp-key-status").textContent=!keys?"Generating local private keys…":
 keys.persistent?(hostRecovered?"Host private hand restored from encrypted local journal.":"Nonextractable private keys retained on this device.") :
 "WARNING: private keys could not be saved; do not reload during a game.";
 // Display a manual replay option only for the still-current signed turn.
 // Resending never generates another action nonce or a second bet.
 const retryAllowed=actionOutbox.canRetry({
  tableId:r.table?.id,revision:game?.seq,playerId:me,
  turnId:game?.legal?.playerId,paused:r.paused
 });
 const retryWait=actionOutbox.sentAt!==null&&Date.now()-actionOutbox.sentAt<5000;
 $("pvp-retry").hidden=!retryAllowed;
 $("pvp-retry").disabled=!retryAllowed||outboundInFlight||
  (retryWait&&!actionOutbox.failure);
 $("pvp-delivery").textContent=retryAllowed?
  actionOutbox.failure?
   "Local send error. Resend EXACT signed action; no second bet. / 送信失敗。元の操作を再送できます。":
   "Awaiting updated host state. If delayed, resend the SAME signed action. / 状態更新待ち。遅延時は同じ署名済み操作を再送します。":"";
 const allKeys=r.table&&[...r.seats.keys()].every(id=>peers.has(id));
 const completed=game?.status==="complete";
 $("pvp-start").disabled=!live||!keys||!unanimous(r)||!allKeys||!host||
 pending||hostSession?.table.hand?.status==="betting"||
 (Boolean(game)&&!hostSession);
 $("pvp-start").textContent=completed?"Host: Next hand":"Host: Deal hand";
 $("pvp-game").hidden=!game;
 if(!game)return;
 $("pvp-street").textContent="Hand "+game.number+" · "+game.street.toUpperCase();
 $("pvp-pot").textContent="Pot "+game.pot;
 const seats=$("pvp-table-seats");seats.replaceChildren();
 seats.dataset.opponents=String(game.players.length-1);
 const acting=game.players[game.turn]?.id;
 let position=0;
 for(const p of game.players){
  const own=p.id===me;
  const item=document.createElement("div");
  item.className="pvp-seat"+(own?" is-self":" seat-pos-"+(++position))+
   (p.folded?" is-folded":"")+(acting===p.id?" is-turn":"");
  const avatar=document.createElement("span");avatar.className="pvp-avatar";
  avatar.setAttribute("aria-hidden","true");
  avatar.textContent=(p.name||"?").trim().slice(0,1).toUpperCase();
  const details=document.createElement("span");details.className="pvp-seat-info";
  const name=document.createElement("strong");name.className="pvp-seat-name";
  name.textContent=p.name;
  const stack=document.createElement("span");stack.className="pvp-seat-stack";
  stack.textContent=Number(p.stack).toLocaleString("en-US");
  const flag=document.createElement("span");flag.className="pvp-seat-flag";
  flag.textContent=p.folded?"FOLDED":acting===p.id?"● TURN":"";
  details.append(name,stack,flag);item.append(avatar,details);
  item.setAttribute("aria-label",p.name+" · "+p.stack+
   (p.folded?" folded":"")+(acting===p.id?" acting":""));
  seats.append(item);
 }
 const self=game.players.find(p=>p.id===me);
 $("pvp-hero-name").textContent=self?.name||"You";
 $("pvp-hero-stack").textContent=self?Number(self.stack).toLocaleString("en-US"):"—";
 const board=$("pvp-board");board.replaceChildren();
 for(const card of game.board)board.append(makeCard(card));
 for(let i=game.board.length;i<5;i++){
  const slot=document.createElement("span");slot.className="pvp-empty";
  slot.setAttribute("aria-hidden","true");board.append(slot);
 }
 const own=$("pvp-hole");own.replaceChildren();
 for(const c of (hole?.length===2?hole:["BACK","BACK"]))
  own.append(c==="BACK"?makeCard("AS",{hidden:true}):makeCard(c));
 const L=game.legal,turn=game.status==="betting"&&L?.playerId===me;
 const clock=game.turnClock,secondsLeft=clock&&!clock.paused&&
  Number.isSafeInteger(clock.deadlineAt)?
  Math.max(0,Math.ceil((clock.deadlineAt-Date.now())/1000)):null;
 $("pvp-turn").textContent=game.status==="complete"?"Hand complete":
  (turn?"YOUR TURN":"Waiting for "+(game.players[game.turn]?.name||"other player"))+
  (clock?.paused?" · CLOCK PAUSED":secondsLeft===null?"": " · host clock ~"+secondsLeft+"s");
 const blocked=!turn||pending||Boolean(actionOutbox.packet)||r.paused||!unanimous(r)||(host&&game.status==="betting"&&!hostSession);
 for(const name of ["fold","check","call","raise"])
  $("pvp-"+name).disabled=blocked||(name==="check"&&!L?.canCheck)||
   (name==="call"&&!L?.canCall)||(name==="raise"&&!L?.canRaise);
 $("pvp-call").textContent="Call "+(L?.toCall??0);
 const amount=$("pvp-raise-amount");amount.disabled=blocked||!L?.canRaise;
 if(turn&&L?.canRaise&&document.activeElement!==amount){
  amount.min=String(L.shortAllInOnly?L.maxRaiseTo:L.minRaiseTo);
  amount.max=String(L.maxRaiseTo);
  amount.value=String(L.shortAllInOnly?L.maxRaiseTo:L.minRaiseTo);
 }
 $("pvp-result").textContent=game.status==="complete"?
  game.players.map((p,i)=>p.name+": "+(game.awards?.[i]??0)+" awarded").join(" · "):
  r.paused?"Paused unanimously; betting controls locked.":"";
}
function fail(err){errorMessage=err?.message||String(err);pending=false;draw();}
const send=e=>{if(!live)throw Error("WebXDC not connected");return Promise.resolve(api.sendUpdate({payload:e,info:""},""));};
async function enroll(){
 const r=room();
 if(!r.table||!r.seats.has(me)||keySent||!keys)return;
 const pub=await publicKeys(keys);
 const prior=peers.get(me);
 if(prior){
  if(JSON.stringify(pub)!==JSON.stringify(prior))throw Error("Session signing key changed unexpectedly");
  keySent=true;return;
 }
 keySent=true;
 try{await send(await signPacket(keys,{v:1,app:"vctrtable-pvp",kind:"seat-key",
  id:newNonce(),by:me,tableId:r.table.id,keys:pub}));}
 catch(err){keySent=false;throw err;}
}
async function updateState(packet,r){
 if(packet.by!==r.table.host||!peers.has(r.table.host)||!r.seats.has(me))return;
 if(!await verifyPacket(packet,peers.get(r.table.host).sign))return;
 const state=packet.state;
 if(!state||!Number.isSafeInteger(state.seq)||state.seq<=seq)return;
 if(!Array.isArray(state.players)||state.players.length!==r.seats.size||
    !state.players.every(p=>r.seats.has(p.id)))throw Error("Game roster does not match lobby");
 const own=await readMyHand({packet,keys,hostPublic:peers.get(r.table.host),me});
 // Only the host can restore the full-deck journal, and only when the
 // encrypted device checkpoint EXACTLY matches the signed shared snapshot,
 // the current roster and the unanimously agreed proposal.
 if(r.table.host===me&&!hostSession){
  const cp=await loadHostCheckpoint(r.table.id);
  if(cp&&cp.seq===state.seq){
   const roster=[...r.seats.keys()].sort();
   if(cp.proposalId!==r.proposal?.event.id||
      JSON.stringify(cp.roster)!==JSON.stringify(roster))
    throw Error("Host checkpoint roster or rules changed; hand cannot resume");
   const restored=restoreSession(cp.journal);
   if(JSON.stringify(publicGameState(restored,cp.seq,cp.turnClock))!==JSON.stringify(state))
    throw Error("Host checkpoint does not match the shared signed state");
   hostSession=restored;
   turnClock=cp.turnClock??null;
   hostProposalId=cp.proposalId;
   hostRecovered=true;
  }
 }
 actionOutbox.acknowledge(r.table.id,state.seq);
 seq=state.seq;game={...state,_room:r.table.id};hole=own;
 errorMessage="";pending=false;draw();
}
async function accept(update){
 const e=update?.payload,serial=update?.serial;
 if(!e||!Number.isSafeInteger(serial)||serial<1||typeof e.id!=="string"||seen.has(e.id))return;
 seen.add(e.id);
 if(validTableEvent(e)||validPublicEvent(e)){
  updates.set(e.id,{payload:e,serial});
  const r=room();
  // The shared XDC stream can contain a succession of completed tables.
  // Seat keys and local authorizations are scoped to one table only.
  // Keeping old peers or keySent after close/recreate can mistakenly enroll
  // the next table with the previous roster and block a fresh key exchange.
  const nextTableId=r.table?.id??null;
  if(nextTableId!==activeTableId){
   activeTableId=nextTableId;
   peers.clear();keySent=false;actionOutbox.reset();outboundInFlight=false;
   game=null;hole=null;hostSession=null;turnClock=null;seq=0;
   hostProposalId=null;hostRecovered=false;pending=false;errorMessage="";
  }
  if(hostSession?.table.hand?.status==="betting"){
   const before=hostSession.table.players.map(p=>p.id).sort().join("|");
   if(before!==[...r.seats.keys()].sort().join("|")||
      hostProposalId!==r.proposal?.event.id){
    hostSession=null;errorMessage="Seats or agreed rules changed; host hand stopped.";
   }
  }
  await enroll();
  // A fully approved pause/resume changes the *host* deadline. A request
  // awaiting votes does not. Publish the signed new clock and checkpoint.
  if(hostSession&&r.table?.host===me&&unanimous(r)&&
     hostProposalId===r.proposal.event.id){
   // An approval arriving AFTER the running turn's deadline must not
   // retroactively pause an expired action. Resolve the old deadline first.
   const expired=timeoutAction(hostSession,turnClock,Date.now());
   if(expired){
    sessionAction(hostSession,expired.playerId,expired.action);
    await publish();
   }else{
    const next=reconcileTurnClock(hostSession,r.proposal.event.settings.timer,
     r.paused,turnClock,Date.now());
    if(JSON.stringify(next)!==JSON.stringify(turnClock)){
     turnClock=next;await publish();
    }
   }
  }
  draw();return;
 }
 if(e.app!=="vctrtable-pvp"||e.v!==1)return;
 const r=room();
 if(!r.table||e.tableId!==r.table.id)return;
 if(e.kind==="seat-key"){
  if(!r.seats.has(e.by)||peers.has(e.by)||!e.keys?.sign||!e.keys?.dh)return;
  if(!await verifyPacket(e,e.keys.sign))return;
  peers.set(e.by,e.keys);await enroll();draw();return;
 }
 if(e.kind==="state"){await updateState(e,r);return;}
 if(e.kind==="action"&&r.table.host===me){
  // A signed action must not vanish without an observable host-side reason.
  // The sending seat may otherwise remain pending forever on a broken room.
  if(!hostSession||r.paused||!unanimous(r)||
     hostProposalId!==r.proposal?.event.id){
   errorMessage="Action not processed: host session unavailable, paused or rules changed.";
   draw();return;
  }
  try{
   // Delivery after a host deadline cannot beat a timeout merely because
   // the interval callback has not executed yet.
   await hostTick(r);
   await acceptSignedAction({packet:e,session:hostSession,peers,
    tableId:r.table.id,revision:seq});
   await publish();
  }catch(err){errorMessage="Rejected player action: "+err.message;draw();}
 }
}
async function publish(){
 const r=room();
 if(!hostSession||r.table?.host!==me||!unanimous(r))
  throw Error("Only an approved host may publish");
 turnClock=reconcileTurnClock(hostSession,r.proposal.event.settings.timer,
  r.paused,turnClock,Date.now());
 const packet=await makeStateEvent({session:hostSession,keys,host:me,
  tableId:r.table.id,peers,seq:seq+1,turnClock});
 // Commit full deck LOCALLY, under AES-GCM, before publishing anything.
 // If the browser cannot persist the checkpoint, do not deal a new hand.
 await saveHostCheckpoint({tableId:r.table.id,seq:packet.state.seq,
  roster:[...r.seats.keys()],proposalId:r.proposal.event.id,
  journal:serializeSession(hostSession),turnClock});
 // Host also renders its own state immediately; shared echo may arrive later.
 await send(packet);
 await updateState(packet,r);
}
async function hostTick(r=room()){
 if(!hostSession||r.table?.host!==me||!unanimous(r)||
    hostProposalId!==r.proposal.event.id)return false;
 const next=reconcileTurnClock(hostSession,r.proposal.event.settings.timer,
  r.paused,turnClock,Date.now());
 if(JSON.stringify(next)!==JSON.stringify(turnClock)){
  turnClock=next;await publish();return false;
 }
 const due=timeoutAction(hostSession,turnClock,Date.now());
 if(!due)return false;
 // The regular session journal records the deterministic forced check/fold.
 sessionAction(hostSession,due.playerId,due.action);
 await publish();
 return true;
}
$("pvp-start").addEventListener("click",async()=>{
 try{
  const r=room();
  if(!unanimous(r)||r.table.host!==me||![...r.seats.keys()].every(id=>peers.has(id)))
   throw Error("Not all players have agreed or enrolled keys");
  if(!hostSession){
   if(game)throw Error("Old host session is unavailable; refusing to reset chips or re-deal");
   hostSession=makeHostSession(r);
   hostProposalId=r.proposal.event.id;
  }
  if(hostProposalId!==r.proposal.event.id)
   throw Error("Approved rules changed. Close this table and create a new session.");
  if(hostSession.table.hand?.status==="betting")throw Error("Hand is already running");
  pending=true;draw();nextHostHand(hostSession);await publish();
 }catch(err){fail(err);}
});
async function transmitOwnAction(){
 if(outboundInFlight)return;
 outboundInFlight=true;pending=true;errorMessage="";draw();
 try{
  await actionOutbox.transmit(send);
 }catch(err){
  // A rejected WebXDC promise is not a confirmed dealer action.
  // Keep the original signed packet for explicit retry.
  errorMessage="Local action send failed: "+(err?.message||String(err));
  pending=false;
 }finally{outboundInFlight=false;draw();}
}
async function playerAction(action){
 try{
  const r=room(),L=game?.legal;
  if(!unanimous(r)||r.paused||!L||L.playerId!==me||pending||
     actionOutbox.packet)throw Error("Not your turn, or previous action still pending");
  const target=action==="raise"?Number($("pvp-raise-amount").value):undefined;
  const packet=await makeSignedAction(keys,{me,tableId:r.table.id,
   revision:game.seq,action,target});
  actionOutbox.prepare(packet);
  await transmitOwnAction();
 }catch(err){fail(err);}
}
$("pvp-retry").addEventListener("click",async()=>{
 const r=room();
 if(!actionOutbox.canRetry({
  tableId:r.table?.id,revision:game?.seq,playerId:me,
  turnId:game?.legal?.playerId,paused:r.paused
 }))return;
 await transmitOwnAction();
});
for(const action of ["fold","check","call","raise"])
 $("pvp-"+action).addEventListener("click",()=>playerAction(action));
if(live){
 seatKeys("seat:"+me).then(local=>{
  keys=local;
  api.setUpdateListener(update=>{queue=queue.then(()=>accept(update)).catch(fail);},0);
  draw();
 }).catch(fail);
}else errorMessage="Secure Vector WebXDC was not available in this view.";
// Serialized with incoming WebXDC events; never let interval ticks race an
// accepted action. Background WebViews can suspend timers: upon resuming,
// expired actions are still checked against the persisted host deadline.
setInterval(()=>{
 queue=queue.then(()=>hostTick()).catch(fail);
 draw();
},1000);
draw();
