// Isolated cooperating-writer store. Host must supply private persistent storage.
// Immutable revisions are never pruned; lock recovery always requires review.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const fail=code=>{const e=Error(code);e.code=code;throw e;};
const plainObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
export function canonicalJSON(value){
 if(value===null||typeof value==='boolean'||typeof value==='string')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value))fail('STORE_NON_JSON_VALUE');return JSON.stringify(value);}
 if(Array.isArray(value)){for(let i=0;i<value.length;i++)if(!Object.hasOwn(value,i))fail('STORE_NON_JSON_VALUE');return '['+value.map(canonicalJSON).join(',')+']';}
 if(!plainObject(value))fail('STORE_NON_JSON_VALUE');
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(value[k])).join(',')+'}';
}
export const stateDigest=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
const clone=value=>JSON.parse(canonicalJSON(value));
export async function assertPlainPath(file){
 for(let current=path.resolve(file);;current=path.dirname(current)){
  try{if((await fs.lstat(current)).isSymbolicLink())fail('STORE_REDIRECTED_PATH');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(path.dirname(current)===current)break;
 }
}
export function createSnapshotStore(directory,{kind,validate,maxBytes=10*1024*1024,maxRevisions=10000}={}){
 if(!/^[a-z][a-z0-9-]{1,60}$/.test(kind??'')||typeof validate!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<1024||!Number.isSafeInteger(maxRevisions)||maxRevisions<1)fail('INVALID_STORE_CONFIGURATION');
 const root=path.resolve(directory),versions=path.join(root,'versions'),head=path.join(root,'head.json');
 const pointerOK=p=>plainObject(p)&&Object.keys(p).length===2&&/^revision-[1-9][0-9]*-[a-f0-9-]{36}\.json$/.test(p.file)&&/^[a-f0-9]{64}$/.test(p.sha256);
 async function readText(file){await assertPlainPath(file);if((await fs.stat(file)).size>maxBytes)fail('STORE_SIZE_LIMIT');return fs.readFile(file,'utf8');}
 async function writeNew(file,data){
  await assertPlainPath(file);const text=canonicalJSON(data);if(Buffer.byteLength(text)>maxBytes)fail('STORE_SIZE_LIMIT');
  const h=await fs.open(file,'wx',0o600);try{await h.writeFile(text);await h.sync();}finally{await h.close();}
 }
 async function readInternal(){
  let headText;try{headText=await readText(head);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  let pointer;try{pointer=JSON.parse(headText);}catch{fail('INVALID_STORE_HEAD');}
  if(!pointerOK(pointer))fail('INVALID_STORE_HEAD');
  let cursor=pointer,latest=null,expected=null;const audit=[],seen=new Set();
  while(cursor){
   if(!pointerOK(cursor)||seen.has(cursor.file)||seen.size>=maxRevisions)fail('INVALID_REVISION_CHAIN');seen.add(cursor.file);
   const row=JSON.parse(await readText(path.join(versions,cursor.file)));
   if(stateDigest(row)!==cursor.sha256)fail('STORE_REVISION_HASH_MISMATCH');
   if(row.schemaVersion!==1||row.kind!==kind||!Number.isSafeInteger(row.revision)||row.revision<1||!/^revision-/.test(cursor.file)||!cursor.file.startsWith('revision-'+row.revision+'-')||!Number.isFinite(Date.parse(row.at))||!/^[a-z][a-z0-9_-]{0,60}$/.test(row.action??''))fail('INVALID_STORE_REVISION');
   validate(row.state);
   if(expected!==null&&(row.revision!==expected.revision-1||Date.parse(row.at)>Date.parse(expected.at)))fail('INVALID_REVISION_CHAIN');
   latest??=row;audit.push({revision:row.revision,at:row.at,action:row.action,sha256:cursor.sha256});
   if(row.revision===1){if(row.previous!==null)fail('INVALID_REVISION_CHAIN');}
   else if(!pointerOK(row.previous))fail('INVALID_REVISION_CHAIN');
   expected=row;cursor=row.previous;
  }
  return {headText,pointer,revision:latest.revision,at:latest.at,state:latest.state,audit:audit.reverse()};
 }
 async function read(){const row=await readInternal();if(!row)return null;const {headText,pointer,...publicRow}=row;return clone(publicRow);}
 async function transact({expectedRevision,at,action,initialState,mutate}={}){
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!Number.isFinite(Date.parse(at))||!/^[a-z][a-z0-9_-]{0,60}$/.test(action??'')||typeof mutate!=='function')fail('INVALID_STORE_TRANSACTION');
  await assertPlainPath(root);await fs.mkdir(versions,{recursive:true,mode:0o700});await assertPlainPath(versions);
  const lock=path.join(root,'write.lock'),nonce=randomUUID();let handle,temporary=null,temporaryOwned=false;
  try{handle=await fs.open(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('STORE_BUSY');throw e;}
  try{
   await handle.writeFile(nonce);await handle.sync();
   const previous=await readInternal();if((previous?.revision??0)!==expectedRevision)fail('STORE_REVISION_CONFLICT');
   if(previous&&Date.parse(at)<Date.parse(previous.at))fail('STORE_TIME_REGRESSION');
   if(expectedRevision>=maxRevisions)fail('STORE_REVISION_LIMIT');
   const state=mutate(clone(previous?.state??initialState));validate(state);canonicalJSON(state);
   if(previous&&stateDigest(previous.state)===stateDigest(state))return{...(await read()),changed:false};
   const row={schemaVersion:1,kind,revision:expectedRevision+1,at:new Date(at).toISOString(),action,previous:previous?.pointer??null,state};
   const name='revision-'+row.revision+'-'+randomUUID()+'.json';await writeNew(path.join(versions,name),row);
   const pointer={file:name,sha256:stateDigest(row)};
   temporary=path.join(root,'.head-'+randomUUID()+'.tmp');await writeNew(temporary,pointer);temporaryOwned=true;
   if(previous){if(await readText(head)!==previous.headText)fail('STORE_HEAD_CHANGED');await fs.rename(temporary,head);}
   else{await fs.link(temporary,head);await fs.unlink(temporary);}
   temporary=null;temporaryOwned=false;return{...(await read()),changed:true};
  }finally{
   try{if(temporary&&temporaryOwned)await fs.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
   finally{await handle.close();if(await fs.readFile(lock,'utf8')===nonce)await fs.unlink(lock);else fail('STORE_LOCK_CHANGED');}
  }
 }
 return{read,transact};
}
