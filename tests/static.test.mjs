import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const scripts=['apps/poker/main.js','apps/poker/qa.js','packages/poker/engine.js','packages/poker/hand.js','packages/poker/session.js','packages/poker/dealer-room.js'];
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
