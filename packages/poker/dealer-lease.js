/**
 * Localhost-only, process-lifetime exclusive dealer journal guard.
 *
 * Node's core filesystem APIs do not expose an OS advisory flock. Instead,
 * exclusively bind a journal-derived loopback TCP port. The OS releases the
 * bound port even after SIGKILL, so automatic supervisor restarts still work.
 *
 * Scope: accidental duplicate worker processes on ONE host. This does NOT
 * protect a shared network filesystem across machines. Port collisions with
 * unrelated services are fail-closed; no second writer is ever authorized.
 * The listener accepts NO data and exposes NO HTTP/network dealer interface.
 */
import {createHash} from "node:crypto";
import {mkdir,realpath} from "node:fs/promises";
import {createServer} from "node:net";
import path from "node:path";

export function journalLeasePort(canonicalFilename){
 if(typeof canonicalFilename!=="string"||!path.isAbsolute(canonicalFilename))
  throw new Error("Absolute dealer journal filename required");
 const digest=createHash("sha256").update("vctrtable:single-host-dealer-journal:v1\0")
  .update(canonicalFilename).digest();
 return 20000+digest.readUInt32BE(0)%40000;
}
export async function acquireDealerLease(filename){
 if(typeof filename!=="string"||!path.isAbsolute(filename))
  throw new Error("Absolute dealer journal filename required");
 // realpath(parent) prevents aliasing the same journal via symlinked folders.
 // Store itself atomically renames its file, so never realpath the file.
 await mkdir(path.dirname(filename),{recursive:true,mode:0o700});
 const canonical=path.join(await realpath(path.dirname(filename)),path.basename(filename));
 const port=journalLeasePort(canonical);
 const listener=createServer(socket=>socket.destroy());
 try{
  await new Promise((resolve,reject)=>{
   const fail=e=>{listener.off("listening",success);reject(e);};
   const success=()=>{listener.off("error",fail);resolve();};
   listener.once("error",fail);
   listener.once("listening",success);
   listener.listen({host:"127.0.0.1",port,exclusive:true});
  });
 }catch{
  listener.close();
  throw new Error("Dealer single-host journal lease unavailable; possible duplicate instance or local port conflict");
 }
 let released=false;
 return {
  canonical,port,
  async release(){
   if(released)return;
   released=true;
   await new Promise((resolve,reject)=>{
    listener.close(e=>e?reject(e):resolve());
   });
  }
 };
}
