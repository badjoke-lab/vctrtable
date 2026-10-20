/**
 * Authoritative in-memory room for eventual Vector PvP.
 *
 * IMPORTANT SECURITY BOUNDARY:
 * - Only a trusted transport adapter may supply actorId and server time.
 * - Only the dealer holds this object: it includes the full deck and every hole card.
 * - WebXDC sendUpdate MUST receive publicState(), never the room/table itself.
 * - Private per-player views require a separately verified encrypted delivery path.
 * - This file DOES NOT implement a Vector transport, authentication, or persistence.
 */
import {
  createTable, startHand, act, legalActions, rebuyPlayer, assertConservation
} from "./engine.js";

const MAX_MEMBERS=6;
const isInt=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const identifier=x=>typeof x==="string"&&x.length>0&&x.length<=128;
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const freezeClone=x=>structuredClone(x);
export class RoomError extends Error {
  constructor(code,message=code){super(message);this.name="RoomError";this.code=code;}
}
const fail=(code,message)=>{throw new RoomError(code,message);};

export class AuthoritativeRoom {
  constructor({roomId,players,clock=()=>Date.now(),dealDeck=null}={}){
    if(!identifier(roomId)||!Array.isArray(players)||players.length<2||players.length>MAX_MEMBERS||
       players.some(p=>!p||!identifier(p.id)||typeof p.name!=="string"||p.name.length>60)||
       new Set(players.map(p=>p.id)).size!==players.length)fail("INVALID_MEMBERS");
    if(typeof clock!=="function"||(dealDeck!==null&&typeof dealDeck!=="function"))fail("INVALID_OPTIONS");
    this.roomId=roomId;
    this.members=players.map(({id,name})=>({id,name}));
    this.clock=clock;
    this.dealDeck=dealDeck;
    this.revision=0;
    this.lastNow=0;
    this.nextProposal=0;
    this.proposal=null;
    this.table=null;
    this.paused=false;
    this.pauseRequest=null;
    this.nextPause=0;
    this.deadlineAt=null;
    this.remainingMs=null;
    this.turnMarker=null;
    this.receipts=new Map();
    this.audit=[];
  }
  _now(time){
    const now=time===undefined?this.clock():time;
    if(!isInt(now,0,Number.MAX_SAFE_INTEGER)||now<this.lastNow)fail("INVALID_SERVER_TIME");
    this.lastNow=now;return now;
  }
  _mark(event){
    this.revision++;
    this.audit.push({revision:this.revision,...event});
    if(this.audit.length>1000)this.audit.shift();
  }
  _turnKey(){
    const h=this.table?.hand;
    if(!h||h.status!=="betting"||h.turn<0)return null;
    return [h.number,h.turn,h.events.length].join("/");
  }
  _syncClock(now){
    const key=this._turnKey();
    if(key===null){this.turnMarker=null;this.deadlineAt=null;this.remainingMs=null;return;}
    if(this.paused)return;
    if(key!==this.turnMarker){
      this.turnMarker=key;
      const s=this.table.settings.actionSeconds;
      this.deadlineAt=s===0?null:now+s*1000;
      this.remainingMs=null;
    }
  }
  _afterMove(now){
    assertConservation(this.table);
    if(this.table.hand.status==="complete"){
      this.pauseRequest=null;
      this.paused=false;
    }
    this._syncClock(now);
  }
  _expire(now){
    this._syncClock(now);
    if(this.paused||this.deadlineAt===null||now<this.deadlineAt)return false;
    const legal=legalActions(this.table);
    if(!legal)return false;
    const action=legal.toCall>0?"fold":"check";
    act(this.table,legal.playerId,action);
    this._mark({type:"timeout",actorId:legal.playerId,hand:this.table.hand.number,action});
    this._afterMove(now);
    return true;
  }
  /**
   * Host-only periodic timeout processing. No interval is created in the room.
   * Call this from a dealer scheduler; never accept client-supplied time.
   */
  tick({now}={}){
    const at=this._now(now);
    return this._expire(at);
  }
  /** Server receives authenticated caller identity OUTSIDE the command payload. */
  command({actorId,requestId,expectedRevision,op,now}={}){
    if(!this.members.some(p=>p.id===actorId))fail("UNAUTHENTICATED_PLAYER");
    if(!identifier(requestId)||!op||typeof op.type!=="string")fail("INVALID_COMMAND");
    const at=this._now(now);
    const key=actorId+"\u0000"+requestId;
    if(this.receipts.has(key)){
      const receipt=this.receipts.get(key);
      if(JSON.stringify(receipt.op)!==JSON.stringify(op))fail("NONCE_REUSED_FOR_DIFFERENT_COMMAND");
      return {revision:receipt.revision,replayed:true};
    }
    this._expire(at);
    if(!isInt(expectedRevision,0,Number.MAX_SAFE_INTEGER)||expectedRevision!==this.revision)fail("STALE_REVISION");
    let event;
    switch(op.type){
      case "propose": {
        if(this.table)fail("RULES_LOCKED_FOR_SESSION");
        const s=op.settings;
        if(!s||!isInt(s.actionSeconds,0,3600))fail("INVALID_RULES");
        let test;
        try{test=createTable({players:this.members,...s});}catch{fail("INVALID_RULES");}
        if(Object.keys(s).sort().join(",")!==["actionSeconds","bigBlind","rebuy","smallBlind","startingChips"].sort().join(","))fail("INVALID_RULES");
        this.proposal={id:++this.nextProposal,settings:{...test.settings,actionSeconds:s.actionSeconds},approvals:[actorId]};
        event={type:"propose",actorId,proposalId:this.proposal.id};
        break;
      }
      case "approve": {
        if(!this.proposal||this.table||op.proposalId!==this.proposal.id)fail("INVALID_PROPOSAL");
        if(this.proposal.approvals.includes(actorId))fail("ALREADY_APPROVED");
        this.proposal.approvals.push(actorId);
        if(this.proposal.approvals.length===this.members.length){
          const {actionSeconds,...settings}=this.proposal.settings;
          this.table=createTable({players:this.members,...settings});
          this.table.settings.actionSeconds=actionSeconds;
        }
        event={type:"approve",actorId,proposalId:this.proposal.id,ready:Boolean(this.table)};
        break;
      }
      case "startHand": {
        if(!this.table||this.paused||this.pauseRequest)fail("NOT_READY");
        if(this.table.hand?.status==="betting")fail("HAND_IN_PROGRESS");
        const options=this.dealDeck?{deck:this.dealDeck()}:undefined;
        startHand(this.table,options);
        this._afterMove(at);
        event={type:"startHand",actorId,hand:this.table.hand.number};
        break;
      }
      case "act": {
        if(!this.table||this.paused||this.table.hand?.status!=="betting")fail("ACTION_UNAVAILABLE");
        const legal=legalActions(this.table);
        if(!legal||legal.playerId!==actorId)fail("OUT_OF_TURN");
        if(!["check","call","fold","raise"].includes(op.action))fail("INVALID_ACTION");
        act(this.table,actorId,op.action,op.target);
        this._afterMove(at);
        event={type:"action",actorId,hand:this.table.hand.number,action:op.action,target:op.action==="raise"?op.target:null};
        break;
      }
      case "rebuy": {
        if(!this.table||this.paused||this.pauseRequest)fail("REBUY_UNAVAILABLE");
        rebuyPlayer(this.table,actorId);
        assertConservation(this.table);
        event={type:"rebuy",actorId};
        break;
      }
      case "requestPause": {
        if(!this.table||this.table.hand?.status!=="betting"||this.pauseRequest)fail("PAUSE_UNAVAILABLE");
        const mode=op.mode;
        if(mode!==(this.paused?"resume":"pause"))fail("WRONG_PAUSE_MODE");
        this.pauseRequest={id:++this.nextPause,mode,approvals:[actorId]};
        event={type:"pauseRequest",actorId,mode,request:this.pauseRequest.id};
        break;
      }
      case "votePause": {
        if(!this.pauseRequest||op.pauseId!==this.pauseRequest.id||typeof op.approve!=="boolean")fail("INVALID_PAUSE_VOTE");
        if(this.pauseRequest.approvals.includes(actorId))fail("ALREADY_APPROVED");
        if(!op.approve){
          this.pauseRequest=null;
          event={type:"pauseRejected",actorId};
          break;
        }
        this.pauseRequest.approvals.push(actorId);
        const p=this.pauseRequest;
        if(p.approvals.length===this.members.length){
          if(p.mode==="pause"){
            this.paused=true;
            this.remainingMs=this.deadlineAt===null?null:Math.max(0,this.deadlineAt-at);
            this.deadlineAt=null;
          }else{
            this.paused=false;
            this.deadlineAt=this.remainingMs===null?null:at+this.remainingMs;
            this.remainingMs=null;
          }
          this.pauseRequest=null;
        }
        event={type:"pauseVote",actorId,mode:p.mode,approved:!this.pauseRequest};
        break;
      }
      default: fail("UNKNOWN_COMMAND");
    }
    this._mark(event);
    if(this.receipts.size>=5000)this.receipts.delete(this.receipts.keys().next().value);
    this.receipts.set(key,{op:freezeClone(op),revision:this.revision});
    return {revision:this.revision,replayed:false};
  }
  /**
   * Approved-for-broadcast state. Deliberately allowlisted: no deck, seeds,
   * hole cards, journal, private hole delivery, or RNG references.
   */
  publicState(){
    const h=this.table?.hand;
    const showCards=Boolean(h?.status==="complete"&&h.board.length===5&&h.players.filter(p=>p.inHand&&!p.folded).length>=2);
    const state={
      protocol:1,roomId:this.roomId,revision:this.revision,
      members:this.members.map(p=>({...p})),
      proposal:this.proposal?{id:this.proposal.id,settings:{...this.proposal.settings},approvals:[...this.proposal.approvals]}:null,
      settings:this.table?{...this.table.settings}:null,
      pause:{paused:this.paused,request:this.pauseRequest?{id:this.pauseRequest.id,mode:this.pauseRequest.mode,approvals:[...this.pauseRequest.approvals]}:null},
      deadlineAt:this.deadlineAt,
      hand:null
    };
    if(h){
      const legal=legalActions(this.table);
      state.hand={
        number:h.number,status:h.status,street:h.streetName,board:[...h.board],
        button:h.button,smallBlindSeat:h.sbSeat,bigBlindSeat:h.bbSeat,
        turn:h.turn,playerToAct:legal?.playerId??null,pot:h.players.reduce((sum,p)=>sum+p.total,0),
        currentBet:h.currentBet,
        players:h.players.map(p=>({id:p.id,name:p.name,stack:p.stack,streetBet:p.street,totalBet:p.total,inHand:p.inHand,folded:p.folded,...(showCards&&p.inHand&&!p.folded?{shownCards:[...p.hole]}:{})})),
        result:h.status==="complete"?{awards:[...h.awards],pots:freezeClone(h.pots)}:null,
        events:freezeClone(h.events)
      };
    }
    return state;
  }
  /**
   * Sensitive view. Deliver ONLY through authenticated, recipient-specific
   * encrypted SDK messaging. NEVER put this response in WebXDC sendUpdate.
   */
  privateState(actorId){
    if(!this.members.some(p=>p.id===actorId))fail("UNAUTHENTICATED_PLAYER");
    const state=this.publicState();
    const p=this.table?.hand?.players.find(p=>p.id===actorId);
    return {...state,privateFor:actorId,ownHole:p?[...p.hole]:[],legal:!this.paused&&legalActions(this.table)?.playerId===actorId?legalActions(this.table):null};
  }
}
