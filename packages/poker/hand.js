// Offline-only evaluator. Cards use the canonical two-character ASCII format: AS, TD, 2C.
const ranks="23456789TJQKA",suits="CDHS";
function parse(x){
 if(typeof x!=="string"||x.length!==2||!ranks.includes(x[0])||!suits.includes(x[1]))throw new TypeError("Invalid card: "+String(x));
 return {rank:ranks.indexOf(x[0])+2,suit:x[1],code:x};
}
function straightHigh(rs){
 const seq=[...new Set(rs)].sort((a,b)=>b-a);
 if(seq.includes(14))seq.push(1);
 for(let i=0;i<=seq.length-5;i++)if(seq[i]-seq[i+4]===4)return seq[i];
 return 0;
}
function rankFive(cards){
 const rs=cards.map(c=>c.rank),sorted=[...rs].sort((a,b)=>b-a),flush=cards.every(c=>c.suit===cards[0].suit),st=straightHigh(rs);
 const counts=new Map();for(const r of rs)counts.set(r,(counts.get(r)||0)+1);
 const groups=[...counts].map(([r,n])=>({r,n})).sort((a,b)=>b.n-a.n||b.r-a.r);
 if(flush&&st)return [8,st];
 if(groups[0].n===4)return [7,groups[0].r,groups[1].r];
 if(groups[0].n===3&&groups[1].n===2)return [6,groups[0].r,groups[1].r];
 if(flush)return [5,...sorted];
 if(st)return [4,st];
 if(groups[0].n===3)return [3,groups[0].r,...groups.slice(1).map(g=>g.r).sort((a,b)=>b-a)];
 if(groups[0].n===2&&groups[1].n===2)return [2,Math.max(groups[0].r,groups[1].r),Math.min(groups[0].r,groups[1].r),groups[2].r];
 if(groups[0].n===2)return [1,groups[0].r,...groups.slice(1).map(g=>g.r).sort((a,b)=>b-a)];
 return [0,...sorted];
}
export function compareScores(a,b){for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return Math.sign(d);}return 0;}
export function evaluate(cards){
 if(!Array.isArray(cards)||cards.length<5||cards.length>7)throw new RangeError("Expected 5 to 7 cards");
 const v=cards.map(parse);
 if(new Set(v.map(c=>c.code)).size!==v.length)throw new Error("Duplicate card");
 let best;
 for(let a=0;a<v.length-4;a++)for(let b=a+1;b<v.length-3;b++)for(let c=b+1;c<v.length-2;c++)for(let d=c+1;d<v.length-1;d++)for(let e=d+1;e<v.length;e++){
  const s=rankFive([v[a],v[b],v[c],v[d],v[e]]);
  if(!best||compareScores(s,best)>0)best=s;
 }
 return {category:best[0],score:best};
}
export function showdown(board,holes){
 if(!Array.isArray(board)||board.length!==5||!Array.isArray(holes)||holes.length<2||holes.some(h=>!Array.isArray(h)||h.length!==2))throw new Error("Expected board of five and player hands of two");
 const all=[...board,...holes.flat()];if(new Set(all).size!==all.length)throw new Error("Duplicate card across players");
 const results=holes.map(h=>evaluate([...board,...h]));
 let top=results[0].score;for(const r of results)if(compareScores(r.score,top)>0)top=r.score;
 return {results,winners:results.flatMap((r,i)=>compareScores(r.score,top)===0?[i]:[])};
}
