import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
const root=path.resolve(import.meta.dirname,"..");
const artifact=path.join(root,"dist","hanafuda.xdc");
if(!fs.existsSync(artifact))throw Error("Run npm run build:hanafuda before building preview");
const out=path.join(root,"dist","pages");
const game=path.join(out,"hanafuda");
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(game,{recursive:true});
const run=spawnSync("unzip",["-q",artifact,"-d",game],{encoding:"utf8"});
if(run.status!==0||run.error)throw Error("Failed to unpack verified XDC: "+(run.stderr||run.error?.message));
for(const rel of ["index.html","style.css","main.js","koikoi.js","cards/1-1.svg","cards/12-4.svg","cards/back.svg"]) {
 if(!fs.existsSync(path.join(game,rel)))throw Error("Preview is missing "+rel);
}
fs.writeFileSync(path.join(out,".nojekyll"),"");
fs.writeFileSync(path.join(out,"index.html"),`<!doctype html>
<html lang="ja"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>vctrtable / QA previews</title>
<style>body{background:#102219;color:#fff9e9;max-width:700px;margin:5rem auto;padding:1rem;font:1.1rem system-ui,sans-serif}a{color:#ffe0a0;font-size:1.3rem}</style>
<h1>vctrtable — QA Preview</h1>
<p>ローカル動作確認専用。Vector内の対人PvPではありません。</p>
<p><a href="./hanafuda/">花札・こいこい（1端末QA）を開く</a></p>
<p>Local game QA only. Not multiplayer Vector/WebXDC.</p>
</html>`);
console.log("Created browser QA preview:",game);
console.log("Deploy base directory:",out);
