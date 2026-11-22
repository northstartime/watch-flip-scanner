// Offline, written-permission-gated preparation. No requests, accounts or writes.
import {validCalendarTime} from './exportValidation.mjs';
import {manualListingRequest,manualEvidenceRequest} from './manualEntry.mjs';
import {importListingCSV} from './listingExport.mjs';
import {authorizedEvidenceCSV} from './reused/development/market-intelligence/authorizedExport.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function prepareGrailzeeRecord({record,authorization,targets,now}={}){
 if(authorization?.source!=='grailzee'||authorization.writtenPermissionConfirmed!==true||authorization.authorizedToProcess!==true||authorization.historyPermitted!==true||typeof authorization.reference!=='string'||!authorization.reference.trim()||!validCalendarTime(authorization.expiresAt)||Date.parse(authorization.expiresAt)<=Date.parse(now))fail('WRITTEN_GRAILZEE_PROCESSING_RETENTION_PERMISSION_REQUIRED');
 if(!validCalendarTime(now)||!record||record.dataKind!=='AUTHORIZED_EXPORT'||typeof record.recordId!=='string'||!record.recordId.trim()||record.recordId.length>128||!validCalendarTime(record.observedAt)||Date.parse(record.observedAt)>Date.parse(now)||!Array.isArray(targets)||!targets.some(t=>t.reference===record.reference&&t.brand===record.brand))fail('DOCUMENTED_GRAILZEE_RECORD_REQUIRED');
 let url;try{url=new URL(record.url);}catch{fail('GRAILZEE_PROVENANCE_URL_REQUIRED');}
 if(url.protocol!=='https:'||!['grailzee.com','www.grailzee.com'].includes(url.hostname)||url.username||url.password||url.port||[...url.searchParams.keys()].some(key=>/token|secret|session|password|credential/i.test(key)))fail('GRAILZEE_PROVENANCE_URL_REQUIRED');
 const base={source:'grailzee',reference:record.reference,netProfitTarget:1000,networkCalls:0,persisted:false,pricingAnalysisEnabled:false,autoVerified:false,automaticallyImported:false,purchaseAuthorized:false,offerAuthorized:false,listingRequest:null,evidenceRequest:null,sellerMotivation:'not_established',availabilityVerified:false,feeTreatment:'transaction_specific_costs_required'};
 const permission={confirmed:true,reference:authorization.reference,expiresAt:authorization.expiresAt},scopes=authorization.scopes??[];
 if(!Array.isArray(scopes)||scopes.some(scope=>typeof scope!=='string'))fail('GRAILZEE_EXPLICIT_SCOPE_LIST_REQUIRED');
 if(record.status==='upcoming_auction'){
  if(!scopes.includes('current_listings')||!validCalendarTime(record.startsAt)||Date.parse(record.startsAt)<=Date.parse(now))fail('GRAILZEE_UPCOMING_START_SCOPE_REQUIRED');
  return {...base,status:'UPCOMING_AUCTION_RECHECK',startsAt:record.startsAt,reason:'not_currently_executable_confirm_live_terms_after_start',lastBidIsAcquisitionPrice:false};
 }
 if(record.status==='reserve_not_met'||record.status==='last_chance'){
  if(!scopes.includes('failed_auction_research'))fail('GRAILZEE_FAILED_AUCTION_SCOPE_REQUIRED');
  return {...base,status:'MANUAL_LAST_CHANCE_RECHECK',reason:'reserve_failure_is_not_a_sale_or_proof_of_distress',lastBidIsAcquisitionPrice:false,nextStep:'Use native platform to confirm current Last Chance availability; do not send an offer automatically.'};
 }
 if(record.status==='active_auction')return {...base,status:'RESEARCH_CURRENT_AUCTION',reason:'current_bid_is_not_an_executable_asking_price',lastBidIsAcquisitionPrice:false};
 if(record.status==='sold_label'||record.status==='winning_bid')return {...base,status:'COMPLETED_PAYMENT_PROOF_REQUIRED',reason:'auction_label_or_bid_is_not_a_settled_transaction'};
 if(['cancelled','withdrawn','payment_failed'].includes(record.status))return {...base,status:'NOT_ACTIONABLE_OR_VERIFIED_SALE'};
 if(record.status==='completed_sale'){
  if(!scopes.includes('completed_sales')||record.finalPriceConfirmed!==true||record.paymentCompletedConfirmed!==true||record.refundOrCancellationReported!==false)fail('GRAILZEE_COMPLETED_SALE_PROOF_REQUIRED');
  const request=manualEvidenceRequest({source:'grailzee',permission,record:{...record,kind:'sold',finalPriceConfirmed:true,saleChannel:'auction'},now:record.observedAt});
  const checked=authorizedEvidenceCSV(request.csv,{source:'grailzee',rights:request.rights});if(checked.issues.length||checked.accepted.length!==1)fail('GRAILZEE_SALE_REVIEW_REQUIRED');
  return {...base,status:'PREPARED_UNVERIFIED_SALE',evidenceRequest:request};
 }
 if(record.status==='explicit_fixed_price_offer'){
  if(!scopes.includes('current_listings')||record.explicitPriceConfirmed!==true)fail('GRAILZEE_EXPLICIT_ASK_SCOPE_REQUIRED');
  const request=manualListingRequest({source:'grailzee',permission,record:{...record,observedNow:false,saleStatus:'sale'},now});
  const checked=importListingCSV(request.csv,{source:'grailzee',rights:request.rights,targets,now});if(checked.issues.length||checked.records.length!==1||checked.records[0].askingPrice===null)fail('GRAILZEE_LISTING_REVIEW_REQUIRED');
  return {...base,status:'PREPARED_PRELIMINARY_LISTING',listingRequest:request};
 }
 fail('EXPLICIT_GRAILZEE_STATUS_REQUIRED');
}
