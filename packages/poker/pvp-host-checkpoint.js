/**
 * PRIVATE host-side recovery journal for host-trusted recreational PvP.
 *
 * The full deck and everyone else's private hands never enter WebXDC updates.
 * A non-extractable AES-GCM CryptoKey and encrypted journal are persisted in
 * IndexedDB on this host device. Loss of IndexedDB means loss of the hand.
 * This is not protection against a malicious host or same-origin JavaScript.
 */
const DB="vctrtable-host-journal-v1";
const encoder=new TextEncoder(),decoder=new TextDecoder();
const cryptoAPI=()=>{if(!globalThis.crypto?.subtle||!globalThis.crypto?.getRandomValues)
 throw Error("Secure WebCrypto unavailable");return globalThis.crypto;};
function dbOpen(){
 return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(Error("IndexedDB is required to resume host hands"));return;}
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>{
   const db=request.result;
   db.createObjectStore("keys");
   db.createObjectStore("checkpoints");
  };
  request.onerror=()=>reject(Error("Host journal storage is unavailable"));
  request.onsuccess=()=>resolve(request.result);
 });
}
async function transact(store,kind,id,value){
 const db=await dbOpen();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(store,kind==="read"?"readonly":"readwrite");
  const req=kind==="read"?tx.objectStore(store).get(id):
    kind==="delete"?tx.objectStore(store).delete(id):
    tx.objectStore(store).put(value,id);
  let result=null;
  req.onsuccess=()=>{result=req.result??null;};
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(Error("Host journal transaction failed"));
  tx.onabort=()=>reject(Error("Host journal transaction aborted"));
 });}finally{db.close();}
}
async function localKey(){
 cryptoAPI();
 const existing=await transact("keys","read","host-aes-gcm");
 if(existing)return existing;
 const key=await cryptoAPI().subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
 await transact("keys","write","host-aes-gcm",key);
 return key;
}
const validId=id=>typeof id==="string"&&/^[a-zA-Z0-9_-]{6,100}$/.test(id);
export async function saveHostCheckpoint({tableId,seq,roster,proposalId,journal}){
 if(!validId(tableId)||!validId(proposalId)||!Number.isSafeInteger(seq)||seq<1||
  !Array.isArray(roster)||roster.length<2||roster.length>6||
  new Set(roster).size!==roster.length||roster.some(x=>typeof x!=="string")||
  typeof journal!=="string"||journal.length>2_000_000)
  throw Error("Invalid host checkpoint metadata");
 const payload={version:1,tableId,seq,roster:[...roster].sort(),proposalId,journal};
 const key=await localKey();
 const iv=cryptoAPI().getRandomValues(new Uint8Array(12));
 const cipher=await cryptoAPI().subtle.encrypt({name:"AES-GCM",iv},key,
  encoder.encode(JSON.stringify(payload)));
 await transact("checkpoints","write",tableId,{
  version:1,iv:Array.from(iv),cipher
 });
 return true;
}
export async function loadHostCheckpoint(tableId){
 if(!validId(tableId))throw Error("Invalid table identifier");
 const encrypted=await transact("checkpoints","read",tableId);
 if(!encrypted)return null;
 if(encrypted.version!==1||!Array.isArray(encrypted.iv)||encrypted.iv.length!==12||
  !(encrypted.cipher instanceof ArrayBuffer))throw Error("Host checkpoint format corrupted");
 const plaintext=await cryptoAPI().subtle.decrypt({
  name:"AES-GCM",iv:new Uint8Array(encrypted.iv)
 },await localKey(),encrypted.cipher);
 const restored=JSON.parse(decoder.decode(plaintext));
 if(restored.version!==1||restored.tableId!==tableId||
   !Number.isSafeInteger(restored.seq)||restored.seq<1||
   !validId(restored.proposalId)||!Array.isArray(restored.roster)||
   typeof restored.journal!=="string")
  throw Error("Host checkpoint contents corrupted");
 return restored;
}
export async function discardHostCheckpoint(tableId){
 if(validId(tableId))await transact("checkpoints","delete",tableId);
}
