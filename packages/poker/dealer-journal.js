/**
 * Deterministic single-writer event journal for the authoritative dealer.
 * Contains ALL deck orders and card secrets: do not broadcast/log/expose.
 * No player authentication or Vector SDK transport is implemented here.
 */
import {AuthoritativeRoom} from "./dealer-room.js";
import {shuffleDeck} from "./engine.js";

const MAX_EVENTS=20000;
const validTime=t=>Number.isSafeInteger(t)&&t>=0;
const copy=x=>structuredClone(x);
const compare=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const errorCode=e=>typeof e.code==="string"?e.code:e.message;

export class DealerJournal {
  constructor({roomId,players,deckFactory=()=>shuffleDeck(),clock=()=>Date.now()}){
    if(typeof deckFactory!=="function")throw new TypeError("deckFactory required");
    this._deckFactory=deckFactory;
    this._restoreDeck=undefined;
    this._dealt=undefined;
    this.entries=[];
    this.room=new AuthoritativeRoom({
      roomId,players,clock,
      dealDeck:()=>{
        const deck=this._restoreDeck===undefined?this._deckFactory():this._restoreDeck;
        this._dealt=copy(deck);
        return deck;
      }
    });
    this.initial={roomId,players:copy(this.room.members)};
  }
  _limit(){if(this.entries.length>=MAX_EVENTS)throw new Error("Dealer journal capacity exceeded");}
  command(input){
    this._limit();
    if(!input||!validTime(input.now))throw new Error("Trusted dealer timestamp required");
    this._dealt=undefined;
    const previous=this.room.revision;
    let receipt,exception;
    try{receipt=this.room.command(input);}catch(e){exception=e;}
    const changed=this.room.revision!==previous;
    if(changed){
      this.entries.push({kind:"command",input:copy(input),deck:this._dealt??null,revision:this.room.revision,failed:exception?errorCode(exception):null});
    }
    if(exception)throw exception;
    return receipt;
  }
  tick(now){
    this._limit();
    if(!validTime(now))throw new Error("Trusted dealer timestamp required");
    const previous=this.room.revision;
    const fired=this.room.tick({now});
    if(this.room.revision!==previous)this.entries.push({kind:"tick",now,revision:this.room.revision});
    return fired;
  }
  document(){
    return {version:1,initial:copy(this.initial),entries:copy(this.entries)};
  }
  static replay(doc,{clock=()=>Date.now(),deckFactory=()=>shuffleDeck()}={}){
    if(!doc||doc.version!==1||!doc.initial||!Array.isArray(doc.entries)||doc.entries.length>MAX_EVENTS)throw new Error("Unsupported dealer journal format");
    const x=new DealerJournal({...doc.initial,clock,deckFactory});
    for(const entry of doc.entries){
      if(!entry||!Number.isSafeInteger(entry.revision))throw new Error("Invalid dealer journal record");
      if(entry.kind==="command"){
        if(!entry.input||!validTime(entry.input.now)||!(entry.deck===null||Array.isArray(entry.deck)))throw new Error("Invalid dealer command record");
        x._restoreDeck=entry.deck===null?undefined:copy(entry.deck);
        x._dealt=undefined;
        let failed=null;
        try{x.command(entry.input);}catch(err){failed=errorCode(err);}
        if(failed!==entry.failed||x.room.revision!==entry.revision||
           !compare(x._dealt??null,entry.deck))throw new Error("Dealer command replay divergence");
        x._restoreDeck=undefined;
      }else if(entry.kind==="tick"){
        if(!validTime(entry.now))throw new Error("Invalid dealer tick");
        x.tick(entry.now);
        if(x.room.revision!==entry.revision)throw new Error("Dealer timeout replay divergence");
      }else throw new Error("Unknown dealer journal event");
    }
    if(!compare(x.entries,doc.entries))throw new Error("Dealer journal integrity mismatch");
    return x;
  }
}
