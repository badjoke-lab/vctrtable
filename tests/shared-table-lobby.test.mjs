import test from "node:test";
import assert from "node:assert/strict";
import {deriveSharedTable,validTableEvent,tableInvitationText} from "../apps/poker/table-lobby.js";

let seq=0;
const mk=(kind,by,tableId,extra={},at=20)=>({
 v:2,app:"poker",kind,id:"event"+String(++seq).padStart(6,"0"),by,at,tableId,...extra
});
const records=items=>items.map((event,i)=>({event,serial:i+1}));
const create=(host="host",room="roomAlpha",limit=6)=>mk("table-create",host,room,{name:"Host",maxPlayers:limit},100);
const join=(actor,room="roomAlpha")=>mk("seat-join",actor,room,{name:"Player "+actor},1);
test("same-chat table create and join is deterministic by server serial, not forged client timestamps",()=>{
 const entries=records([create(),join("alice"),join("bob")]);
 const table=deriveSharedTable(entries);
 assert.equal(table.table.id,"roomAlpha");
 assert.deepEqual([...table.seats.keys()],["host","alice","bob"]);
 assert.deepEqual([...deriveSharedTable(entries.slice().reverse()).seats.keys()],["host","alice","bob"]);
});
test("joins from other rooms and before creation are ignored",()=>{
 const events=[join("uninvited"),create(),join("elsewhere","differentRoom"),join("alice")];
 const state=deriveSharedTable(records(events));
 assert.deepEqual([...state.seats.keys()],["host","alice"]);
});
test("max six seats is enforced, duplicate sends cannot add seats, ready is scoped to admitted player",()=>{
 const events=[create(),...["a","b","c","d","e","f","g"].map(id=>join(id))];
 const state=deriveSharedTable(records(events));
 assert.equal(state.seats.size,6);
 assert.equal(state.seats.has("e"),true);
 assert.equal(state.seats.has("f"),false);
 const alice=mk("seat-ready","a","roomAlpha",{ready:true});
 const bogus=mk("seat-ready","stranger","roomAlpha",{ready:true});
 const next=deriveSharedTable(records([...events,alice,alice,bogus]));
 assert.deepEqual([...next.ready],["a"]);
});
test("leaving clears ready and rejoining does not preserve earlier approval",()=>{
 const events=[create(),join("alice"),mk("seat-ready","alice","roomAlpha",{ready:true}),
 mk("seat-leave","alice","roomAlpha"),join("alice")];
 const state=deriveSharedTable(records(events));
 assert.equal(state.seats.has("alice"),true);
 assert.equal(state.ready.has("alice"),false);
});
test("only host-labelled event closes current shared table; next table can be created",()=>{
 const events=[create(),join("alice"),mk("table-close","alice","roomAlpha"),
 mk("table-close","host","roomAlpha"),mk("table-create","newhost","roomBeta",{name:"New host",maxPlayers:2}),
 join("alice","roomBeta")];
 const state=deriveSharedTable(records(events));
 assert.equal(state.table.id,"roomBeta");
 assert.equal(state.table.host,"newhost");
 assert.deepEqual([...state.seats.keys()],["newhost","alice"]);
});
test("host leave closes their table; later stale updates cannot resurrect it",()=>{
 const events=[create(),join("alice"),mk("seat-leave","host","roomAlpha"),
 join("bob","roomAlpha"),mk("seat-ready","alice","roomAlpha",{ready:true})];
 const state=deriveSharedTable(records(events));
 assert.equal(state.table,null);
 assert.equal(state.seats.size,0);
});
test("invalid identity, room, control character and hidden data are not lobby events",()=>{
 assert.equal(validTableEvent(create()),true);
 for(const e of [
  {...create(),tableId:"x"}, {...create(),maxPlayers:7},
  {...join("bob"),name:"\nprivate"}, {...join("bob"),by:""},
  {...mk("seat-ready","alice","roomAlpha",{ready:"yes"})},
  {...create(),app:"notpoker"}
 ]) assert.equal(validTableEvent(e),false);
});
test("invite draft explicitly requires the SAME Vector group and is not an authenticated join",()=>{
 const english=tableInvitationText("en"),japanese=tableInvitationText("ja");
 assert.match(english,/SAME Vector group chat/);
 assert.match(english,/separate DM or Note/);
 assert.match(japanese,/同じVectorグループチャット/);
 assert.match(japanese,/別のDMやNote/);
 assert.doesNotMatch(english,/nsec|seed|secret|private key/i);
});
