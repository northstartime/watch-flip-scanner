// Offline preparation only. No network, credentials, portal automation or writes.
import {manualListingRequest,manualEvidenceRequest} from './manualEntry.mjs';
import {importListingCSV} from './listingExport.mjs';
import {authorizedEvidenceCSV} from './reused/development/market-intelligence/authorizedExport.mjs';
import {validCalendarTime} from './exportValidation.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function chrono24Eligibility(facts={}){
 const checks={registeredBusiness:facts.registeredBusiness,watchRelatedBusiness:facts.watchRelatedBusiness,allInventoryListed:facts.allInventoryListed,shipsInThreeWorkingDays:facts.shipsInThreeWorkingDays,eligibleStockAtLeastTen:Number.isInteger(facts.eligibleReadyWatchCount)&&facts.eligibleReadyWatchCount>=0?facts.eligibleReadyWatchCount>=10:null,europeanVAT:facts.europeanDealer===false?true:facts.europeanDealer===true?facts.viesRegistered:null};
 const unmet=Object.keys(checks).filter(key=>checks[key]===false),unknown=Object.keys(checks).filter(key=>checks[key]!==true&&checks[key]!==false);
 return {status:unmet.length?'REQUIREMENTS_NOT_MET':unknown.length?'OWNER_FACTS_REQUIRED':'POTENTIALLY_ELIGIBLE_PROVIDER_REVIEW_REQUIRED',unmet,unknown,existingDealerReported:facts.existingRegisteredDealer===true,providerApprovalVerified:false,registrationAuthorized:false,purchaseAuthorized:false,networkCalls:0};
}
function permission(authorization,scope,now){
 if(authorization?.source!=='chrono24'||authorization.authorizedToProcess!==true||authorization.historyPermitted!==true||authorization.manualExportPermitted!==true||typeof authorization.reference!=='string'||!authorization.reference.trim()||!validCalendarTime(authorization.expiresAt)||Date.parse(authorization.expiresAt)<=Date.parse(now)||!Array.isArray(authorization.scopes)||!authorization.scopes.includes(scope))fail('DOCUMENTED_CHRONO24_EXPORT_RETENTION_SCOPE_REQUIRED');
 return {confirmed:true,reference:authorization.reference,expiresAt:authorization.expiresAt};
}
const hostAllowed=value=>{let url;try{url=new URL(value);}catch{fail('CHRONO24_PROVENANCE_URL_REQUIRED');}if(url.protocol!=='https:'||!['www.chrono24.com','chrono24.com'].includes(url.hostname)||url.username||url.password||url.port||[...url.searchParams.keys()].some(key=>/token|secret|password|session|signature|credential/i.test(key)))fail('CHRONO24_PROVENANCE_URL_REQUIRED');return url.href;};
export function prepareChrono24Intake({schemaVersion,dataKind,provenance,entries,authorization,targets,now}={}){
 if(schemaVersion!==1||dataKind!=='AUTHORIZED_EXPORT'||!['PROVIDER_SUPPLIED_EXPORT','AUTHORIZED_MANUAL_TRANSCRIPTION'].includes(provenance?.method)||typeof provenance.documentReference!=='string'||!provenance.documentReference.trim()||!validCalendarTime(now)||!Array.isArray(entries)||entries.length>100||!Array.isArray(targets))fail('BOUNDED_DOCUMENTED_CHRONO24_ENVELOPE_REQUIRED');
 if(Buffer.byteLength(JSON.stringify({entries,provenance,authorization}))>262144)fail('CHRONO24_ENVELOPE_TOO_LARGE');
 // Even an empty template must not assert readiness without a permission receipt.
 if(!entries.length)permission(authorization,'current_listings',now);
 const listingRequests=[],evidenceRequests=[],context=[],issues=[],seen=new Map(),conflictKeys=new Set();
 for(let i=0;i<entries.length;i++){
  try{
   const entry=entries[i];if(!entry||typeof entry!=='object'||Array.isArray(entry))fail('INVALID_CHRONO24_ENTRY');
   if(typeof entry.recordId!=='string'||!entry.recordId.trim()||entry.recordId.length>128)fail('EXPLICIT_PROVENANCE_RECORD_ID_REQUIRED');
   const id=entry.recordId.trim(),inputKey=['listing','price_observation'].includes(entry.type)?JSON.stringify([id,entry.observedAt]):JSON.stringify([id]),signature=JSON.stringify(entry);if(seen.has(inputKey)){if(seen.get(inputKey)!==signature){conflictKeys.add(inputKey);fail('CONFLICTING_CHRONO24_RECORD');}continue;}seen.set(inputKey,signature);
   hostAllowed(entry.url);if(!validCalendarTime(entry.observedAt)||Date.parse(entry.observedAt)>Date.parse(now))fail('ACTUAL_CHRONO24_OBSERVATION_REQUIRED');
   if(!targets.some(t=>t.brand===entry.brand&&t.reference===entry.reference))fail('TARGET_REFERENCE_REQUIRED');
   if(entry.originalListedAt&&(!validCalendarTime(entry.originalListedAt)||Date.parse(entry.originalListedAt)>Date.parse(entry.observedAt)))fail('ACTUAL_CHRONO24_LISTING_DATE_REQUIRED');
   if(['weekly_average','estimated_sale'].includes(entry.type)){
    permission(authorization,entry.type==='weekly_average'?'market_aggregates':'estimated_values',now);
    if(!['listing_price','sales_price','estimated_sales_price'].includes(entry.metric)||typeof entry.amount!=='string'||!/^\d{1,8}(?:\.\d{1,2})?$/.test(entry.amount)||Number(entry.amount)<=0||!/^[A-Z]{3}$/.test(entry.currency??''))fail('EXPLICIT_CONTEXT_METRIC_REQUIRED');
    if(entry.type==='weekly_average'&&(!validCalendarTime(entry.periodStart)||!validCalendarTime(entry.periodEnd)||Date.parse(entry.periodStart)>Date.parse(entry.periodEnd)||Date.parse(entry.periodEnd)>Date.parse(entry.observedAt)))fail('ACTUAL_AGGREGATE_PERIOD_REQUIRED');
    context.push({recordId:id,inputKey,type:entry.type,metric:entry.metric,amount:entry.amount,currency:entry.currency,reference:entry.reference,observedAt:entry.observedAt,periodStart:entry.periodStart??null,periodEnd:entry.periodEnd??null,individualSale:false,compEligible:false,pricingPermitted:false});continue;
   }
   if(entry.type==='listing'||entry.type==='price_observation'){
    const scope=entry.type==='listing'?'current_listings':'listing_price_history',receipt=permission(authorization,scope,now);
    if(!['sale','sold','other'].includes(entry.saleStatus))fail('EXPLICIT_CHRONO24_LISTING_STATUS_REQUIRED');
    const request=manualListingRequest({source:'chrono24',permission:receipt,record:{...entry,observedNow:false,sellerType:entry.sellerType??'unknown'},now});
    const checked=importListingCSV(request.csv,{source:'chrono24',rights:request.rights,targets,now});if(checked.issues.length||checked.conflicts.length||checked.records.length!==1)fail('CHRONO24_LISTING_REVIEW_REQUIRED');
    listingRequests.push({...request,inputRecordId:id,inputKey,inputObservedAt:entry.observedAt,inputType:entry.type,automaticallyImported:false});continue;
   }
   if(entry.type==='completed_sale'){
    const receipt=permission(authorization,'completed_sales',now);
    if(entry.transactionStatus!=='completed'||entry.finalPriceConfirmed!==true||entry.priceBasis!=='final_transaction_price')fail('CONFIRMED_INDIVIDUAL_FINAL_SALE_REQUIRED');
    const request=manualEvidenceRequest({source:'chrono24',permission:receipt,record:{...entry,kind:'sold',observedAt:entry.observedAt,finalPriceConfirmed:true,saleChannel:entry.sellerType==='private_reported'?'private':entry.sellerType==='business_reported'?'retail':'unknown'},now:entry.observedAt});
    const checked=authorizedEvidenceCSV(request.csv,{source:'chrono24',rights:request.rights});if(checked.issues.length||checked.accepted.length!==1)fail('CHRONO24_SALE_REVIEW_REQUIRED');
    evidenceRequests.push({...request,inputRecordId:id,inputKey,automaticallyImported:false,verification:'unverified',feeTreatment:typeof entry.feeTreatment==='string'?entry.feeTreatment.slice(0,200):'unknown_not_net_exit',historyCoverage:'not_complete_history'});continue;
   }
   fail('UNSUPPORTED_CHRONO24_RECORD_TYPE');
  }catch(e){issues.push({row:i+1,code:/^[A-Z][A-Z0-9_]+$/.test(e.code??'')?e.code:'INVALID_CHRONO24_ENTRY'});}
 }
 // A conflicting ID invalidates both versions, never select the first as truth.
 const keep=request=>!conflictKeys.has(request.inputKey);
 // Internal IDs are never inferred from a portal-wide URL or sample position.
 return {status:issues.length?'REVIEW_REQUIRED':'PREPARED_NOT_IMPORTED',listingRequests:listingRequests.filter(keep).sort((a,b)=>Date.parse(a.inputObservedAt)-Date.parse(b.inputObservedAt)),evidenceRequests:evidenceRequests.filter(keep),context:context.filter(keep),issues,networkCalls:0,automaticallyImported:false,autoVerified:false,pricingAnalysisEnabled:false,actualGrantVerified:false,persisted:false};
}
