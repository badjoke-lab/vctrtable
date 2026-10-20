/**
 * Restart-resilient single-writer broker for an eventual Vector bot.
 * Persist BEFORE returning any accepted command/timeout to the caller.
 */
import {DealerJournal} from "./dealer-journal.js";
import {EncryptedDealerStore} from "./dealer-store.js";

const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export class PersistentDealer {
  constructor(journal,store){
    this.journal=journal;
    this.store=store;
    this.faulted=false;
    this.tail=Promise.resolve();
  }
  static async open({roomId,players,filename,key,clock,deckFactory}={}){
    const store=new EncryptedDealerStore({filename,key});
    const saved=await store.load();
    const journal=saved
      ?DealerJournal.replay(saved,{clock,deckFactory})
      :new DealerJournal({roomId,players,clock,deckFactory});
    const expected={roomId,players:players?.map(({id,name})=>({id,name}))};
    if(!equal(journal.initial,expected))throw new Error("Wrong room ID or player roster for journal");
    const broker=new PersistentDealer(journal,store);
    if(!saved)await store.save(journal.document());
    return broker;
  }
  get revision(){return this.journal.room.revision;}
  publicState(){return this.journal.room.publicState();}
  privateState(authenticatedId){return this.journal.room.privateState(authenticatedId);}
  async _serialized(fn){
    // Serialize requests in memory; this is NOT a cross-process lock.
    const predecessor=this.tail;
    let release;
    this.tail=new Promise(resolve=>{release=resolve;});
    await predecessor;
    try{
      if(this.faulted)throw new Error("Dealer is faulted after storage failure; restart from disk before accepting more actions");
      return await fn();
    }finally{release();}
  }
  async _runAndPersist(fn){
    return this._serialized(async()=>{
      const before=this.journal.entries.length;
      let result,failure;
      try{result=fn();}catch(error){failure=error;}
      if(this.journal.entries.length!==before){
        try{await this.store.save(this.journal.document());}
        catch(error){this.faulted=true;throw new Error("Dealer persistence failed; all further operations disabled",{cause:error});}
      }
      if(failure)throw failure;
      return result;
    });
  }
  async command(input){return this._runAndPersist(()=>this.journal.command(input));}
  async tick(now){return this._runAndPersist(()=>this.journal.tick(now));}
}
