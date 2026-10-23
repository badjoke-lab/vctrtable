/**
 * Source-allowlisted, credential-free portable Vector poker Bot packager.
 * Build the Rust binary first. This script never reads operator secrets.
 */
import {copyFile,cp,mkdir,rm,writeFile,chmod,stat} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const ALLOWED=/^[a-z0-9-]{1,50}$/;
const FILES=[
 ["bots/poker","bots/poker"],
 ["packages/poker","packages/poker"],
 ["bots/vector/Cargo.toml","bots/vector/Cargo.toml"],
 ["scripts/vector-bot-operator.mjs","scripts/vector-bot-operator.mjs"],
 ["scripts/vector-bot-identity.mjs","scripts/vector-bot-identity.mjs"],
 ["scripts/vector-bot-preflight.mjs","scripts/vector-bot-preflight.mjs"],
 ["docs/DM-FIRST-POKER.md","docs/DM-FIRST-POKER.md"],
 ["docs/VECTOR-SDK-ADAPTER.md","docs/VECTOR-SDK-ADAPTER.md"]
];
export async function packageVectorBot({
 root=HERE, binary, output=path.join(root,"dist"), target
}={}){
 if(!ALLOWED.test(target??""))throw new Error("Invalid package platform identifier");
 if(typeof binary!=="string")throw new Error("Rust Vector Bot binary is required");
 const source=path.resolve(binary);
 const file=await stat(source);
 if(!file.isFile()||file.size===0)throw new Error("Rust binary missing or empty");
 const dirname="vector-bot-"+target;
 const destination=path.join(output,dirname);
 await rm(destination,{recursive:true,force:true});
 await mkdir(destination,{recursive:true});
 for(const [from,to] of FILES){
  const dest=path.join(destination,to);
  await mkdir(path.dirname(dest),{recursive:true});
  if(from.endsWith(".mjs")||from.endsWith(".md")||from.endsWith(".toml")){
   await copyFile(path.join(root,from),dest);
  }else{
   // Hard-coded allowlist; no entire repository, Git metadata, env files,
   // user's private journal, chat logs, or signing identity can be packaged.
   await cp(path.join(root,from),dest,{recursive:true});
  }
 }
 await mkdir(path.join(destination,"bin"),{recursive:true});
 const binaryPath=path.join(destination,"bin","vctrtable-vector-bot");
 await copyFile(source,binaryPath);
 await chmod(binaryPath,0o755);
 await writeFile(path.join(destination,"package.json"),JSON.stringify({
  name:"vctrtable-vector-bot-bundle",version:"0.1.0",private:true,type:"module",
  engines:{node:">=20"},
  scripts:{
   "vector:init":"node scripts/vector-bot-operator.mjs init",
   "vector:check":"node scripts/vector-bot-operator.mjs check",
   "vector:start":"node scripts/vector-bot-operator.mjs start"
  }
 },null,2)+"\n");
 await writeFile(path.join(destination,"README-START.txt"),
  "vctrtable Vector SDK Bot (development release)\n"+
  "Requires Node.js 20+; macOS Intel build requires Intel macOS.\n"+
  "From this directory:\n"+
  "  npm run vector:init\n"+
  "  Edit the generated private config on your own computer.\n"+
  "  npm run vector:check\n"+
  "  npm run vector:start\n\n"+
  "The Bot stays in the foreground. Stop using Ctrl+C.\n"+
  "Never use a personal Vector signing nsec for the dealer Bot.\n"+
  "Never upload your config, dealer key, or journal to GitHub.\n"+
  "A packaged Bot is NOT proof of relay delivery or working PvP.\n"+
  "See docs/DM-FIRST-POKER.md for registered player DM tests.\n"
 );
 return destination;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [target,binary,output]=process.argv.slice(2);
 packageVectorBot({target,binary,output:output?path.resolve(output):undefined})
   .then(folder=>console.log("Packaged credential-free Vector Bot at "+folder))
   .catch(error=>{console.error("Packaging failed: "+error.message);process.exitCode=1;});
}
