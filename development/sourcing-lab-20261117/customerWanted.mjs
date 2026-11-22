import {saleCalculator} from './saleProceeds.mjs';
import {randomUUID,createHash} from 'node:crypto';import {createSnapshotStore,canonicalJSON} from './reused/development/storage/snapshotStore.mjs';import {validCalendarTime} from './exportValidation.mjs';
import {acquisitionCalculator} from './acquisitionCosts.mjs';
import {hasDealQualityHold} from './dealQuality.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const fields=['customerCode','brand','reference','yearFrom','yearTo','dial','bracelet','condition','boxRequired','papersRequired','budgetUSD','deliverBy','minimumMarginUSD','acquisitionCapUSD'];
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()===b.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export const wantedRequestHash=entry=>createHash('sha256').update(canonicalJSON(entry)).digest('hex');
export function normalizeWanted(input,targets){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k))||!/^(?:CUST|SYNTH)-[A-Z0-9-]{1,32}$/.test(input.customerCode??'')||!targets.some(t=>t.brand===input.brand&&t.reference===input.reference))fail('PSEUDONYMOUS_CUSTOMER_AND_TARGET_REQUIRED');
 const r={};for(const key of fields)r[key]=input[key]??null;
 for(const key of ['dial','bracelet','condition'])if(r[key]!==null&&(typeof r[key]!=='string'||!r[key].trim()||r[key].length>80||/[\x00-\x1f<>]/.test(r[key])))fail('EXPLICIT_CUSTOMER_CONFIGURATION_REQUIRED');
 if((r.yearFrom!==null||r.yearTo!==null)&&(!Number.isInteger(r.yearFrom)||!Number.isInteger(r.yearTo)||r.yearFrom<1900||r.yearTo>2100||r.yearFrom>r.yearTo))fail('VALID_CUSTOMER_YEAR_RANGE_REQUIRED');
 if(typeof r.boxRequired!=='boolean'||typeof r.papersRequired!=='boolean'||typeof r.budgetUSD!=='number'||!Number.isFinite(r.budgetUSD)||r.budgetUSD<=0||r.budgetUSD>100000000||Math.abs(r.budgetUSD*100-Math.round(r.budgetUSD*100))>0.00001||!validCalendarTime(r.deliverBy))fail('EXPLICIT_CUSTOMER_BUDGET_AND_DEADLINE_REQUIRED');
 for(const field of ['minimumMarginUSD','acquisitionCapUSD'])if(r[field]!==null&&(typeof r[field]!=='number'||!Number.isFinite(r[field])||r[field]<0||r[field]>100000000||Math.abs(r[field]*100-Math.round(r[field]*100))>0.00001))fail('EXPLICIT_CUSTOMER_MARGIN_OR_CAP_REQUIRED');
 if(r.minimumMarginUSD!==null&&r.minimumMarginUSD<1000)fail('MINIMUM_NET_PROFIT_TARGET_1000');
 return r;
}
export function createWantedStore(directory,{targets,dataset}){
 if(!['demo','real'].includes(dataset))fail('INVALID_WANTED_DATASET');
 const dataKind=dataset==='demo'?'SYNTHETIC_FIXTURE':'OWNER_ENTERED_CUSTOMER_REQUEST';
 const store=createSnapshotStore(directory,{kind:'customer-wanted',validate:s=>{if(s.dataKind!==dataKind||!Array.isArray(s.entries)||s.entries.length>100||new Set(s.entries.map(e=>e.id)).size!==s.entries.length)fail('INVALID_WANTED_STORE');for(const e of s.entries){if(!/^[a-f0-9-]{36}$/.test(e.id)||typeof e.active!=='boolean'||!validCalendarTime(e.createdAt)||!validCalendarTime(e.updatedAt))fail('INVALID_WANTED_STORE');normalizeWanted(e.request,targets);}}});
 async function change(at,mutate){const before=await store.read();return store.transact({expectedRevision:before?.revision??0,at,action:'wanted_update',initialState:{dataKind,entries:[]},mutate});}
 return{read:store.read,async save(input,{at,id=null,expectedRequestHash}={}){
  const request=normalizeWanted(input,targets);if(!validCalendarTime(at)||Date.parse(request.deliverBy)<=Date.parse(at))fail('FUTURE_CUSTOMER_DELIVERY_DEADLINE_REQUIRED');
  const key=id??randomUUID();if(!/^[a-f0-9-]{36}$/.test(key))fail('VALID_WANTED_ID_REQUIRED');
  const written=await change(at,s=>{const old=s.entries.find(e=>e.id===key);if(id&&!old)fail('WANTED_NOT_FOUND');if(id&&expectedRequestHash!==undefined&&wantedRequestHash(old)!==expectedRequestHash)fail('WANTED_CHANGED_REOPEN_REQUEST');if(s.entries.some(e=>e.id!==key&&e.active&&canonicalJSON(normalizeWanted(e.request,targets))===canonicalJSON(request)))fail('DUPLICATE_ACTIVE_CUSTOMER_REQUEST');if(old){old.request=request;old.updatedAt=at;old.active=true;}else{if(s.entries.length>=100)fail('WANTED_LIMIT_REACHED');s.entries.push({id:key,request,active:true,createdAt:at,updatedAt:at});}return s;});return{id:key,requestHash:wantedRequestHash(written.state.entries.find(e=>e.id===key))};
 },async archive(id,{at,expectedRequestHash}){return change(at,s=>{const entry=s.entries.find(e=>e.id===id);if(!entry)fail('WANTED_NOT_FOUND');if(expectedRequestHash!==undefined&&wantedRequestHash(entry)!==expectedRequestHash)fail('WANTED_CHANGED_REOPEN_REQUEST');entry.active=false;entry.updatedAt=at;return s;});}};
}
export function matchWanted(entry,row,{now}={}){
 if(!validCalendarTime(now))fail('EXPLICIT_WANTED_MATCH_TIME_REQUIRED');
 const r={minimumMarginUSD:null,acquisitionCapUSD:null,...entry.request},base={wantedId:entry.id,customerCode:r.customerCode,key:row.key,customerBudgetUSD:r.budgetUSD,deliverBy:r.deliverBy,buyerCommitmentVerified:false,deliveryVerified:false,customerBudgetIsExitEvidence:false,purchaseAuthorized:false,automaticActions:0};
 if(!entry.active||Date.parse(r.deliverBy)<=Date.parse(now))return{...base,status:'INACTIVE_OR_EXPIRED',requirementMatch:false};
 let ebay=false;try{ebay=/(^|\.)ebay\.[a-z.]+$/i.test(new URL(row.url).hostname);}catch{}
 const rights=row.settings?.rights;
 if(String(row.source??'').trim().toLowerCase()==='ebay'||ebay||rights?.authorizedExport!==true||!rights.reference||!Number.isFinite(Date.parse(rights.expiresAt))||Date.parse(rights.expiresAt)<=Date.parse(now))return{...base,status:'SOURCE_RIGHTS_REQUIRED',requirementMatch:null};
 if(hasDealQualityHold(row))return{...base,status:'LISTING_QUALITY_HOLD',requirementMatch:null};
 if(row.analysis?.decision==='PASS')return{...base,status:'FINANCIAL_PASS',requirementMatch:false};
 const watch=row.watch;if(watch?.brand!==r.brand||watch.reference!==r.reference)return{...base,status:'DIFFERENT_TARGET',requirementMatch:false};
 const c=watch.configuration??{},missing=[],mismatches=[];
 for(const field of ['dial','bracelet','condition'])if(r[field]!==null){if(!c[field])missing.push(field);else if(!same(c[field],r[field]))mismatches.push(field);}
 if(r.yearFrom!==null){if(!/^\d{4}$/.test(c.year??''))missing.push('year');else if(Number(c.year)<r.yearFrom||Number(c.year)>r.yearTo)mismatches.push('year');}
 const full=['full set','original box and papers','box and papers'].some(v=>same(v,c.completeness));
 for(const field of ['box','papers'])if(r[field+'Required']){if(c[field]==='no'||same(c.completeness,'watch only'))mismatches.push(field);else if(c[field]!=='yes'&&!full)missing.push(field);}
 if(mismatches.length)return{...base,status:'CONFIGURATION_MISMATCH',requirementMatch:false,mismatches,missing};
 if(!row.history?.availableToAct)return{...base,status:'RECHECK_LISTING',requirementMatch:null,missing};
 if(missing.length)return{...base,status:'CONFIGURATION_UNKNOWN',requirementMatch:null,missing};
 const requiredMargin=Math.max(1000,r.minimumMarginUSD??1000,row.analysis?.minimumNetProfit??1000);
 const qualified=rights.pricingPermitted===true&&row.verified===true&&row.analysis?.decision==='BUY'&&row.analysis.estimatedNetProfit>=requiredMargin&&(r.acquisitionCapUSD===null||row.analysis.acquisitionAtAsk?.allIn<=r.acquisitionCapUSD);
 const financial=rights.pricingPermitted===true&&['BUY','NEGOTIATE'].includes(row.analysis?.decision)&&Number.isFinite(row.analysis?.acquisitionAtAsk?.allIn),sale=row.settings?.costs?.sale;
 let minimumCustomerSaleBeforeBuyerCharges=null;
 if(financial&&sale){try{minimumCustomerSaleBeforeBuyerCharges=saleCalculator(sale).minimumGrossForNet(Math.round((row.analysis.acquisitionAtAsk.allIn+requiredMargin)*100)/100);}catch{}}
 let customerMaximumAllIn=null,customerMaximumCashOffer=null;
 if(financial&&Number.isFinite(row.analysis.maximumAcquisitionAllIn)&&Number.isFinite(row.analysis.estimatedNetProfit)){
  const independentNet=row.analysis.acquisitionAtAsk.allIn+row.analysis.estimatedNetProfit;
  customerMaximumAllIn=Math.max(0,Math.floor(Math.min(row.analysis.maximumAcquisitionAllIn,independentNet-requiredMargin,r.acquisitionCapUSD??Infinity)*100+1e-8)/100);
  try{customerMaximumCashOffer=acquisitionCalculator(row.settings.costs).ceiling(customerMaximumAllIn);}catch{}
 }
 const customerTermsGap=financial&&(row.analysis.estimatedNetProfit<requiredMargin||(r.acquisitionCapUSD!==null&&row.analysis.acquisitionAtAsk.allIn>r.acquisitionCapUSD));
 const notViable=financial&&customerMaximumAllIn!==null&&(customerMaximumCashOffer===null||customerMaximumCashOffer<=0);
 const budgetGap=minimumCustomerSaleBeforeBuyerCharges!==null&&minimumCustomerSaleBeforeBuyerCharges>r.budgetUSD;
 return{...base,status:notViable?'CUSTOMER_MARGIN_NOT_VIABLE':budgetGap?'CUSTOMER_BUDGET_GAP':qualified?'QUALIFIED_BUY_BUYER_AND_DELIVERY_CONFIRMATION_REQUIRED':row.analysis?.decision==='NEGOTIATE'||customerTermsGap?'NEGOTIATION_CANDIDATE':'PRELIMINARY_MATCH',requirementMatch:true,independentlyQualifiedBuy:qualified,requiredMarginUSD:requiredMargin,customerAcquisitionCapUSD:r.acquisitionCapUSD,customerMaximumAllIn,customerMaximumCashOffer,minimumCustomerSaleBeforeBuyerCharges,budgetMeaning:'necessary_profit_floor_only_customer_tax_and_delivery_terms_unconfirmed',deliveryTimeframeDays:Math.ceil((Date.parse(r.deliverBy)-Date.parse(now))/86400000),nextAction:notViable?'Pass for this buyer under current evidence; the required margin or cap leaves no positive acquisition budget':budgetGap?'Seek a lower acquisition price or revise the request with the customer; do not raise the ceiling':customerTermsGap?'Negotiate at or below the customer-specific cash and all-in ceilings; confirm margin, buyer commitment and delivery':'Confirm buyer commitment, final delivered price and delivery feasibility before tying up capital'};
}
export function customerDemandSummary(entries,row,{now}={}){
 const matches=entries.filter(e=>e.request.brand===row.watch?.brand&&e.request.reference===row.watch?.reference).map(e=>matchWanted(e,row,{now}));
 return{qualifiedIntentMatches:new Set(matches.filter(m=>m.status==='QUALIFIED_BUY_BUYER_AND_DELIVERY_CONFIRMATION_REQUIRED').map(m=>m.customerCode)).size,negotiationIntentMatches:new Set(matches.filter(m=>m.status==='NEGOTIATION_CANDIDATE'&&row.settings?.rights?.pricingPermitted===true).map(m=>m.customerCode)).size,buyerCommitmentVerified:false,doesNotChangeExitOrCeiling:true};
}
export function wantedShortlist(entries,rows,{now}={}){
 const actionable=['QUALIFIED_BUY_BUYER_AND_DELIVERY_CONFIRMATION_REQUIRED','NEGOTIATION_CANDIDATE','PRELIMINARY_MATCH','CONFIGURATION_UNKNOWN','CUSTOMER_BUDGET_GAP'];
 const matches=[];let matchingPairs=0;const compare=(a,b)=>actionable.indexOf(a.status)-actionable.indexOf(b.status)||Date.parse(a.deliverBy)-Date.parse(b.deliverBy)||a.key.localeCompare(b.key);
 for(const e of entries)for(const row of rows){if(row.watch?.brand!==e.request.brand||row.watch?.reference!==e.request.reference)continue;const match=matchWanted(e,row,{now});if(actionable.includes(match.status)){matchingPairs++;matches.push(match);matches.sort(compare);if(matches.length>10)matches.pop();}}
 return{items:matches,matchingPairs,limit:10,customerBudgetIsExitEvidence:false,automaticActions:0};
}
