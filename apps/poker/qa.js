// Solo QA only: full hidden state stays on this device, never passed to WebXDC sendUpdate.
import { legalActions, assertConservation } from './engine.js';
import { createSession, startSessionHand, sessionAction, sessionRebuy, serializeSession, restoreSession } from './session.js';
const $=id=>document.getElementById(id);
let locale='en',session=null,table=null,seconds=30,paused=false,deadline=0,remaining=0,lastTurnKey='',storageNotice='';
const STORAGE_KEY='vctrtable-poker-qa-v1';
const readSave=()=>{try{return localStorage.getItem(STORAGE_KEY);}catch{return null;}};
const strings={
 en:{title:'Single-device test table',language:'Language',warning:'Local QA only: simulated opponents, no network play, no authenticated PvP. Cards stay on this device.',back:'← Back to multiplayer lobby',setup:'Start a session',setupHelp:'Configure a table and play against automated seats to inspect the poker rules yourself.',opponents:'Total seats (2–6)',chips:'Starting chips',small:'Small blind',big:'Big blind',seconds:'Your action timer (0 = unlimited)',rebuy:'Allow rebuy when out of chips',start:'Start local session',board:'Community cards',hero:'Your cards',pause:'QA pause (simulates agreement)',resume:'Resume QA',fold:'Fold',check:'Check',call:'Call',raiseTo:'Raise to (street total)',raise:'Bet / Raise',allin:'All-in',next:'Next hand',buy:'Rebuy busted seats',reset:'New session',history:'Hand history',footer:'Test-only automated seats do not represent a production PvE feature.',pot:'Pot',hand:'Hand',turn:'Your turn',wait:'Automated seat acting',done:'Hand complete',win:'You received',remaining:'Time remaining',unlimited:'Unlimited',paused:'Paused (QA)',noChips:'Less than two seats have chips. Rebuy or create a new session.',invalid:'Invalid table settings.',change:'The value must meet the displayed minimum or be an all-in raise.',clock:'Action timeout',notReady:'Select Start local session.',toCall:'To call',balance:'Stack',folded:'Folded',button:'Dealer',status:'Stage',seats:'Seats',saveTitle:'Local QA session',saveWarning:'Saved only on this device. Contains hidden cards and the full test deck, without encryption. Never share the save file. Resuming restarts the local action timer.',save:'Save session',load:'Resume saved session',deleteSave:'Delete saved session',saved:'Saved on this device.',deleted:'Saved session deleted.',saveFailure:'Could not access local storage.',loadFailure:'Could not resume session.'},
 ja:{title:'1端末テスト卓',language:'言語',warning:'1端末専用の開発テストです。相手は自動操作で、通信PvPや本人確認は未実装です。カードは端末内だけに保持します。',back:'← マルチプレイヤーロビーへ',setup:'セッション開始',setupHelp:'設定してテスト用の自動席と対戦し、ポーカールールを1人で確認できます。',opponents:'合計席数（2〜6）',chips:'初期チップ',small:'スモールブラインド',big:'ビッグブラインド',seconds:'自分の行動時間（0=無制限）',rebuy:'チップが尽きたら補充可能',start:'端末内セッション開始',board:'共通カード',hero:'あなたのカード',pause:'QAポーズ（全員承認を模擬）',resume:'QA再開',fold:'フォールド',check:'チェック',call:'コール',raiseTo:'レイズ後の合計（このラウンド）',raise:'ベット / レイズ',allin:'オールイン',next:'次のハンド',buy:'チップ切れの席を補充',reset:'新しいセッション',history:'ハンド履歴',footer:'テスト用の自動席は、正式なPvE機能ではありません。',pot:'ポット',hand:'ハンド',turn:'あなたの手番',wait:'自動席が操作中',done:'ハンド終了',win:'獲得チップ',remaining:'残り時間',unlimited:'無制限',paused:'一時停止中（QA）',noChips:'2席分のチップがありません。補充するか新規セッションを開始してください。',invalid:'テーブル設定が不正です。',change:'最低レイズ額以上か、オールインを選んでください。',clock:'行動時間切れ',notReady:'セッションを開始してください。',toCall:'必要額',balance:'残高',folded:'降りた',button:'ディーラー',status:'段階',seats:'席',saveTitle:'この端末のテスト記録',saveWarning:'保存先はこの端末内のみです。保存記録には全員の隠しカードと山札が暗号化なしで含まれます。共有しないでください。復帰時は行動タイマーをリセットします。',save:'セッションを保存',load:'保存した対戦を復帰',deleteSave:'保存データを削除',saved:'端末内に保存しました。',deleted:'保存データを削除しました。',saveFailure:'端末内の保存領域を利用できません。',loadFailure:'対戦を復元できません。'}
};
const t=k=>strings[locale][k]||k;
const suit={C:'♣',D:'♦',H:'♥',S:'♠'};
const card=(value,hidden=false)=>{const el=document.createElement('span');el.className='qa-card'+(hidden?' back':value&&'DH'.includes(value[1])?' red':'');el.textContent=hidden?'◆':value?value[0].replace('T','10')+suit[value[1]]:'·';if(!value&&!hidden)el.className='qa-card empty';return el;};
const textNode=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
function handLog(h){const p=h.events.map(e=>{
 if(e.kind==='blinds')return 'SB '+h.players[e.sb].name+' '+e.paidSmall+', BB '+h.players[e.bb].name+' '+e.paidBig;
 if(e.kind==='street')return e.street.toUpperCase()+': '+e.board.join(' ');
 if(e.kind==='complete')return t('done')+' — '+h.players.map((p,i)=>p.name+': +'+e.awards[i]).join(', ');
 return h.players[e.seat].name+' '+e.action+(e.target!==null?' '+e.target:'');
});const ol=$('qa-log');ol.replaceChildren(...p.slice(-45).reverse().map(v=>textNode('li',v)));}
function render(){
 document.documentElement.lang=locale;document.querySelectorAll('[data-l10n]').forEach(el=>el.textContent=t(el.dataset.l10n));
 $('qa-save').disabled=!session;
 const existing=Boolean(readSave());$('qa-load').disabled=!existing;$('qa-delete').disabled=!existing;
 $('qa-storage-notice').textContent=storageNotice;
 if(!table)return;
 const h=table.hand;const pot=h.players.reduce((s,p)=>s+p.total,0);
 $('qa-round').textContent=t('hand')+' '+h.number+' — '+h.streetName.toUpperCase();$('qa-pot').textContent=t('pot')+' '+pot;
 const seats=$('qa-players');seats.replaceChildren();
 h.players.forEach((p,i)=>{
  const box=document.createElement('div');box.className='qa-player'+(i===h.turn?' active':'')+(p.folded?' folded':'');
  box.append(textNode('b',p.name+(i===h.button?' Ⓓ':'')+(i===h.sbSeat?' SB':'')+(i===h.bbSeat?' BB':'')));
  box.append(textNode('span',t('balance')+': '+p.stack+' · '+t('toCall')+': '+Math.max(0,h.currentBet-p.street)));
  const cards=document.createElement('div');cards.className='qa-cards';
  if(i!==0&&p.inHand&&(!p.folded||h.status!=='complete'))p.hole.forEach(c=>cards.append(card(c,h.status!=='complete'||p.folded)));
  else if(i!==0&&p.inHand&&h.status==='complete'&&!p.folded)p.hole.forEach(c=>cards.append(card(c)));
  box.append(cards);if(p.folded)box.append(textNode('span',t('folded')));seats.append(box);
 });
 const board=$('qa-board-cards');board.replaceChildren(...Array.from({length:5},(_,i)=>card(h.board[i])));
 $('qa-hero-cards').replaceChildren(...h.players[0].hole.map(c=>card(c)));
 const end=h.status==='complete';$('qa-end').hidden=!end;$('qa-controls').hidden=end;
 $('qa-info').textContent=end?t('done')+' — '+t('win')+' '+h.awards[0]+' · '+t('balance')+': '+table.players[0].stack:paused?t('paused'):h.turn===0?t('turn')+' — '+t('toCall')+' '+(legalActions(table)?.toCall??0):t('wait');
 const L=legalActions(table),isHero=L&&L.seat===0&&!paused;
 $('qa-fold').disabled=!isHero;$('qa-check').disabled=!isHero||!L.canCheck;$('qa-call').disabled=!isHero||!L.canCall;
 $('qa-raise').disabled=!isHero||!L.canRaise;$('qa-allin').disabled=!isHero||!L.canRaise;
 const amount=$('qa-raise-amount');amount.disabled=!isHero||!L.canRaise;
 if(L&&L.seat===0){amount.min=String(Math.min(L.minRaiseTo,L.maxRaiseTo));amount.max=String(L.maxRaiseTo);
  if(document.activeElement!==amount||Number(amount.value)>L.maxRaiseTo)amount.value=String(Math.min(L.minRaiseTo,L.maxRaiseTo));}
 $('qa-timer').textContent=paused?t('paused'):seconds===0?t('unlimited'):t('remaining')+': '+Math.ceil(remaining)+' s';
 $('qa-pause').textContent=t(paused?'resume':'pause');$('qa-next').disabled=table.players.filter(p=>p.stack>0).length<2;
 $('qa-buy').disabled=!table.settings.rebuy||!table.players.some(p=>p.stack===0);
 $('qa-result').textContent=t('win')+' '+h.awards[0]+' — '+h.pots.map(p=>p.amount).join(' + ');
 handLog(h);
}
function resetClock(){const h=table?.hand,L=table&&legalActions(table);if(!h||!L||L.seat!==0||paused)return;
 const key=h.number+'-'+h.events.length+'-'+h.turn;
 if(key!==lastTurnKey){lastTurnKey=key;remaining=seconds;deadline=Date.now()+seconds*1000;}
}
function drive(){if(!table||paused)return;let guard=0;
 while(table.hand.status==='betting'&&table.hand.turn!==0){
  if(++guard>80)throw new Error('Automated test seats stopped progressing');
  const l=legalActions(table);if(!l)break;
  const bot=table.hand.players[l.seat];
  if(l.canRaise&&Math.random()<0.10&&l.maxRaiseTo>=l.minRaiseTo)sessionAction(session,bot.id,'raise',Math.min(l.maxRaiseTo,l.minRaiseTo));
  else sessionAction(session,bot.id,l.toCall?'call':'check');
  assertConservation(table);
 }
 resetClock();render();
}
function move(action,amount){if(!table||paused)return;const l=legalActions(table);if(!l||l.seat!==0)return;
 try{sessionAction(session,l.playerId,action,amount);assertConservation(table);lastTurnKey='';drive();}catch(error){window.alert(error.message);render();}
}
$('qa-language').addEventListener('change',e=>{locale=e.target.value==='ja'?'ja':'en';render();});
$('qa-form').addEventListener('submit',e=>{
 e.preventDefault();const n=Number($('qa-seats').value),chips=Number($('qa-chips').value),sb=Number($('qa-small').value),bb=Number($('qa-big').value);
 seconds=Number($('qa-seconds').value);
 try{if(!Number.isSafeInteger(n)||n<2||n>6||!Number.isSafeInteger(seconds)||seconds<0||seconds>3600)throw new Error(t('invalid'));
  session=createSession({players:Array.from({length:n},(_,i)=>({id:'p'+i,name:i===0?'You':'Seat '+(i+1)})),startingChips:chips,smallBlind:sb,bigBlind:bb,rebuy:$('qa-rebuy').checked});
  table=session.table;startSessionHand(session);assertConservation(table);paused=false;lastTurnKey='';storageNotice='';$('qa-setup').hidden=true;$('qa-table').hidden=false;drive();
 }catch(error){window.alert(error.message||t('invalid'));}
});
$('qa-fold').addEventListener('click',()=>move('fold'));
$('qa-check').addEventListener('click',()=>move('check'));
$('qa-call').addEventListener('click',()=>move('call'));
$('qa-raise').addEventListener('click',()=>move('raise',Number($('qa-raise-amount').value)));
$('qa-allin').addEventListener('click',()=>{const l=legalActions(table);if(l)move('raise',l.maxRaiseTo);});
$('qa-next').addEventListener('click',()=>{if(!table)return;try{startSessionHand(session);lastTurnKey='';drive();}catch(e){window.alert(e.message);}});
$('qa-buy').addEventListener('click',()=>{if(!table)return;for(const p of table.players)if(p.stack===0)sessionRebuy(session,p.id);assertConservation(table);render();});
$('qa-reset').addEventListener('click',()=>{table=null;session=null;paused=false;lastTurnKey='';$('qa-setup').hidden=false;$('qa-table').hidden=true;});
$('qa-pause').addEventListener('click',()=>{if(!table||table.hand.status==='complete')return;paused=!paused;
 if(paused){remaining=seconds===0?0:Math.max(0,(deadline-Date.now())/1000);}
 else if(seconds!==0)deadline=Date.now()+remaining*1000;
 render();});
