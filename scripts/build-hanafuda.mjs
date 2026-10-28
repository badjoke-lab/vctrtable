import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {downloadHanafudaAssets} from "./hanafuda-card-assets.mjs";
const root=path.resolve(import.meta.dirname,"..");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"vctrtable-hanafuda-"));
try{
  const app=path.join(root,"apps","hanafuda");
  for(const file of ["index.html","style.css","manifest.toml"])
    fs.copyFileSync(path.join(app,file),path.join(temp,file));
  const main=fs.readFileSync(path.join(app,"main.js"),"utf8");
  const from='"../../packages/hanafuda/koikoi.js"';
  if(!main.includes(from)) throw new Error("Unexpected Hanafuda engine import");
  const guideFrom='"../../packages/hanafuda/guide.js"';
  if(!main.includes(guideFrom))throw new Error("Unexpected Hanafuda guide import");
  const botFrom='"../../packages/hanafuda/bot.js"';
  if(!main.includes(botFrom))throw new Error("Unexpected Hanafuda bot import");
  fs.writeFileSync(path.join(temp,"main.js"),main.replace(from,'"./koikoi.js"')
    .replace(guideFrom,'"./guide.js"').replace(botFrom,'"./bot.js"'));
  fs.copyFileSync(path.join(root,"packages","hanafuda","koikoi.js"),path.join(temp,"koikoi.js"));
  fs.copyFileSync(path.join(root,"packages","hanafuda","guide.js"),path.join(temp,"guide.js"));
  fs.copyFileSync(path.join(root,"packages","hanafuda","bot.js"),path.join(temp,"bot.js"));
  // PvE and PvP are distinct entrypoints in the SAME XDC. Realtime and
  // crypto modules are bundled offline; webxdc.js is supplied by Vector.
  for(const file of ["pvp.html","pvp.css"])
    fs.copyFileSync(path.join(app,file),path.join(temp,file));
  let pvp=fs.readFileSync(path.join(app,"pvp.js"),"utf8");
  for(const file of ["koikoi.js","guide.js","pvp-core.js","pvp-crypto.js"]){
    const source='"../../packages/hanafuda/'+file+'"';
    if(!pvp.includes(source))throw new Error("Missing PvP module import "+file);
    pvp=pvp.replace(source,'"./'+file+'"');
  }
  fs.writeFileSync(path.join(temp,"pvp.js"),pvp);
  for(const file of ["pvp-core.js","pvp-crypto.js"])
    fs.copyFileSync(path.join(root,"packages","hanafuda",file),path.join(temp,file));
  await downloadHanafudaAssets(temp);
  const dist=path.join(root,"dist");fs.mkdirSync(dist,{recursive:true});
  const output=path.join(dist,"hanafuda.xdc");fs.rmSync(output,{force:true});
  const p=spawnSync("zip",["-qr",output,"."],{cwd:temp,encoding:"utf8"});
  if(p.error||p.status!==0) throw new Error("Hanafuda zip error: "+(p.error?.message||p.stderr));
  console.log("Created "+output+" ("+fs.statSync(output).size+" bytes)");
}finally{fs.rmSync(temp,{recursive:true,force:true});}
