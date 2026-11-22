import {canonicalJSON} from './reused/development/storage/snapshotStore.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const normalized=value=>String(value??'').normalize('NFKC').trim();
const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const omitAbsent=v=>Array.isArray(v)?v.map(omitAbsent):v&&Object.getPrototypeOf(v)===Object.prototype?Object.fromEntries(Object.entries(v).filter(([,value])=>value!==undefined).map(([key,value])=>[key,omitAbsent(value)])):v;
export function listingExclusion(title){return /\b(?:replica|homage|deposit|down payment|for parts|box only|papers only|dial only|bracelet only|strap only|links only|bezel only|movement only|case only|WTB|wanted to buy)\b/i.test(String(title??''))?'non_whole_watch_or_unsafe_price':null;}

// Target aliases are syntactic only: Tudor's M prefix and -NNNN configuration
// suffix identify a base reference, but never prove dial/bracelet/year/condition.
export function identifyReference({title='',reference=null,brand=null}={},targets=[]){
 const text=normalized(title).toUpperCase(),explicit=reference===null?null:normalized(reference).toUpperCase();
 const brands=[...new Set(targets.map(t=>t.brand))];
 const titleBrands=brands.filter(b=>new RegExp(`\\b${escaped(b)}\\b`,'i').test(text));
 const matches=targets.filter(t=>{
  const ref=escaped(t.reference.toUpperCase()),pattern=t.brand==='Tudor'?`M?${ref}(?:-\\d{4})?`:t.brand==='Omega'?`(?:${ref}|${escaped(t.reference.replaceAll('.',''))})`:ref;
  return new RegExp(`(?<![A-Z0-9])${pattern}(?![A-Z0-9])`).test(text)||Boolean(explicit&&new RegExp(`^(?:${pattern})$`).test(explicit));
 });
 const unique=[...new Map(matches.map(t=>[JSON.stringify([t.brand,t.reference]),t])).values()];
 if(unique.length!==1)return{status:unique.length?'ambiguous_reference':'unknown_reference',watch:null};
 const target=unique[0];
 if(brand&&normalized(brand).toLowerCase()!==target.brand.toLowerCase()||titleBrands.some(b=>b!==target.brand))return{status:'brand_conflict',watch:null};
 if(explicit){const check=identifyReference({title:explicit},targets);if(check.watch?.reference!==target.reference)return{status:'reference_conflict',watch:null};}
 return{status:'reference_identified_configuration_unconfirmed',watch:{brand:target.brand,reference:target.reference,configuration:{}}};
}

export function freshness({observedAt,sourceListedAt=null,endedAt=null,status='unknown'},{now,maxObservationHours=24,newListingHours=24}={}){
 const time=Date.parse(now),observed=Date.parse(observedAt),listed=Date.parse(sourceListedAt),ended=Date.parse(endedAt);
 if(!Number.isFinite(time)||!Number.isFinite(maxObservationHours)||maxObservationHours<=0||!Number.isFinite(newListingHours)||newListingHours<=0)fail('INVALID_FRESHNESS_POLICY');
 const reasons=[];
 if(!Number.isFinite(observed))reasons.push('observation_time_unknown');
 else if(observed>time)reasons.push('future_observation');
 else if(time-observed>maxObservationHours*3600000)reasons.push('observation_stale');
 if(sourceListedAt!==null&&(!Number.isFinite(listed)||listed>observed))reasons.push('invalid_source_listing_time');
 if(endedAt!==null&&!Number.isFinite(ended))reasons.push('invalid_end_time');
 if(['sold','ended','withdrawn','reserve_not_met','wtb'].includes(status)||Number.isFinite(ended)&&ended<=time)reasons.push('not_currently_available');
 if(status!=='sale')reasons.push('availability_unconfirmed');
 const validListed=Number.isFinite(listed)&&Number.isFinite(observed)&&listed<=observed&&listed<=time;
 return{status:reasons.length?'RECHECK_REQUIRED':'FRESH_OBSERVATION',reasons,
  hoursSinceObserved:Number.isFinite(observed)&&observed<=time?(time-observed)/3600000:null,
  sourceDaysOnMarket:validListed?Math.floor((time-listed)/86400000):null,
  newlyListed:validListed&&time>=listed?time-listed<=newListingHours*3600000:null,
  availableToAct:reasons.length===0};
}

