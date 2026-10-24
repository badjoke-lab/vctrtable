/**
 * Experimental host-trusted WebXDC poker. No Vector account authentication.
 * Host alone retains deck in memory. Signatures bind actions to a seat key,
 * but they do not prove an actual Vector account; no real-money wagering.
 */
import {deriveSharedTable,validPublicEvent,validTableEvent} from "./table-lobby.js";
import {seatKeys,publicKeys,signPacket,verifyPacket,newNonce} from "./pvp-crypto.js";
import {makeHostSession,makeStateEvent,readMyHand,makeSignedAction,
 acceptSignedAction,nextHostHand,publicGameState} from "./pvp-game.js";
import {serializeSession,restoreSession} from "./session.js";
import {saveHostCheckpoint,loadHostCheckpoint} from "./pvp-host-checkpoint.js";
import {makeCard} from "./cards.js";
const $=id=>document.getElementById(id),api=window.webxdc;
const live=Boolean(api?.selfAddr&&typeof api.sendUpdate==="function"&&
 typeof api.setUpdateListener==="function"&&globalThis.crypto?.subtle);
const me=live?api.selfAddr:"",updates=new Map(),peers=new Map(),seen=new Set();
let keys=null,hostSession=null,game=null,hole=null,seq=0,queue=Promise.resolve();
let keySent=false,pending=false,errorMessage="",hostRecovered=false;
function room(){
 return deriveSharedTable([...updates.values()].map(x=>({event:x.payload,serial:x.serial}))
 .filter(x=>validPublicEvent(x.event)||validTableEvent(x.event)));
}
const unanimous=r=>Boolean(r.table&&r.seats.has(me)&&r.seats.size>=2&&
 r.ready.size===r.seats.size&&r.proposal&&r.proposal.approvals.size===r.seats.size);
function draw(){
 const r=room(),host=r.table?.host===me;
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
 for(const p of game.players){
  const item=document.createElement("span");item.className="seat";
  item.textContent=p.name+" · "+p.stack+(p.folded?" (Folded)":"")+
   (game.players[game.turn]?.id===p.id?" · TURN":"");
  seats.append(item);
 }
 const board=$("pvp-board");board.replaceChildren();
 for(const card of game.board)board.append(makeCard(card));
 const own=$("pvp-hole");own.replaceChildren();
 for(const c of (hole?.length===2?hole:["BACK","BACK"]))
  own.append(c==="BACK"?makeCard("AS",{hidden:true}):makeCard(c));
 const L=game.legal,turn=game.status==="betting"&&L?.playerId===me;
 $("pvp-turn").textContent=game.status==="complete"?"Hand complete":
 turn?"YOUR TURN":"Waiting for "+(game.players[game.turn]?.name||"other player");
 const blocked=!turn||pending||r.paused||(host&&game.status==="betting"&&!hostSession);
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
const send=e=>{if(!live)throw Error("WebXDC not connected");api.sendUpdate({payload:e,info:""},"");};
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
 try{send(await signPacket(keys,{v:1,app:"vctrtable-pvp",kind:"seat-key",
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
   if(JSON.stringify(publicGameState(restored,cp.seq))!==JSON.stringify(state))
    throw Error("Host checkpoint does not match the shared signed state");
   hostSession=restored;
   hostRecovered=true;
  }
 }
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
  if(game&&r.table?.id!==game._room){game=null;hole=null;hostSession=null;seq=0;}
  if(hostSession?.table.hand?.status==="betting"){
   const before=hostSession.table.players.map(p=>p.id).sort().join("|");
   if(before!==[...r.seats.keys()].sort().join("|")){
    hostSession=null;errorMessage="Seat membership changed; host hand aborted.";
   }
  }
  await enroll();draw();return;
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
 if(e.kind==="action"&&r.table.host===me&&hostSession&&!r.paused){
  try{
   await acceptSignedAction({packet:e,session:hostSession,peers,
    tableId:r.table.id,revision:seq});
   await publish();
  }catch(err){errorMessage="Rejected player action: "+err.message;draw();}
 }
}
async function publish(){
 const r=room();
 if(!hostSession||r.table?.host!==me)throw Error("Only host may deal");
 const packet=await makeStateEvent({session:hostSession,keys,host:me,
  tableId:r.table.id,peers,seq:seq+1});
 // Commit full deck LOCALLY, under AES-GCM, before publishing anything.
 // If the browser cannot persist the checkpoint, do not deal a new hand.
 await saveHostCheckpoint({tableId:r.table.id,seq:packet.state.seq,
  roster:[...r.seats.keys()],proposalId:r.proposal.event.id,
  journal:serializeSession(hostSession)});
 // Host also renders its own state immediately; shared echo may arrive later.
 send(packet);
 await updateState(packet,r);
}
$("pvp-start").addEventListener("click",async()=>{
 try{
  const r=room();
  if(!unanimous(r)||r.table.host!==me||![...r.seats.keys()].every(id=>peers.has(id)))
   throw Error("Not all players have agreed or enrolled keys");
  if(!hostSession){
   if(game)throw Error("Old host session is unavailable; refusing to reset chips or re-deal");
   hostSession=makeHostSession(r);
  }
  if(hostSession.table.hand?.status==="betting")throw Error("Hand is already running");
  pending=true;draw();nextHostHand(hostSession);await publish();
 }catch(err){fail(err);}
});
async function playerAction(action){
 try{
  const r=room(),L=game?.legal;
  if(!unanimous(r)||r.paused||!L||L.playerId!==me||pending)throw Error("Not your turn");
  const target=action==="raise"?Number($("pvp-raise-amount").value):undefined;
  const packet=await makeSignedAction(keys,{me,tableId:r.table.id,
   revision:game.seq,action,target});
  pending=true;draw();send(packet);
 }catch(err){fail(err);}
}
for(const action of ["fold","check","call","raise"])
 $("pvp-"+action).addEventListener("click",()=>playerAction(action));
if(live){
 seatKeys("seat:"+me).then(local=>{
  keys=local;
  api.setUpdateListener(update=>{queue=queue.then(()=>accept(update)).catch(fail);},0);
  draw();
 }).catch(fail);
}else errorMessage="Secure Vector WebXDC was not available in this view.";
draw();
