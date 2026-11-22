import {normalizeEvidence,identity,comparableEvidence} from './reused/development/market-intelligence/evidence.mjs';
import {createEvidenceStore} from './reused/development/market-intelligence/evidenceStore.mjs';
import {canonicalJSON} from './reused/development/storage/snapshotStore.mjs';
import {isWatchChartsEvidence} from './manualEntry.mjs';
const known=v=>typeof v==='string'&&v.trim()&&!/^(unknown|unspecified|not known|n\/a|na|\?|-)$/.test(v.trim().toLowerCase());
const equal=(a,b)=>String(a).trim().toLowerCase()===String(b).trim().toLowerCase();

export function explainCompMatch(watch,input,{now,maxAgeDays=90,requireBezel=false}={}){
 const target=identity(watch),time=Date.parse(now);
 if(!target||!Number.isFinite(time)||!Number.isFinite(maxAgeDays)||maxAgeDays<=0)throw Error('EXPLICIT_COMP_POLICY_REQUIRED');
 let row;try{row=normalizeEvidence({...input,verification:{status:'unverified'}});}catch{return{eligibleForReview:false,reasons:['invalid_evidence'],providerVerificationAccepted:false};}
 const reasons=[];
 if(!equal(row.watch.brand,target.brand)||!equal(row.watch.reference,target.reference))reasons.push('different_reference');
 for(const field of new Set(['dial','bracelet','year','condition',...((requireBezel||target.reference==='16622')?['bezel']:[]),...Object.keys(target.configuration),...Object.keys(row.watch.configuration)])){
  if(!known(target.configuration[field]))reasons.push(`listing_${field}_unconfirmed`);
  else if(!known(row.watch.configuration[field]))reasons.push(`comp_${field}_unconfirmed`);
  else if(!equal(row.watch.configuration[field],target.configuration[field]))reasons.push(`${field}_mismatch`);
 }
 if(row.kind!=='sold')reasons.push('not_a_sold_comparable');
 if(isWatchChartsEvidence(row.source,row.url))reasons.push('provider_estimate_source');
 if(!Number.isFinite(Date.parse(row.eventAt)))reasons.push('sale_date_required');
 else if(Date.parse(row.eventAt)>time||time-Date.parse(row.eventAt)>maxAgeDays*86400000)reasons.push('outside_sale_window');
 if(Date.parse(row.observedAt)>time)reasons.push('future_observation');
 return{eligibleForReview:reasons.length===0,reasons,source:row.source,recordId:row.recordId,url:row.url,amount:row.amount,currency:row.currency,
  verification:'requires_existing_review_store',providerVerificationAccepted:false};
}

// A reviewed sale can have multiple wrappers. Build connected provenance groups
// before counting, so A shares ID with B and B shares URL with C counts once.
// Unknown semantic query parameters are preserved, not erased to force a match.
function provenanceURL(value){const u=new URL(value);u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(?:fbclid|gclid)$/i.test(key))u.searchParams.delete(key);u.searchParams.sort();return u.href;}
export function deduplicateReviewedEvidence(rows){
 const groups=[],byKey=new Map();
 for(const row of rows){
  const keys=[canonicalJSON([row.source.toLowerCase(),row.recordId]),provenanceURL(row.url)];
  const linked=[...new Set(keys.map(k=>byKey.get(k)).filter(Boolean))];
  const group=linked[0]??{rows:[],keys:new Set(),active:true};
  if(!linked.length)groups.push(group);
  for(const other of linked.slice(1)){group.rows.push(...other.rows);for(const key of other.keys){group.keys.add(key);byKey.set(key,group);}other.active=false;}
  group.rows.push(row);for(const key of keys){group.keys.add(key);byKey.set(key,group);}
 }
 const accepted=[],conflicts=[];let duplicates=0;
 for(const group of groups.filter(g=>g.active)){
  const signatures=new Set(group.rows.map(r=>canonicalJSON({kind:r.kind,watch:r.watch,amount:r.amount,currency:r.currency,eventAt:r.eventAt,...(r.kind==='executable_exit'?{expiresAt:r.expiresAt}:{saleChannel:r.saleChannel??'unknown'})})));
  if(signatures.size>1){conflicts.push({records:group.rows.map(r=>({source:r.source,recordId:r.recordId})),reason:'contradictory_reviewed_sale_provenance'});continue;}
  accepted.push([...group.rows].sort((a,b)=>canonicalJSON([a.source,a.recordId]).localeCompare(canonicalJSON([b.source,b.recordId])))[0]);duplicates+=group.rows.length-1;
 }
 return{accepted,conflicts,duplicates};
}

export const deduplicateReviewedSales=deduplicateReviewedEvidence;

export async function researchReviewedStore(directory,watch,policy={}){
 const snapshot=await createEvidenceStore(directory).read();
 return researchReviewedSnapshot(snapshot,watch,policy);
}
export function researchReviewedSnapshot(snapshot,watch,{now,maxAgeDays=90,minSold=3,requireCompleteness=false,requireBezel=false}={}){
 const records=snapshot?.state.records??[];
 const diagnostics=records.map(r=>{const diagnostic=explainCompMatch(watch,r.evidence,{now,maxAgeDays,requireBezel});if(requireCompleteness){for(const [prefix,configuration]of [['listing',watch.configuration],['comp',r.evidence.watch.configuration]])if(!known(configuration?.completeness))diagnostic.reasons.push(prefix+'_completeness_unconfirmed');diagnostic.eligibleForReview=diagnostic.reasons.length===0;}return diagnostic;});
 const eligible=records.filter((r,i)=>diagnostics[i].eligibleForReview&&r.evidence.verification.status==='verified'&&r.review&&!r.review.revoked);
 const dedup=deduplicateReviewedSales(eligible.map(r=>r.evidence));
 const baseline=comparableEvidence(watch,[],{now,maxAgeDays,minSold});
 // Shared matcher validates each sale; provenance dedup above preserves meaningful
 // URL queries that the legacy batch matcher conservatively strips.
 const checks=dedup.accepted.map(row=>comparableEvidence(watch,[row],{now,maxAgeDays,minSold:1}));
 const accepted=checks.flatMap(r=>r.accepted),sorted=accepted.map(r=>r.amount).sort((a,b)=>a-b),enough=accepted.length>=minSold;
 const rejected={};for(const result of checks)for(const [key,count]of Object.entries(result.rejected))rejected[key]=(rejected[key]??0)+count;
 const middle=sorted.length/2,median=sorted.length?(Number.isInteger(middle)?(sorted[middle-1]+sorted[middle])/2:sorted[Math.floor(middle)]):null;
 return{...baseline,storeRevision:snapshot?.revision??0,status:enough?'evidence_available':'insufficient_data',accepted,rejected,verifiedSoldCount:accepted.length,
  soldMedian:enough?median:null,conservativeGrossEstimate:enough?sorted[Math.floor((sorted.length-1)*0.25)]:null,valuationStatus:enough?'estimate_from_verified_sales':'insufficient_data',
  liquidity:{...baseline.liquidity,observedSales:accepted.length},diagnostics,
  provenanceConflicts:dedup.conflicts,provenanceDuplicates:dedup.duplicates,providerClaimsNeverVerify:true};
}
