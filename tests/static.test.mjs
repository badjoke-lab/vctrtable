import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const scripts=['apps/poker/main.js','apps/poker/qa.js','apps/poker/cards.js','apps/poker/chat-view.js','apps/poker/public-chat.js','apps/poker/dm.js','packages/poker/dm-seat.js','packages/poker/engine.js','packages/poker/hand.js','packages/poker/session.js','packages/poker/dealer-room.js','packages/poker/message-boundary.js','packages/poker/dealer-journal.js','packages/poker/dealer-store.js','packages/poker/persistent-dealer.js'];
for(const f of scripts)test('JavaScript syntax: '+f,()=>{
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',f],{encoding:'utf8'}));
});
test('QA UI links bundled modules and save controls',()=>{
 const build=readFileSync('scripts/build.mjs','utf8'),html=readFileSync('apps/poker/qa.html','utf8');
 for(const f of ['qa.js','session.js','engine.js','hand.js'])assert.ok(build.includes(f),'Missing bundled file '+f);
 for(const id of ['qa-save','qa-load','qa-delete'])assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
 assert.ok(!readFileSync('apps/poker/qa.js','utf8').includes('sendUpdate('),'Private test engine must not broadcast its state');
});

test('dealer room cannot directly invoke any WebXDC shared transport',()=>{
 const dealer=readFileSync('packages/poker/dealer-room.js','utf8');
 assert.ok(!dealer.includes('sendUpdate('));
 assert.ok(!dealer.includes('window.webxdc'));
 assert.ok(dealer.includes('publicState()'));
 assert.ok(dealer.includes('privateState(actorId)'));
});

test('dealer recovery remains server side and never enters WebXDC package',()=>{
 const build=readFileSync('scripts/build.mjs','utf8');
 for(const serverOnly of ['dealer-journal.js','dealer-store.js','persistent-dealer.js'])assert.equal(build.includes(serverOnly),false);
 for(const path of ['packages/poker/dealer-journal.js','packages/poker/dealer-store.js','packages/poker/persistent-dealer.js']){
  const src=readFileSync(path,'utf8');
  assert.equal(src.includes('sendUpdate('),false);
 }
});

test('Private DM seat only uses offline manual handoff',()=>{
 const build=readFileSync('scripts/build.mjs','utf8');
 for(const file of ['dm.html','dm.css','dm.js','dm-seat.js'])assert.ok(build.includes(file),'Missing '+file);
 const html=readFileSync('apps/poker/dm.html','utf8');
 for(const id of ['identity','room','inbox','outbox','import','copy','sync','fold','raise','pause'])assert.ok(html.includes('id="'+id+'"'));
 for(const file of ['apps/poker/dm.js','packages/poker/dm-seat.js']){
  const src=readFileSync(file,'utf8');
  assert.ok(!src.includes('sendUpdate('),'No private cards may reach shared status updates');
  assert.ok(!src.includes('localStorage.'),'Private DM snapshots must never persist in browser storage');
 }
});

test('mobile six-seat QA and both chat modes are bundled for WebXDC',()=>{
 const html=readFileSync('apps/poker/qa.html','utf8');
 const css=readFileSync('apps/poker/qa.css','utf8');
 const js=readFileSync('apps/poker/qa.js','utf8');
 const build=readFileSync('scripts/build.mjs','utf8');
 for(const file of ['cards.js','chat-view.js'])assert.ok(build.includes(file),'Missing '+file+' from .xdc');
 for(const id of ['qa-chat-mode','qa-chat-bubble','qa-unread','qa-chat-toast','qa-chat-messages',
  'qa-chat-translation','qa-chat-form','qa-min','qa-half','qa-pot-preset','qa-max','qa-load-start'])
  assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
 for(const cls of ['pos-top-left','pos-top','pos-top-right','pos-mid-left','pos-mid-right',
  'chat-inline','chat-drawer','action-dock','vcard-court','vcard-pips'])
  assert.ok(css.includes(cls),'Missing UI style '+cls);
 assert.ok(js.includes('layouts[h.players.length-1]'),'Six-seat layout must be driven by player count');
 for(const file of ['apps/poker/qa.js','apps/poker/cards.js','apps/poker/chat-view.js'])
  assert.ok(!readFileSync(file,'utf8').includes('sendUpdate('),'Offline QA must not broadcast secrets');
});

test('Vector opens the new mobile solo game, with old lobby preserved separately',()=>{
 const root=readFileSync('apps/poker/index.html','utf8');
 const lobby=readFileSync('apps/poker/lobby.html','utf8');
 const qa=readFileSync('apps/poker/qa.html','utf8');
 const dm=readFileSync('apps/poker/dm.html','utf8');
 const build=readFileSync('scripts/build.mjs','utf8');
 assert.ok(root.includes('class="poker-arena"'));
 assert.ok(root.includes('id="qa-chat-mode"'));
 assert.ok(root.includes('src="qa.js"'));
 assert.ok(root.includes('href="lobby.html"'));
 assert.ok(!root.includes('id="join"'),'old lobby must not be app entry point');
 assert.ok(lobby.includes('id="join"'),'shared non-secret lobby remains accessible');
 assert.ok(lobby.includes('href="qa.html"'),'solo QA remains available from lobby');
 assert.ok(qa.includes('href="lobby.html"'));
 assert.ok(dm.includes('href="lobby.html"'));
 assert.ok(build.includes('"lobby.html"'),'lobby included in released .xdc');
});

test('public Vector chat is explicitly opt-in and isolated from private poker state',()=>{
 const build=readFileSync('scripts/build.mjs','utf8');
 const html=readFileSync('apps/poker/index.html','utf8');
 const js=readFileSync('apps/poker/qa.js','utf8');
 const qa=readFileSync('apps/poker/qa.html','utf8');
 const chat=readFileSync('apps/poker/public-chat.js','utf8');
 assert.ok(build.includes('public-chat.js'));
 assert.ok(html.includes('src="webxdc.js"'));
 assert.ok(qa.includes('src="webxdc.js"'));
 assert.ok(qa.includes('id="qa-chat-network"'));
 assert.ok(js.includes('if(chatTransport.available)chatTransport.subscribe()'));
 assert.ok(js.includes('chat===vectorChat'));
 assert.ok(!js.includes('sendUpdate('));
 assert.ok(chat.includes('sendUpdate({payload:e}'));
 assert.ok(!chat.includes('room.table'));
 assert.ok(!chat.includes('table.hand'));
});