$('qa-save').addEventListener('click',()=>{
 if(!session)return;
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify({qaVersion:1,seconds,journal:serializeSession(session)}));storageNotice=t('saved');}
 catch(e){storageNotice=t('saveFailure')+' '+String(e.message||'');}
 render();
});
$('qa-load').addEventListener('click',()=>{
 try{
  const payload=JSON.parse(readSave()||'null');
  if(!payload||payload.qaVersion!==1||!Number.isSafeInteger(payload.seconds)||payload.seconds<0||payload.seconds>3600)throw new Error('Invalid save metadata');
  const restored=restoreSession(payload.journal);
  session=restored;table=restored.table;seconds=payload.seconds;paused=false;lastTurnKey='';remaining=seconds;
  $('qa-setup').hidden=true;$('qa-table').hidden=false;storageNotice='';
  drive(); // The local test-only countdown resets after resuming.
 }catch(e){storageNotice=t('loadFailure')+' '+String(e.message||'');render();}
});
$('qa-delete').addEventListener('click',()=>{
 try{localStorage.removeItem(STORAGE_KEY);storageNotice=t('deleted');}
 catch(e){storageNotice=t('saveFailure')+' '+String(e.message||'');}
 render();
});
setInterval(()=>{if(!table||paused||table.hand.status!=='betting')return;const l=legalActions(table);if(!l||l.seat!==0)return;
 resetClock();if(seconds>0){remaining=Math.max(0,(deadline-Date.now())/1000);if(remaining<=0){move(l.toCall?'fold':'check');return;}}
 $('qa-timer').textContent=seconds===0?t('unlimited'):t('remaining')+': '+Math.ceil(remaining)+' s';
},250);
render();
