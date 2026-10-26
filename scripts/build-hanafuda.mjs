import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
const root=path.resolve(import.meta.dirname,"..");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"vctrtable-hanafuda-"));
try{
  const app=path.join(root,"apps","hanafuda");
  for(const file of ["index.html","style.css","manifest.toml"])
    fs.copyFileSync(path.join(app,file),path.join(temp,file));
  const main=fs.readFileSync(path.join(app,"main.js"),"utf8");
  const from='"../../packages/hanafuda/koikoi.js"';
  if(!main.includes(from)) throw new Error("Unexpected Hanafuda engine import");
  fs.writeFileSync(path.join(temp,"main.js"),main.replace(from,'"./koikoi.js"'));
  fs.copyFileSync(path.join(root,"packages","hanafuda","koikoi.js"),path.join(temp,"koikoi.js"));
  const dist=path.join(root,"dist");fs.mkdirSync(dist,{recursive:true});
  const output=path.join(dist,"hanafuda.xdc");fs.rmSync(output,{force:true});
  const p=spawnSync("zip",["-qr",output,"."],{cwd:temp,encoding:"utf8"});
  if(p.error||p.status!==0) throw new Error("Hanafuda zip error: "+(p.error?.message||p.stderr));
  console.log("Created "+output+" ("+fs.statSync(output).size+" bytes)");
}finally{fs.rmSync(temp,{recursive:true,force:true});}
