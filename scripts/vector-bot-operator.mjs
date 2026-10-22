/**
 * Credential-safe, foreground Vector poker Bot operator CLI.
 *
 * init  -> create a private local config stub and a random journal key
 * check -> validate before contacting Vector (no secrets logged)
 * start -> launch the trusted Rust SDK Bot; Node dealer remains its child
 *
 * No keys are generated for the Vector signing identity. Operators MUST use
 * a dedicated Bot identity and never enter their own personal account nsec.
 * NEVER pass secret values through argv, GitHub, chat, or Actions.
 */
import {randomBytes} from "node:crypto";
import {spawn} from "node:child_process";
import {existsSync,lstatSync,statSync} from "node:fs";
import {mkdir,open,readFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {checkVectorEnvironment} from "./vector-bot-preflight.mjs";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const HOME=os.homedir();
const DEFAULT_CONFIG=path.join(HOME,".config","vctrtable","private.json");
const DEFAULT_JOURNAL=path.join(HOME,".local","share","vctrtable","dealer.enc");
const CONFIG_KEYS=["VECTOR_NSEC","VCTR_ROOM_ID","VCTR_PLAYERS_JSON",
                   "VCTR_DEALER_FILE","VCTR_DEALER_KEY_HEX"];

function contained(base,filename){
 const relative=path.relative(base,filename);
 return relative==="" || (!relative.startsWith(".."+path.sep)&&relative!==".."&&!path.isAbsolute(relative));
}
function unixPrivate(info,mode){
 return process.platform==="win32" || ((info.mode&0o777)&(~mode))===0;
}
function owned(info){
 return process.getuid===undefined || info.uid===process.getuid();
}
export function validateConfigFile(file,{root=ROOT}={}){
 const failures=[];
 const abs=path.resolve(file);
 if(contained(root,abs))failures.push("Private config may not be stored in the Git repository");
 try{
  const info=lstatSync(abs);
  if(!info.isFile()||!unixPrivate(info,0o600)||!owned(info))
   failures.push("Private config must be an owner-only regular file (0600), not a symlink");
 }catch{failures.push("Private config not found; run init first");}
 try{
  const dir=lstatSync(path.dirname(abs));
  if(!dir.isDirectory()||!unixPrivate(dir,0o700)||!owned(dir))
   failures.push("Private config parent must be an owner-only directory (0700), not a symlink");
 }catch{failures.push("Private config directory does not exist");}
 return failures;
}
export function configurationToEnvironment(config){
 if(!config||typeof config!=="object"||Array.isArray(config)||
    Object.keys(config).sort().join(",")!==CONFIG_KEYS.toSorted().join(",")){
  throw new Error("Private config must contain exactly the five documented settings");
 }
 if(!Array.isArray(config.VCTR_PLAYERS_JSON)){
  throw new Error("VCTR_PLAYERS_JSON must be a JSON array of public player addresses");
 }
 return {
  VECTOR_NSEC:config.VECTOR_NSEC,
  VCTR_ROOM_ID:config.VCTR_ROOM_ID,
  VCTR_PLAYERS_JSON:JSON.stringify(config.VCTR_PLAYERS_JSON),
  VCTR_DEALER_FILE:config.VCTR_DEALER_FILE,
  VCTR_DEALER_KEY_HEX:config.VCTR_DEALER_KEY_HEX,
 };
}
export async function createConfiguration(file=DEFAULT_CONFIG,{root=ROOT,journal=DEFAULT_JOURNAL}={}){
 const abs=path.resolve(file);
 if(contained(root,abs))throw new Error("Private config must be outside Git");
 const directory=path.dirname(abs);
 await mkdir(directory,{recursive:true,mode:0o700});
 const info=lstatSync(directory);
 if(!info.isDirectory()||!unixPrivate(info,0o700)||!owned(info)){
  throw new Error("Config directory must be an owner-only, non-symlink directory (0700)");
 }
 // Private journal directory is created only for the default isolated path.
 await mkdir(path.dirname(journal),{recursive:true,mode:0o700});
 const parent=lstatSync(path.dirname(journal));
 if(!parent.isDirectory()||!unixPrivate(parent,0o700)||!owned(parent)){
  throw new Error("Dealer journal directory is not owner-only (0700)");
 }
 const config={
  VECTOR_NSEC:"",
  VCTR_ROOM_ID:"private-poker-table",
  VCTR_PLAYERS_JSON:[
   {id:"",name:"Player 1"},
   {id:"",name:"Player 2"}
  ],
  VCTR_DEALER_FILE:journal,
  VCTR_DEALER_KEY_HEX:randomBytes(32).toString("hex"),
 };
 // wx: no accidental reset of the journal encryption key on subsequent init.
 const fileHandle=await open(abs,"wx",0o600);
 try{
  await fileHandle.writeFile(JSON.stringify(config,null,2)+"\n");
  await fileHandle.sync();
 }finally{await fileHandle.close();}
 return abs;
}
export async function inspectConfiguration(filename,{root=ROOT}={}){
 const problems=validateConfigFile(filename,{root});
 if(problems.length)return problems;
 let config;
 try{config=JSON.parse(await readFile(filename,"utf8"));}
 catch{return ["Private config is not valid JSON"];}
 let vars;
 try{vars=configurationToEnvironment(config);}
 catch(e){return [e.message];}
 problems.push(...checkVectorEnvironment(vars,{cwd:root}));
 // The preflight checks permissions of an existing journal, but explicitly
 // reject an alias/symlink path here so a caller cannot redirect the Bot.
 try{
  const journalDir=lstatSync(path.dirname(config.VCTR_DEALER_FILE));
  if(!journalDir.isDirectory()||!owned(journalDir)||!unixPrivate(journalDir,0o700))
   problems.push("Dealer journal directory must be owner-only (0700), not a symlink");
  if(existsSync(config.VCTR_DEALER_FILE) && !lstatSync(config.VCTR_DEALER_FILE).isFile())
   problems.push("Dealer journal cannot be a symlink or non-file");
 }catch{problems.push("Dealer journal directory does not exist");}
 return problems;
}

export function parseArgs(argv){
 const [command,...args]=argv;
 if(!["init","check","start"].includes(command))throw new Error("Usage: node scripts/vector-bot-operator.mjs init|check|start [--config FILE]");
 if(args.length===0)return {command,filename:DEFAULT_CONFIG};
 if(args.length===2&&args[0]==="--config"&&args[1]){
  return {command,filename:path.resolve(args[1])};
 }
 throw new Error("Usage: init|check|start [--config FILE]");
}
export async function run(argv=process.argv.slice(2)){
 const {command,filename}=parseArgs(argv);
 if(command==="init"){
  const created=await createConfiguration(filename);
  console.log("Created owner-only private configuration: "+created);
  console.log("Edit this LOCAL file with a dedicated Bot nsec and two to six players' PUBLIC npubs.");
  console.log("Never paste the file, signing key, or journal key into chat or Git.");
  console.log("Then run: node scripts/vector-bot-operator.mjs check");
  return 0;
 }
 const problems=await inspectConfiguration(filename);
 if(problems.length){
  for(const issue of problems)console.error("Preflight: "+issue);
  return 1;
 }
 if(command==="check"){
  console.log("Local Bot configuration preflight passed. No Vector relay contacted.");
  return 0;
 }
 // Only now load secrets. Never place them in process arguments or logs.
 const config=JSON.parse(await readFile(filename,"utf8"));
 const env={...process.env,...configurationToEnvironment(config)};
 const binary=path.join(ROOT,"bin","vctrtable-vector-bot");
 const hasBinary=existsSync(binary)&&statSync(binary).isFile();
 if(!hasBinary&&!existsSync(path.join(ROOT,"bots","vector","Cargo.toml"))){
  console.error("Neither a packaged Vector Bot binary nor its Rust source is present");
  return 1;
 }
 const executable=hasBinary?binary:"cargo";
 const args=hasBinary?[]:["run","--release","--manifest-path","bots/vector/Cargo.toml"];
 console.log("Starting private Vector poker Bot in foreground. Stop with Ctrl+C.");
 return await new Promise(resolve=>{
  const child=spawn(executable,args,{cwd:ROOT,env,stdio:"inherit",shell:false});
  let completed=false;
  function finish(code){if(!completed){completed=true;resolve(code);}}
  const sigint=()=>{if(child.exitCode===null)child.kill("SIGINT");};
  const sigterm=()=>{if(child.exitCode===null)child.kill("SIGTERM");};
  process.on("SIGINT",sigint);
  process.on("SIGTERM",sigterm);
  child.on("error",()=>{console.error("Could not start Bot binary or Rust toolchain");finish(1);});
  child.on("exit",(code,signal)=>{
   process.off("SIGINT",sigint);process.off("SIGTERM",sigterm);
   finish(code??(signal?1:0));
  });
 });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 run().then(code=>{process.exitCode=code;}).catch(e=>{
  // EEXIST and permission errors are safe; never stringify config values.
  if(e?.code==="EEXIST")console.error("Private configuration already exists; refusing to overwrite the dealer key.");
  else console.error("Operator command failed: "+(e?.message??"unknown error"));
  process.exitCode=1;
 });
}
