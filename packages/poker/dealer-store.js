/**
 * Single-host dealer journal storage. AES-256-GCM sealed at rest, atomic rename.
 * The 32-byte key must be injected from a secret manager; never commit it.
 * No multi-process lease is provided. Use one dealer writer per room.
 */
import {randomBytes,createCipheriv,createDecipheriv} from "node:crypto";
import {mkdir,open,readFile,stat,rename,unlink,chmod} from "node:fs/promises";
import path from "node:path";

const LIMIT=12*1024*1024;
const AAD=Buffer.from("vctrtable:poker:dealer-journal:v1");
const asKey=k=>{
  if(!Buffer.isBuffer(k)&&!(k instanceof Uint8Array))throw new Error("32-byte dealer encryption key required");
  if(k.byteLength!==32)throw new Error("Dealer encryption key must be 32 bytes");
  return Buffer.from(k);
};
export class EncryptedDealerStore {
  constructor({filename,key}={}){
    if(typeof filename!=="string"||!path.isAbsolute(filename))throw new Error("Absolute dealer journal path required");
    this.filename=filename;
    this.key=asKey(key);
  }
  async save(document){
    const plain=Buffer.from(JSON.stringify(document),"utf8");
    if(plain.length>LIMIT)throw new Error("Dealer journal too large");
    const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.key,iv);
    cipher.setAAD(AAD);
    const body=Buffer.concat([cipher.update(plain),cipher.final()]);
    const payload=Buffer.from(JSON.stringify({
      version:1,nonce:iv.toString("base64"),ciphertext:body.toString("base64"),tag:cipher.getAuthTag().toString("base64")
    }));
    plain.fill(0);
    if(payload.length>LIMIT)throw new Error("Encrypted dealer journal too large");
    await mkdir(path.dirname(this.filename),{recursive:true,mode:0o700});
    const temporary=this.filename+".tmp-"+randomBytes(8).toString("hex");
    let handle;
    try{
      handle=await open(temporary,"wx",0o600);
      await handle.writeFile(payload);
      await handle.sync();
      await handle.close();handle=undefined;
      await rename(temporary,this.filename);
      await chmod(this.filename,0o600);
    }finally{
      if(handle)await handle.close();
      await unlink(temporary).catch(e=>{if(e.code!=="ENOENT")throw e;});
    }
  }
  async load(){
    let info;
    try{info=await stat(this.filename);}catch(e){if(e.code==="ENOENT")return null;throw e;}
    if(!info.isFile()||info.size>LIMIT)throw new Error("Invalid dealer file");
    const encoded=await readFile(this.filename);
    if(encoded.length>LIMIT)throw new Error("Dealer file too large");
    let parsed;
    try{parsed=JSON.parse(encoded.toString("utf8"));}catch{throw new Error("Corrupt dealer file");}
    if(parsed?.version!==1||typeof parsed.nonce!=="string"||typeof parsed.ciphertext!=="string"||typeof parsed.tag!=="string")throw new Error("Unsupported encrypted dealer file");
    const nonce=Buffer.from(parsed.nonce,"base64"),tag=Buffer.from(parsed.tag,"base64");
    if(nonce.length!==12||tag.length!==16)throw new Error("Invalid sealed dealer header");
    try{
      const dec=createDecipheriv("aes-256-gcm",this.key,nonce);
      dec.setAAD(AAD);
      dec.setAuthTag(tag);
      const plaintext=Buffer.concat([dec.update(Buffer.from(parsed.ciphertext,"base64")),dec.final()]);
      try{return JSON.parse(plaintext.toString("utf8"));}
      finally{plaintext.fill(0);}
    }catch{throw new Error("Could not authenticate/decrypt dealer journal");}
  }
}
