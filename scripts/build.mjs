import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
const root=path.resolve(import.meta.dirname,".."),src=path.join(root,"apps","poker"),out=path.join(root,"dist");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"vctrtable-"));
try{
 for(const file of ["lobby.html","style.css","main.js","manifest.toml","qa.html","qa.css","qa.js","cards.js","cardmeister.full.js","chat-view.js","public-chat.js","dm.html","dm.css","dm.js"])fs.copyFileSync(path.join(src,file),path.join(temp,file));
 for(const file of ["hand.js","engine.js","session.js","betting-controls.js","showdown-summary.js","dm-seat.js","dm-sync-state.js"])fs.copyFileSync(path.join(root,"packages","poker",file),path.join(temp,file));
 // Packaged root is ALWAYS the exact same QA screen, not a stale copy.
 fs.copyFileSync(path.join(src,"qa.html"),path.join(temp,"index.html"));
 fs.mkdirSync(out,{recursive:true});const dest=path.join(out,"poker.xdc");fs.rmSync(dest,{force:true});
 const p=spawnSync("zip",["-qr",dest,"."],{cwd:temp,encoding:"utf8"});
 if(p.error||p.status!==0)throw new Error("zip error: "+(p.error?.message||p.stderr));
 console.log("Created "+dest+" ("+fs.statSync(dest).size+" bytes)");
}finally{fs.rmSync(temp,{recursive:true,force:true});}
