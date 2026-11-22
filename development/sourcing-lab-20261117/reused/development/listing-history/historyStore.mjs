import {createSnapshotStore,canonicalJSON} from '../storage/snapshotStore.mjs';
import {observeListing,motivation} from './history.mjs';
const fail=code=>{const e=Error(code);e.code=code;throw e;};
function validate(state){
 if(!state||!Array.isArray(state.listings)||!Array.isArray(state.relistings))fail('INVALID_HISTORY_STORE');
 const keys=new Set();
 for(const row of state.listings){
  if(!row||row.key!==JSON.stringify([row.source,row.sourceRecordId])||keys.has(row.key)||!Array.isArray(row.observations)||!row.observations.length||!Array.isArray(row.priceHistory)||!Number.isFinite(Date.parse(row.firstObservedAt))||!Number.isFinite(Date.parse(row.lastObservedAt))||Date.parse(row.firstObservedAt)>Date.parse(row.lastObservedAt))fail('INVALID_HISTORY_LISTING');keys.add(row.key);
 }
 for(const link of state.relistings){if(!keys.has(link.from)||!keys.has(link.to)||link.from===link.to||typeof link.proofId!=='string'||!link.proofId.trim()||link.status!=='reviewed')fail('INVALID_RELISTING_PROOF');}
}
function closesRelistingCycle(links,from,to){
 const successors=new Map();
 for(const link of links){
  if(!successors.has(link.from))successors.set(link.from,[]);
  successors.get(link.from).push(link.to);
 }
 const pending=[to],visited=new Set([to]);
 while(pending.length){
  const key=pending.pop();
  if(key===from)return true;
  for(const next of successors.get(key)??[]){
   if(visited.has(next))continue;
   visited.add(next);
   pending.push(next);
  }
 }
 return false;
}
export function createHistoryStore(directory){
 const store=createSnapshotStore(directory,{kind:'listing-history',validate});
 return{
  read:store.read,
  async ingest(observations,{expectedRevision,at}={}){
   if(!Array.isArray(observations)||!observations.length||observations.length>10000)fail('OBSERVATION_BATCH_REQUIRED');
   return store.transact({expectedRevision,at,action:'observe',initialState:{listings:[],relistings:[]},mutate:state=>{
    const byKey=new Map(state.listings.map((row,i)=>[row.key,i]));
    for(const raw of observations){
     if(Date.parse(raw.observedAt)>Date.parse(at))fail('OBSERVATION_AFTER_BATCH_TIME');
     const key=JSON.stringify([raw.source,raw.sourceRecordId]),index=byKey.get(key);
     const {entry}=observeListing(index===undefined?null:state.listings[index],raw);
     if(index===undefined){byKey.set(key,state.listings.length);state.listings.push(entry);}else state.listings[index]=entry;
    }
    return state;
   }});
  },
  async linkRelisting({from,to,proofId},{expectedRevision,at}={}){
   if(typeof proofId!=='string'||!proofId.trim()||proofId.length>200)fail('RELISTING_PROOF_REQUIRED');
   return store.transact({expectedRevision,at,action:'review_relisting',initialState:{listings:[],relistings:[]},mutate:state=>{
    const a=state.listings.find(r=>r.key===from),b=state.listings.find(r=>r.key===to);
    if(!a||!b||from===to||Date.parse(a.firstObservedAt)>Date.parse(b.firstObservedAt))fail('INVALID_RELISTING_ORDER');
    if(!a.content.watch||!b.content.watch||canonicalJSON(a.content.watch)!==canonicalJSON(b.content.watch))fail('RELISTING_WATCH_MISMATCH');
    if(state.relistings.some(r=>r.from===from&&r.to===to))return state;
    if(closesRelistingCycle(state.relistings,from,to))fail('RELISTING_CYCLE');
    state.relistings.push({from,to,proofId:proofId.trim(),status:'reviewed',reviewedAt:new Date(at).toISOString()});
    return state;
   }});
  },
  async dashboard({now,...policy}={}){
   const snapshot=await store.read();if(!snapshot)return{revision:0,listings:[]};
   return{revision:snapshot.revision,listings:snapshot.state.listings.map(entry=>({entry,analysis:motivation(entry,{now,...policy}),reviewedRelistingCount:snapshot.state.relistings.filter(r=>r.to===entry.key).length}))};
  }
 };
}
