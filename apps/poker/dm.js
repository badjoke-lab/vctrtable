// Manual, private DM bridge for development. NO WebXDC shared update API.
import {commandJson,syncJson,parseSeatSnapshot} from "./dm-seat.js";
const $=id=>document.getElementById(id);
const dict={
 en:{title:"Poker seat (developer bridge)",language:"Language",warning:"Developer-only manual bridge. No automatic Vector DM connection. Never paste private hands into group chat or shared updates.",back:"← Lobby",connection:"Bot DM setup",help:"Enter your agreed room ID and your public Vector npub. Verify the dealer Bot identity inside Vector.",room:"Room ID",identity:"Your public npub (not nsec)",privacy:"Send generated actions ONLY in the dealer Bot's one-to-one Vector DM. Copy Bot replies back here. Pasted JSON has no cryptographic authenticity here: verify the sender in Vector.",table:"Table",board:"Community cards",hand:"Your private hand",controls:"Make a move",proposalHelp:"Before the session, propose table rules and wait for everyone to approve.",chips:"Initial chips",sb:"Small blind",bb:"Big blind",timer:"Action seconds (0 = unlimited)",rebuy:"Allow rebuy between hands",propose:"Propose rules",approve:"Approve rules",start:"Start next hand",rebuyBtn:"Rebuy busted seat",fold:"Fold",check:"Check",call:"Call",raiseTo:"Raise to",raise:"Raise",allin:"All-in",pause:"Request pause / resume",pauseYes:"Approve pause / resume",pauseNo:"Reject request",sync:"Request state sync",outbound:"1. Copy action to Bot DM",outboundHelp:"The JSON is prepared here. You must manually send it to the dealer Bot's private DM.",copy:"Copy command",select:"Select text",inbound:"2. Paste Bot's reply",inboundHelp:"Paste the complete JSON from a private DM with the verified dealer Bot. This interface does not broadcast or save the reply.",import:"Import reply",clear:"Clear imported text",footer:"Development-only seat UI. In-app Vector transport is not implemented.",empty:"No state imported. Send a sync request to the Bot and paste the reply.",waiting:"Waiting for table to start",paused:"Table paused by unanimous agreement",pending:"Pause/resume approval pending",turn:"Your turn",otherTurn:"Waiting for another player",complete:"Hand complete",pot:"Pot",stack:"Stack",bet:"Contributed",dealer:"Dealer",you:"You",folded:"Folded",noCopy:"Generate an action first.",copied:"Copied. Paste ONLY into the dealer Bot DM.",selected:"Text selected. Copy manually if needed.",generated:"Action generated. Send it in the Bot's direct message.",loaded:"Private seat snapshot imported. Verify the original DM's sender.",cleared:"Input cleared.",needId:"Enter room ID and your own public npub.",unsafe:"Do NOT paste a private hand or reply in the group chat.",expired:"Older snapshot rejected. Request a new sync.",error:"Cannot import reply:",needed:"To call",status:"Status",revision:"Revision"},
 ja:{title:"ポーカー席（開発用DM連携）",language:"言語",warning:"開発用の手動連携です。Vector DMとの自動通信は未実装です。秘密の手札をグループチャットや共有更新へ送らないでください。",back:"← ロビーへ",connection:"Bot DM接続設定",help:"合意したルームIDと自分の公開npubを入力してください。ディーラーBot本人であることはVector上で確認してください。",room:"ルームID",identity:"自分の公開npub（nsecは禁止）",privacy:"生成した操作は必ずディーラーBotとの1対1のVector DMで送信してください。返信JSONをここへコピーします。貼り付け内容の送信者はこの画面では認証できません。Vector上で確認してください。",table:"テーブル",board:"共通カード",hand:"自分の手札",controls:"アクション",proposalHelp:"セッション開始前にルールを提案し、全員の承認を待ちます。",chips:"初期チップ",sb:"スモールブラインド",bb:"ビッグブラインド",timer:"行動制限（秒、0=無制限）",rebuy:"ハンド間のチップ補充を許可",propose:"ルール提案",approve:"ルール承認",start:"次のハンド開始",rebuyBtn:"チップ補充",fold:"フォールド",check:"チェック",call:"コール",raiseTo:"レイズ後合計",raise:"レイズ",allin:"オールイン",pause:"ポーズ・再開申請",pauseYes:"ポーズ・再開を承認",pauseNo:"申請を拒否",sync:"状態の同期要求",outbound:"1. Bot DMへ送る操作をコピー",outboundHelp:"ここでは送信しません。ディーラーBotとの1対1のDMに自分で貼り付けて送信します。",copy:"操作をコピー",select:"文字列を選択",inbound:"2. Botの返信を貼り付け",inboundHelp:"本人確認したディーラーBotの個別DMからJSON全体を貼り付けます。共有送信・保存は行いません。",import:"返信を読み込む",clear:"貼り付けを消去",footer:"開発用の操作画面です。Vectorアプリ内の自動連携は未実装です。",empty:"状態がありません。Botへ同期要求を送信し、返信を貼り付けてください。",waiting:"テーブル開始待ち",paused:"全員承認によるポーズ中",pending:"ポーズ・再開の承認待ち",turn:"あなたの手番",otherTurn:"他のプレイヤーの手番待ち",complete:"ハンド終了",pot:"ポット",stack:"残りチップ",bet:"投入額",dealer:"ディーラー",you:"あなた",folded:"フォールド",noCopy:"先にアクションを生成してください。",copied:"コピーしました。Botとの1対1のDMにのみ貼り付けてください。",selected:"選択しました。必要なら手動でコピーしてください。",generated:"操作を生成しました。Botとの個別DMで送信してください。",loaded:"本人専用の状態を読み込みました。送信者はVector上で確認してください。",cleared:"入力を消去しました。",needId:"ルームIDと自分の公開npubを入力してください。",unsafe:"秘密の手札やBotの返信をグループチャットに貼らないでください。",expired:"古い状態は拒否しました。同期し直してください。",error:"返信を読み込めません:",needed:"必要額",status:"状態",revision:"リビジョン"}
};
let locale="en",snapshot=null;
const t=k=>dict[locale][k]||k;
const show=(message,error=false)=>{const el=$("feedback");el.textContent=message;el.style.color=error?"#ffd2a3":"#aaf5c6";};
const room=()=>$("room").value.trim();
const identity=()=>$("identity").value.trim();
const make=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
const card=code=>{
 const el=make("span",code?code[0].replace("T","10")+({H:"♥",D:"♦",C:"♣",S:"♠"}[code[1]]):"·","qa-card");
 if(!code)el.className+=" empty";
 if(code&&(code[1]==="D"||code[1]==="H"))el.className+=" red";
 return el;
};
function put(id,nodes){$(id).replaceChildren(...nodes);}
function command(op){
 try{
  if(!room()||!identity().startsWith("npub1"))throw new Error(t("needId"));
  const raw=op?commandJson({roomId:room(),revision:snapshot?.revision??0,op}):syncJson();
  $("outbox").value=raw;
  show(t("generated"));
 }catch(error){show(error.message,true);}
}
function render(){
 document.documentElement.lang=locale;
 document.querySelectorAll("[data-t]").forEach(el=>el.textContent=t(el.dataset.t));
 const s=snapshot?.state,h=s?.hand,p=snapshot?.private;
 const playing=Boolean(h&&h.status==="betting"),myTurn=Boolean(playing&&p?.legal);
 $("phase").textContent=h?"#"+h.number+" · "+h.street.toUpperCase():"—";
 $("pot").textContent=h?t("pot")+": "+h.pot:"—";
 const rows=[];
 for(let i=0;i<(h?.players?.length??0);i++){
  const player=h.players[i],mine=player.id===identity(),box=make("div","","qa-player"+(h.turn===i?" active":"")+(player.folded?" folded":""));
  const header=make("b",player.name+(mine?" ★":"")+(h.button===i?" Ⓓ":""));
  box.append(header,make("span",t("stack")+": "+player.stack+" · "+t("bet")+": "+player.totalBet));
  if(player.folded)box.append(make("span",t("folded")));
  if(mine||Array.isArray(player.shownCards)){
   const hand=make("div","","qa-cards");
   for(const c of mine?(p?.ownHole??[]):(player.shownCards??[]))hand.append(card(c));
   box.append(hand);
  }
  rows.push(box);
 }
 put("seats",rows);
 put("board",Array.from({length:5},(_,i)=>card(h?.board[i])));
 put("hole",p?.ownHole?.map(card)??[]);
 let status=t("empty");
 if(s){
  if(!h)status=t("waiting");
  else if(h.status==="complete")status=t("complete");
  else if(s.pause?.paused)status=t("paused");
  else if(myTurn)status=t("turn")+"\n"+t("needed")+": "+p.legal.toCall;
  else status=t("otherTurn");
  if(s.pause?.request)status+="\n"+t("pending");
  status+="\n"+t("revision")+": "+snapshot.revision;
 }
 $("status").textContent=status;
 const legal=p?.legal;
 for(const [id,key] of [["fold","canFold"],["check","canCheck"],["call","canCall"],["raise","canRaise"],["allin","canRaise"]])
  $(id).disabled=!myTurn||s.pause?.paused||!legal[key];
 const r=$("raise-to");
 r.disabled=!myTurn||!legal?.canRaise;
 if(legal?.canRaise){
  r.min=String(Math.min(legal.minRaiseTo,legal.maxRaiseTo));
  r.max=String(legal.maxRaiseTo);
  if(document.activeElement!==r)r.value=r.min;
 }
 $("approve").disabled=!s?.proposal||Boolean(s.settings)||s.proposal.approvals.includes(identity());
 $("propose").disabled=Boolean(s?.settings);
 $("start").disabled=!s?.settings||playing||Boolean(s.pause?.paused)||Boolean(s.pause?.request);
 $("rebuy-btn").disabled=!s?.settings||!s.settings.rebuy||playing||!h?.players.find(x=>x.id===identity()&&x.stack===0);
 $("pause").disabled=!playing||Boolean(s.pause?.request);
 const request=s?.pause?.request;
 $("pause-yes").disabled=!request||request.approvals.includes(identity());
 $("pause-no").disabled=!request||request.approvals.includes(identity());
}
$("language").addEventListener("change",e=>{locale=e.target.value==="ja"?"ja":"en";render();});
for(const name of ["room","identity"])$(name).addEventListener("input",()=>{snapshot=null;render();});
$("propose").addEventListener("click",()=>command({type:"propose",settings:{
 startingChips:Number($("chips").value),smallBlind:Number($("sb").value),bigBlind:Number($("bb").value),
 actionSeconds:Number($("timer").value),rebuy:$("rebuy").checked
}}));
$("approve").addEventListener("click",()=>{if(snapshot?.state.proposal)command({type:"approve",proposalId:snapshot.state.proposal.id});});
$("start").addEventListener("click",()=>command({type:"startHand"}));
$("rebuy-btn").addEventListener("click",()=>command({type:"rebuy"}));
for(const action of ["fold","check","call"])$(action).addEventListener("click",()=>command({type:"act",action}));
$("raise").addEventListener("click",()=>command({type:"act",action:"raise",target:Number($("raise-to").value)}));
$("allin").addEventListener("click",()=>{const l=snapshot?.private?.legal;if(l)command({type:"act",action:"raise",target:l.maxRaiseTo});});
$("pause").addEventListener("click",()=>command({type:"requestPause",mode:snapshot?.state?.pause?.paused?"resume":"pause"}));
for(const [id,approve] of [["pause-yes",true],["pause-no",false]])$(id).addEventListener("click",()=>{
 const p=snapshot?.state?.pause?.request;
 if(p)command({type:"votePause",pauseId:p.id,approve});
});
$("sync").addEventListener("click",()=>command(null));
$("copy").addEventListener("click",async()=>{
 const data=$("outbox").value;
 if(!data){show(t("noCopy"),true);return;}
 try{
  if(!navigator.clipboard?.writeText)throw new Error("clipboard unavailable");
  await navigator.clipboard.writeText(data);show(t("copied"));
 }catch{$("outbox").focus();$("outbox").select();show(t("selected"));}
});
$("select").addEventListener("click",()=>{$("outbox").focus();$("outbox").select();show(t("selected"));});
$("import").addEventListener("click",()=>{
 try{
  const parsed=parseSeatSnapshot($("inbox").value,{roomId:room(),playerId:identity(),minimumRevision:snapshot?.revision??-1});
  snapshot=parsed;
  $("inbox").value=""; // Never persist the raw reply; keep seat state only in memory.
  render();show(t("loaded"));
 }catch(error){show(t("error")+" "+error.message,true);}
});
$("clear").addEventListener("click",()=>{$("inbox").value="";show(t("cleared"));});
render();
