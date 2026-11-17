// Evidence normalization only; no network or implicit verification.
const kinds=new Set(['asking','sold','estimate','executable_exit','bid']);
const fail=code=>{const error=Error(code);error.code=code;throw error;};
export function safeURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)return null;if([...u.searchParams.keys()].some(k=>/^(?:access_token|token|api[_-]?key|authorization|password|secret|sessionid|x-amz-(?:signature|credential|security-token))$/i.test(k)))return null;u.hash='';return u.href;}catch{return null;}}
export function identity(input){
 const brand=String(input?.brand??'').trim(),reference=String(input?.reference??'').trim().toUpperCase();
 if(!brand||!reference||reference.length>64||!/^[A-Z0-9]+(?:\.[A-Z0-9]+)*$/.test(reference))return null;
 const configuration={};
 if(input.configuration!==undefined&&(input.configuration===null||Array.isArray(input.configuration)||typeof input.configuration!=='object'))return null;
 for(const key of Object.keys(input.configuration??{}).sort()){
  const value=input.configuration[key];if(!/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(key)||typeof value!=='string'||!value.trim()||value.length>120)return null;configuration[key]=value.trim();
 }
 return {brand,reference,configuration};
}
export function normalizeEvidence(input){
 const watch=identity(input?.watch),url=safeURL(input?.url),time=Date.parse(input?.observedAt),event=Date.parse(input?.eventAt);
 if(!watch||!url||!Number.isFinite(time)||!kinds.has(input.kind)||typeof input.source!=='string'||!input.source.trim()||typeof input.recordId!=='string'||!input.recordId.trim())fail('INVALID_EVIDENCE_PROVENANCE');
 if(typeof input.amount!=='number'||!Number.isFinite(input.amount)||input.amount<=0||input.amount>100000000||input.currency!=='USD')fail('UNSUPPORTED_EVIDENCE_AMOUNT');
 if(input.eventAt!==undefined&&input.eventAt!==null&&(!Number.isFinite(event)||event>time))fail('INVALID_EVIDENCE_EVENT_TIME');
 const verified=input.verification?.status==='verified';
 if(verified&&(!['official_api','authorized_export_review','manual_review'].includes(input.verification.method)||typeof input.verification.proofId!=='string'||!input.verification.proofId.trim()||!Number.isFinite(Date.parse(input.verification.checkedAt))||Date.parse(input.verification.checkedAt)>time))fail('VERIFICATION_PROOF_REQUIRED');
 if(verified&&['sold','executable_exit'].includes(input.kind)&&!Number.isFinite(event))fail('VERIFIED_EVENT_DATE_REQUIRED');
 if(input.kind==='executable_exit'&&(!Number.isFinite(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=event))fail('EXIT_EXPIRY_REQUIRED');
 if(input.saleChannel!==undefined&&!['wholesale','retail','private','auction','unknown'].includes(input.saleChannel))fail('INVALID_EVIDENCE_SALE_CHANNEL');
 return {source:input.source.trim(),recordId:input.recordId.trim(),url,watch,kind:input.kind,amount:input.amount,currency:'USD',
  observedAt:new Date(time).toISOString(),eventAt:Number.isFinite(event)?new Date(event).toISOString():null,
  verification:verified?{status:'verified',method:input.verification.method,proofId:input.verification.proofId.trim(),checkedAt:new Date(input.verification.checkedAt).toISOString()}:{status:'unverified'},
  expiresAt:input.kind==='executable_exit'?new Date(input.expiresAt).toISOString():null,
  originalListedAt:Number.isFinite(Date.parse(input.originalListedAt))&&Date.parse(input.originalListedAt)<=event?new Date(input.originalListedAt).toISOString():null,
  ...(input.saleChannel===undefined?{}:{saleChannel:input.saleChannel})};
}
export function configurationMatches(required,observed){return Object.entries(required??{}).every(([key,value])=>typeof observed?.[key]==='string'&&observed[key].trim().toLowerCase()===value.trim().toLowerCase());}
export function comparableEvidence(target,observations,{now,maxAgeDays=90,minSold=3}={}){
 const time=Date.parse(now);if(!Number.isFinite(time)||!Number.isFinite(maxAgeDays)||maxAgeDays<=0||!Number.isSafeInteger(minSold)||minSold<1)fail('EXPLICIT_RESEARCH_POLICY_REQUIRED');
 const watch=identity(target);if(!watch)fail('INVALID_RESEARCH_IDENTITY');
 const accepted=[],rejected={},seen=new Set();
 for(const raw of observations){
  let row;try{row=normalizeEvidence(raw);}catch{rejected.invalid=(rejected.invalid??0)+1;continue;}
  let reason;
  if(row.watch.brand.toLowerCase()!==watch.brand.toLowerCase()||row.watch.reference!==watch.reference)reason='different_reference';
  else if(!configurationMatches(watch.configuration,row.watch.configuration))reason='configuration_unconfirmed';
  else if(row.kind!=='sold')reason='not_a_sold_comparable';
  else if(row.verification.status!=='verified')reason='unverified_sale';
  else if(Date.parse(row.observedAt)>time||Date.parse(row.eventAt)>time||time-Date.parse(row.eventAt)>maxAgeDays*86400000)reason='outside_time_window';
  const key=row.source.toLowerCase()+':'+row.recordId;
  // Original source URLs deduplicate syndicated records even with new wrapper IDs.
  const clean=new URL(row.url);clean.search='';const urlKey=clean.href;
  if(!reason&&(seen.has(key)||seen.has(urlKey)))reason='duplicate_sale';
  if(reason){rejected[reason]=(rejected[reason]??0)+1;continue;}
  seen.add(key);seen.add(urlKey);accepted.push(row);
 }
 const sorted=accepted.map(r=>r.amount).sort((a,b)=>a-b),middle=sorted.length/2;
 const median=sorted.length?(Number.isInteger(middle)?(sorted[middle-1]+sorted[middle])/2:sorted[Math.floor(middle)]):null;
 const sufficient=accepted.length>=minSold;
 const days=accepted.filter(r=>r.originalListedAt).map(r=>(Date.parse(r.eventAt)-Date.parse(r.originalListedAt))/86400000).sort((a,b)=>a-b);
 return {status:sufficient?'evidence_available':'insufficient_data',accepted,rejected,verifiedSoldCount:accepted.length,
  soldMedian:sufficient?median:null,conservativeGrossEstimate:sufficient?sorted[Math.floor((sorted.length-1)*0.25)]:null,
  valuationStatus:sufficient?'estimate_from_verified_sales':'insufficient_data',verifiedExitValue:null,
  liquidity:{observedSales:accepted.length,windowDays:maxAgeDays,observedDaysToSaleCount:days.length,
   medianObservedDaysToSale:days.length?days[Math.floor((days.length-1)/2)]:null,estimatedHoldingDays:null}};
}
