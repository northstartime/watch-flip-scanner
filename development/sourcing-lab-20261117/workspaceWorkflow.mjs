import {createSnapshotStore} from './reused/development/storage/snapshotStore.mjs';
const sources=['ebay','chrono24','grailzee','reddit','watchfinder','watchcharts','facebook'];
const homes={ebay:'https://www.ebay.com/',chrono24:'https://www.chrono24.com/',grailzee:'https://grailzee.com/',reddit:'https://www.reddit.com/r/Watchexchange/',watchfinder:'https://www.watchfinder.com/',watchcharts:'https://watchcharts.com/',facebook:'https://www.facebook.com/'};
const fail=code=>{throw Object.assign(Error(code),{code});};
export function createWorkspaceStore(directory){
 const store=createSnapshotStore(directory,{kind:'sourcing-workspace',validate:s=>{for(const field of ['watchlist','saved','scans'])if(!Array.isArray(s[field])||s[field].length>1000)fail('INVALID_WORKSPACE');}});
 async function update(at,mutate){const row=await store.read();return store.transact({expectedRevision:row?.revision??0,at,action:'user_update',initialState:{watchlist:[],saved:[],scans:[]},mutate});}
 return{read:store.read,
  async watch(reference,enabled,{at,targets}){if(!targets.some(t=>t.reference===reference)||typeof enabled!=='boolean')fail('INVALID_WATCHLIST_TARGET');return update(at,s=>{s.watchlist=s.watchlist.filter(r=>r!==reference);if(enabled)s.watchlist.push(reference);return s;});},
  async save(key,enabled,note,{at,knownKeys}){if(!knownKeys.includes(key)||typeof enabled!=='boolean'||typeof note!=='string'||note.length>2000)fail('INVALID_SAVED_OPPORTUNITY');return update(at,s=>{s.saved=s.saved.filter(r=>r.key!==key);if(enabled)s.saved.push({key,note,at});return s;});},
  async scan({source,reference,outcome,note},{at,targets}){if(!sources.includes(source)||!targets.some(t=>t.reference===reference)||!['authorized_export_imported','reviewed_no_export','blocked'].includes(outcome)||typeof note!=='string'||note.length>2000)fail('INVALID_SCAN_RECORD');return update(at,s=>{s.scans=s.scans.filter(r=>r.source!==source||r.reference!==reference);s.scans.push({source,reference,outcome,note,completedAt:at});return s;});}
 };
}
export function planManualScan(targets,workspace,{source='ebay',now,limit=4}={}){
 if(!sources.includes(source)||!Number.isFinite(Date.parse(now))||!Number.isSafeInteger(limit)||limit<1||limit>4)fail('INVALID_MANUAL_SCAN_PLAN');
 const chosen=workspace.watchlist.length?targets.filter(t=>workspace.watchlist.includes(t.reference)):targets;
 return{source,mode:'manual_only',maximumTargets:limit,automaticRequests:0,windowEndsAt:new Date(Date.parse(now)+20*60000).toISOString(),
  tasks:[...chosen].sort((a,b)=>{const last=t=>Date.parse(workspace.scans.find(s=>s.reference===t.reference&&s.source===source)?.completedAt??'')||0;return last(a)-last(b)||a.reference.localeCompare(b.reference);}).slice(0,limit).map(t=>({reference:t.reference,brand:t.brand,searchTerm:`${t.brand} ${t.reference}`,url:homes[source],lastScan:workspace.scans.find(s=>s.reference===t.reference&&s.source===source)??null,
   steps:['Use the platform’s permitted native search','Check original date, status, ask, currency and full configuration','Import only independently authorized export data','Record outcome; a scan is not listing verification']}))};
}
export function reviewedRelistHistory(history,entry,{now}={}){
 const byKey=new Map(history.listings.map(r=>[r.key,r])),pending=[entry.key],seen=new Set(pending),links=[];
 while(pending.length){const to=pending.pop();for(const link of history.relistings.filter(l=>l.to===to&&l.status==='reviewed'))if(!seen.has(link.from)){seen.add(link.from);pending.push(link.from);links.push(link);}}
 const times=[...seen].map(k=>byKey.get(k)).filter(Boolean).map(r=>Date.parse(r.originalListedAt??r.firstObservedAt));const earliest=Math.min(...times);
 return{relisted:links.length>0,reviewedLinks:links.length,oldestReviewedListingAt:new Date(earliest).toISOString(),lineageAgeDays:Math.floor((Date.parse(now)-earliest)/86400000),continuousAvailabilityProven:false};
}