export function deduplicateRecords(rows){
 if(!Array.isArray(rows)||rows.length>10000)fail('INVALID_RECORD_BATCH');
 const records=[],conflicts=[],seen=new Map();let duplicates=0;
 for(const row of rows){
  if(typeof row?.source!=='string'||!row.source.trim()||typeof row.sourceRecordId!=='string'||!row.sourceRecordId.trim())fail('RECORD_ID_REQUIRED');
  const key=JSON.stringify([row.source.trim().toLowerCase(),row.sourceRecordId.trim()]);
  // Never fuzzy-merge similar titles/references: they can be different watches.
  const normalizedRow=omitAbsent({...row,source:row.source.trim().toLowerCase(),sourceRecordId:row.sourceRecordId.trim()});
  const digest=canonicalJSON(normalizedRow),before=seen.get(key);
  if(before){if(before.digest===digest)duplicates++;else{before.conflicted=true;conflicts.push({key,reason:'conflicting_same_source_record'});}continue;}
  const item={key,digest,row:normalizedRow,conflicted:false};seen.set(key,item);records.push(item);
 }
 return{records:records.filter(r=>!r.conflicted).map(r=>r.row),duplicates,conflicts};
}

export function summarizeHistory(entry,{now,maximumGapDays=7}={}){
 const age=freshness({observedAt:entry.lastObservedAt,sourceListedAt:entry.originalListedAt,status:entry.content.saleStatus},{now});
 const reductions=entry.priceHistory.filter(p=>p.reduction);
 const latest=entry.content.askingPrice??null,initial=entry.priceHistory[0];
 const sameCurrency=initial&&entry.content.currency===initial.currency;
 const last=entry.priceHistory.at(-1),previous=entry.priceHistory.at(-2);let latestPriceChange=null;
 if(last&&previous&&Number.isFinite(Date.parse(last.observedAt))&&Date.parse(last.observedAt)<=Date.parse(now)){const comparable=last.currency===previous.currency;latestPriceChange={direction:!comparable?'currency_changed':last.amount<previous.amount?'decrease':last.amount>previous.amount?'increase':'unchanged',amountChange:comparable?Math.round((last.amount-previous.amount)*100)/100:null,currency:last.currency,observedAt:last.observedAt,appliesToCurrentAsk:latest!==null&&latest===last.amount&&entry.content.currency===last.currency};}
 const supportsReductionInference=latest!==null&&(!latestPriceChange||latestPriceChange.appliesToCurrentAsk&&latestPriceChange.direction==='decrease');
 const elapsed=Date.parse(now)-Date.parse(entry.firstObservedAt);
 let largestGapMs=0;for(let i=1;i<entry.observations.length;i++)largestGapMs=Math.max(largestGapMs,Date.parse(entry.observations[i].observedAt)-Date.parse(entry.observations[i-1].observedAt));
 return{...age,daysSinceFirstObserved:Math.floor(elapsed/86400000),observationCount:entry.observations.length,
  currentAskingPrice:latest,latestPriceChange,lastKnownAskingPrice:entry.priceHistory.at(-1)??null,
  priceReductionCount:reductions.length,netReduction:sameCurrency&&latest!==null?Math.round((initial.amount-latest)*100)/100:null,
  netReductionPercent:sameCurrency&&latest!==null?Math.round((initial.amount-latest)/initial.amount*10000)/100:null,
  continuity:largestGapMs>maximumGapDays*86400000?'observation_gaps':'observed_points_only',
  continuousAvailabilityProven:false,sellerMotivation:'not_verified',
  researchLeads:entry.content.auctionStatus==='reserve_not_met'?[{kind:'reported_failed_reserve',type:'source_reported_not_independently_verified',nextStep:'Check permitted last-chance workflow and seller availability; not a sold comp or executable offer'}]:[],
  signals:age.availableToAct?[...(reductions.length>=2&&supportsReductionInference?[{kind:'repeated_reductions',basis:'dated_observations',type:'inference'}]:[])]:[]};
}
