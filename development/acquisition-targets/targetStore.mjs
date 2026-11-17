// Local foundation only. No server routes, credentials, networking or production wiring.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

const brands=new Map(['Rolex','Tudor','Omega','Cartier'].map(name=>[name.toLowerCase(),name]));
const fields=new Set(['brand','reference','configuration','preliminaryMaximumAllIn','minimumNetProfit','enabled','notes']);
const configurationFields=new Set(['dial','bracelet','caseMaterial','year','condition','completeness']);
const own=(o,k)=>Object.hasOwn(o,k);
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
const clone=v=>JSON.parse(JSON.stringify(v));
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));}
function amount(value){
 if(value===undefined||value===null)return null;
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0||value>100000000||Math.abs(value*100-Math.round(value*100))>0.00001)fail('INVALID_ACQUISITION_AMOUNT');
 return value;
}
export function normalizeTarget(input){
 if(!object(input)||Object.keys(input).some(k=>!fields.has(k)))fail('INVALID_TARGET_FIELDS');
 const brand=brands.get(String(input.brand??'').trim().toLowerCase());
 const reference=String(input.reference??'').trim().toUpperCase();
 if(!brand||!reference||reference.length>64||!/^[A-Z0-9]+(?:\.[A-Z0-9]+)*$/.test(reference))fail('INVALID_TARGET_IDENTITY');
 if(input.enabled!==undefined&&typeof input.enabled!=='boolean')fail('INVALID_TARGET_ENABLED');
 const configuration={};
 if(input.configuration!==undefined){
  if(!object(input.configuration))fail('INVALID_TARGET_CONFIGURATION');
  for(const key of Object.keys(input.configuration).sort()){
   const value=input.configuration[key];
   if(!configurationFields.has(key)||typeof value!=='string'||!value.trim()||value.length>120||/[\x00-\x1f]/.test(value))fail('INVALID_TARGET_CONFIGURATION');
   configuration[key]=value.trim();
  }
 }
 if(input.notes!==undefined&&(typeof input.notes!=='string'||input.notes.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.notes)))fail('INVALID_TARGET_NOTES');
 return {brand,reference,configuration,preliminaryMaximumAllIn:amount(input.preliminaryMaximumAllIn),
  minimumNetProfit:amount(input.minimumNetProfit),enabled:input.enabled??true,notes:input.notes??''};
}
function identity(target){return JSON.stringify([target.brand,target.reference,Object.entries(target.configuration).map(([k,v])=>[k,v.toLowerCase()])]);}
function assertUnique(targets){const keys=targets.map(identity);if(new Set(keys).size!==keys.length)fail('DUPLICATE_TARGET_CONFIGURATION');}
async function plain(file){
 for(let current=path.resolve(file);;current=path.dirname(current)){
  try{if((await fs.lstat(current)).isSymbolicLink())fail('TARGET_STORAGE_REDIRECTED');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(path.dirname(current)===current)break;
 }
}
async function writeNew(file,value){
 await plain(file);const handle=await fs.open(file,'wx',0o600);
 try{await handle.writeFile(JSON.stringify(value,null,2));await handle.sync();}finally{await handle.close();}
}
function digest(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function validateState(state){
 if(!object(state)||state.schemaVersion!==1||state.currency!=='USD'||!Number.isSafeInteger(state.revision)||state.revision<1||!Array.isArray(state.targets)||!Array.isArray(state.audit)||typeof state.includeExceptionalNonTargets!=='boolean')fail('INVALID_TARGET_STORE');
 const ids=new Set();
 for(const row of state.targets){
  if(!object(row)||typeof row.id!=='string'||!/^target-[a-f0-9-]{36}$/.test(row.id)||ids.has(row.id))fail('INVALID_TARGET_STORE');
  ids.add(row.id);
  const {id,createdAt,updatedAt,...input}=row;
  if(!Number.isFinite(Date.parse(createdAt))||!Number.isFinite(Date.parse(updatedAt))||Date.parse(updatedAt)<Date.parse(createdAt))fail('INVALID_TARGET_STORE');
  if(JSON.stringify(normalizeTarget(input))!==JSON.stringify(input))fail('INVALID_TARGET_STORE');
 }
 assertUnique(state.targets);
 if(state.audit.length!==state.revision||state.audit.some((e,i)=>e.revision!==i+1||!['initialize','add','update','remove','policy'].includes(e.action)||!Number.isFinite(Date.parse(e.time))))fail('INVALID_TARGET_AUDIT');
 return state;
}

export function createTargetStore(directory){
 const root=path.resolve(directory),head=path.join(root,'head.json'),versions=path.join(root,'versions');
 async function read(){
  await plain(head);let pointer;
  try{pointer=JSON.parse(await fs.readFile(head,'utf8'));}catch(e){if(e.code==='ENOENT')return null;fail('INVALID_TARGET_HEAD');}
  if(!object(pointer)||!/^revision-[1-9][0-9]*-[a-f0-9-]{36}\.json$/.test(pointer.file)||!/^[a-f0-9]{64}$/.test(pointer.sha256))fail('INVALID_TARGET_HEAD');
  const file=path.join(versions,pointer.file);await plain(file);
  const state=JSON.parse(await fs.readFile(file,'utf8'));
  if(digest(state)!==pointer.sha256)fail('TARGET_REVISION_HASH_MISMATCH');
  return clone(validateState(state));
 }
 async function change(expectedRevision,action,mutate){
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)fail('EXPECTED_REVISION_REQUIRED');
  await plain(root);await fs.mkdir(versions,{recursive:true,mode:0o700});await plain(versions);
  const lock=path.join(root,'write.lock');let handle;
  try{handle=await fs.open(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')fail('TARGET_STORE_BUSY');throw e;}
  let temporary;
  try{
   const previous=await read();if((previous?.revision??0)!==expectedRevision)fail('TARGET_REVISION_CONFLICT');
   const state=previous??{schemaVersion:1,currency:'USD',revision:0,includeExceptionalNonTargets:true,targets:[],audit:[]};
   const now=new Date().toISOString();const targetId=mutate(state,now);
   assertUnique(state.targets);state.revision++;state.audit.push({revision:state.revision,action,time:now,...(targetId?{targetId}:{})});
   validateState(state);
   const file=`revision-${state.revision}-${randomUUID()}.json`;await writeNew(path.join(versions,file),state);
   temporary=path.join(root,`.head-${randomUUID()}.tmp`);await writeNew(temporary,{file,sha256:digest(state)});
   // Writer lock serializes cooperating writers; first publication never overwrites.
   if(previous)await fs.rename(temporary,head);else{await fs.link(temporary,head);await fs.unlink(temporary);}
   temporary=null;return clone(state);
  }finally{
   try{if(temporary)await fs.unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
   finally{try{await handle.close();}finally{await fs.unlink(lock);}}
  }
 }
 return {
  read,
  initialize(seed){
   if(!object(seed)||seed.schemaVersion!==1||seed.currency!=='USD'||!Array.isArray(seed.targets)||typeof seed.includeExceptionalNonTargets!=='boolean')fail('INVALID_TARGET_SEED');
   const rows=seed.targets.map(normalizeTarget);assertUnique(rows);
   return change(0,'initialize',(state,time)=>{state.includeExceptionalNonTargets=seed.includeExceptionalNonTargets;state.targets=rows.map(row=>({id:`target-${randomUUID()}`,createdAt:time,updatedAt:time,...row}));});
  },
  add(input,revision){const row=normalizeTarget(input);return change(revision,'add',(state,time)=>{const id=`target-${randomUUID()}`;state.targets.push({id,createdAt:time,updatedAt:time,...row});return id;});},
  update(id,patch,revision){
   if(!object(patch)||Object.keys(patch).some(k=>!fields.has(k)))fail('INVALID_TARGET_FIELDS');
   return change(revision,'update',(state,time)=>{const index=state.targets.findIndex(row=>row.id===id);if(index<0)fail('TARGET_NOT_FOUND');
    const {createdAt,updatedAt,id:stable,...original}=state.targets[index];
    state.targets[index]={id:stable,createdAt,updatedAt:time,...normalizeTarget({...original,...patch})};return stable;});
  },
  remove(id,revision){return change(revision,'remove',state=>{const index=state.targets.findIndex(row=>row.id===id);if(index<0)fail('TARGET_NOT_FOUND');state.targets.splice(index,1);return id;});},
  setExceptionalPolicy(enabled,revision){if(typeof enabled!=='boolean')fail('INVALID_TARGET_POLICY');return change(revision,'policy',state=>{state.includeExceptionalNonTargets=enabled;});}
 };
}

export function targetPriority(listing,state){
 // Prioritization is a hint, never a claim that an unknown configuration meets a ceiling.
 const brand=String(listing?.brand??'').trim().toLowerCase(),reference=String(listing?.reference??'').trim().toUpperCase();
 const matches=state.targets.filter(row=>row.enabled&&row.brand.toLowerCase()===brand&&row.reference===reference);
 return {priority:matches.length?'target':'standard',targetIds:matches.map(row=>row.id),
  configurationReviewRequired:matches.some(row=>Object.keys(row.configuration).length>0),
  include:matches.length>0||state.includeExceptionalNonTargets,marketValidationStatus:'unverified',
  validatedMaximumAllIn:null,recommendedOpeningOffer:null,verifiedExitValue:null,estimatedNetProfit:null,estimatedROI:null};
}
