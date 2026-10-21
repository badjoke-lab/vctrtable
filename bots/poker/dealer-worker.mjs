/**
 * Trusted Node dealer child process for the Vector SDK Rust DM adapter.
 *
 * stdin/stdout are the ONLY transport. The Rust SDK process supplies the
 * verified DM author from Vector's decrypted message context. Never accept
 * a claimed player ID or time from the client JSON payload.
 *
 * stdout: one bounded JSON line per input (plus initial ready line).
 * stderr: no full errors, cards, journal, keys or message contents.
 */
import {PersistentDealer} from "../../packages/poker/persistent-dealer.js";
import {parsePlayerRequest,makeOutboundPackets,assertPacketRouting} from "../../packages/poker/message-boundary.js";
import readline from "node:readline";
import {Buffer} from "node:buffer";
import {fileURLToPath} from "node:url";
import path from "node:path";

const MAX_LINE_BYTES=16*1024;
const ensure=x=>{if(!x)throw new Error("Missing dealer configuration");return x;};
const bounded=x=>typeof x==="string"&&x.length>0&&x.length<=128;

function configFromEnvironment(env=process.env){
  const roomId=ensure(env.VCTR_ROOM_ID);
  const filename=ensure(env.VCTR_DEALER_FILE);
  const raw=ensure(env.VCTR_PLAYERS_JSON);
  const players=JSON.parse(raw);
  if(!Array.isArray(players)||players.length<2||players.length>6||
     players.some(p=>!p||!bounded(p.id)||!p.id.startsWith("npub1")||!bounded(p.name)||p.name.length>60)||
     new Set(players.map(p=>p.id)).size!==players.length)throw new Error("Bad room roster");
  const hex=ensure(env.VCTR_DEALER_KEY_HEX);
  if(!/^[0-9a-fA-F]{64}$/.test(hex))throw new Error("Bad dealer encryption key format");
  return {roomId,filename,players,key:Buffer.from(hex,"hex")};
}
const sanitizedError=e=>e?.code||"DEALER_REQUEST_REJECTED";

export async function makeHandler({dealer,players,clock=()=>Date.now()}){
  const roster=new Set(players.map(p=>p.id));
  // The trusted host, never a WebXDC command, provides server time.
  const serverNow=()=>clock();
  return async function handle(input){
    if(!input||typeof input!=="object"||Array.isArray(input))return {ok:false,code:"INVALID_INPUT"};
    if(input.kind==="sync"&&bounded(input.sender)&&roster.has(input.sender)){
      // Reconnect is always a full private snapshot, never a shared update.
      return deliverTo(dealer,players,input.sender);
    }
    if(input.kind==="tick"){
      const before=dealer.revision;
      await dealer.tick(serverNow());
      return dealer.revision===before
        ?{ok:true,changed:false,revision:dealer.revision,deliveries:[]}
        :stateDeliveries(dealer,players);
    }
    if(input.kind!=="command"||!bounded(input.sender)||!roster.has(input.sender))
      return {ok:false,code:"UNAUTHORIZED_OR_INVALID_COMMAND"};
    const before=dealer.revision;
    try{
      const request=parsePlayerRequest(input.request,dealer.publicState().roomId);
      const receipt=await dealer.command({
        actorId:input.sender,
        now:serverNow(),
        requestId:request.requestId,
        expectedRevision:request.expectedRevision,
        op:request.op
      });
      // A repeated DM must not resend all six private hands. Refresh only
      // its verified owner, who may have missed the original acknowledgment.
      return {...(dealer.revision===before
          ?deliverTo(dealer,players,input.sender)
          :stateDeliveries(dealer,players)),receipt};
    }catch(e){
      if(dealer.faulted)throw e; // fail closed after a storage failure
      // A rejected command can STILL have persisted an authoritative timeout
      // before the revision check. All seats need that update, or some will
      // stay stuck until their next explicit sync.
      const out=dealer.revision===before
        ?deliverTo(dealer,players,input.sender)
        :stateDeliveries(dealer,players);
      return {...out,ok:false,code:sanitizedError(e),recipient:input.sender};
    }
  };
}

function deliverTo(dealer,players,authenticatedId){
  const out=stateDeliveries(dealer,players);
  return {...out,deliveries:out.deliveries.filter(p=>p.to===authenticatedId)};
}

function stateDeliveries(dealer,players){
  const out=makeOutboundPackets(dealer.journal.room);
  assertPacketRouting(out,players);
  // All packets are 1:1 encrypted DMs. A PUBLIC snapshot is included within
  // each recipient's DM; none is sent into WebXDC group status by this adapter.
  return {ok:true,changed:true,revision:dealer.revision,deliveries:out.privatePackets.map(p=>({
    to:p.recipientId,
    body:JSON.stringify({
      protocol:1,kind:"vctrtable-poker-state",roomId:out.publicPacket.roomId,
      revision:out.publicPacket.revision,
      state:out.publicPacket.state,
      private:{recipientId:p.recipientId,ownHole:p.ownHole,legal:p.legal}
    })
  }))};
}

export async function main(){
  const cfg=configFromEnvironment();
  const dealer=await PersistentDealer.open(cfg);
  const handle=await makeHandler({dealer,players:cfg.players});
  const lineReader=readline.createInterface({input:process.stdin,crlfDelay:Infinity,terminal:false});
  process.stdout.write(JSON.stringify({ok:true,kind:"ready",revision:dealer.revision})+"\n");
  for await (const line of lineReader){
    if(Buffer.byteLength(line)>MAX_LINE_BYTES){
      process.stdout.write(JSON.stringify({ok:false,code:"INPUT_TOO_LARGE"})+"\n");
      continue;
    }
    let response;
    try{response=await handle(JSON.parse(line));}
    catch(e){
      // Storage failure may have advanced unpersisted in-memory state. Exit
      // immediately to ensure a clean restore from last durable journal.
      process.stderr.write("Dealer terminated after unrecoverable local error\n");
      process.exitCode=1;
      break;
    }
    process.stdout.write(JSON.stringify(response)+"\n");
  }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(()=>{process.stderr.write("Dealer initialization failed\n");process.exitCode=1;});
}
