import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const scripts=['apps/poker/main.js','apps/poker/qa.js','apps/poker/dm.js','packages/poker/dm-seat.js','packages/poker/engine.js','packages/poker/hand.js','packages/poker/session.js','packages/poker/dealer-room.js','packages/poker/message-boundary.js','packages/poker/dealer-journal.js','packages/poker/dealer-store.js','packages/poker/persistent-dealer.js'];
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
