/**
 * Presentation-only, fail-closed progress model for experimental PvP setup.
 * This intentionally does not authorize actions or assert Vector identity.
 * All input fields are public local/lobby state already used by pvp.js.
 */
export function pvpSetupProgress({
 connected=false,hasTable=false,seated=false,seatCount=0,
 readyCount=0,rulesApproved=false,keyCount=0,host=false,
 gameActive=false
}={}){
 const num=x=>Number.isSafeInteger(x)&&x>=0&&x<=6?x:0;
 const count=num(seatCount),ready=num(readyCount),keys=num(keyCount);
 const steps=[
  {
   id:"transport",name:"Vector chat",ja:"Vectorチャット",
   complete:Boolean(connected),
   instruction:"Open this XDC in Vector, not a standalone browser.",
   instructionJa:"ブラウザ単体ではなくVectorでXDCを開いてください。"
  },
  {
   id:"table",name:"Shared table",ja:"卓の作成",
   complete:Boolean(hasTable),
   instruction:"Create a table in the Lobby of this same XDC.",
   instructionJa:"このXDCのロビーで卓を作成してください。"
  },
  {
   id:"seat",name:"Your seat",ja:"着席",
   complete:Boolean(seated),
   instruction:"Join the table in the Lobby (the host is joined automatically).",
   instructionJa:"ロビーで参加してください（ホストは作成時に参加済み）。"
  },
  {
   id:"players",name:"Players (2–6)",ja:"参加人数（2〜6人）",
   complete:count>=2,
   instruction:"Invite at least one friend into the SAME Vector group chat and XDC.",
   instructionJa:"同じVectorグループチャットのXDCに友人を招待してください。",
   progress:String(count)+"/2 minimum"
  },
  {
   id:"ready",name:"Everyone ready",ja:"全員が準備完了",
   complete:count>=2&&ready===count,
   instruction:"Every player must tap I'm Ready in the Lobby.",
   instructionJa:"全員がロビーで「準備完了」を押してください。",
   progress:ready+"/"+count
  },
  {
   id:"rules",name:"Rules agreed",ja:"ルールの合意",
   complete:count>=2&&Boolean(rulesApproved),
   instruction:"Propose and approve the same chips, blinds and timer in the Lobby.",
   instructionJa:"ロビーで初期チップ・ブラインド・制限時間に全員が同意してください。"
  },
  {
   id:"keys",name:"Session hand keys",ja:"セッション用の鍵",
   complete:count>=2&&keys===count,
   instruction:"All players must open PvP in the SAME XDC and complete seat-key exchange.",
   instructionJa:"全員が同じXDCのPvP画面を開き、席の鍵を交換してください。",
   progress:keys+"/"+count
  },
  {
   id:"deal",name:host?"Deal the hand":"Host deals the hand",
   ja:host?"配札する":"ホストの配札待ち",
   complete:Boolean(gameActive),
   instruction:host?"Tap Host: Deal hand.":"Ask the host to deal; only the host can start.",
   instructionJa:host?"ホストの配札ボタンを押してください。":"ホストが配札するまで待ってください。"
  }
 ];
 const blocked=steps.find(x=>!x.complete)||null;
 return {
  steps,
  complete:steps.every(x=>x.complete),
  next:blocked,
  completed:steps.filter(x=>x.complete).length,
  total:steps.length
 };
}
