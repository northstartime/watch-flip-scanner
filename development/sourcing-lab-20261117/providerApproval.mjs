import {validCalendarTime} from './exportValidation.mjs';
export const providerSubmissions=Object.freeze({chrono24:'OWNER_REPORTED_SUBMITTED_AWAITING_PROVIDER',grailzee:'OWNER_REPORTED_SUBMITTED_AWAITING_PROVIDER'});
export function assessProviderApproval({source,receipt,now}={}){
 if(!Object.hasOwn(providerSubmissions,source)||!validCalendarTime(now))throw Error('KNOWN_PROVIDER_AND_TIME_REQUIRED');
 const base={source,submission:providerSubmissions[source],canDiscover:false,canRetain:false,canAnalyzePrices:false,canDisplayPhotos:false,canUseSoldEvidence:false,canInspectFailedReserves:false,networkCalls:0,automaticApproval:false,endpointConfigured:false};
 if(!receipt)return{...base,status:'AWAITING_PROVIDER_APPROVAL'};
 const scopes=['current_listings','photos','history','pricing','individual_completed_sales','failed_auction_research'];
 if(receipt.source!==source||receipt.providerDecision!=='approved'||receipt.ownerReviewed!==true||typeof receipt.documentReference!=='string'||!receipt.documentReference.trim()||!validCalendarTime(receipt.expiresAt)||Date.parse(receipt.expiresAt)<=Date.parse(now)||!Array.isArray(receipt.scopes)||receipt.scopes.some(s=>!scopes.includes(s)))return{...base,status:'DOCUMENTED_PROVIDER_AND_OWNER_REVIEW_REQUIRED'};
 const has=scope=>receipt.scopes.includes(scope),retain=has('history')&&Number.isInteger(receipt.retentionDays)&&receipt.retentionDays>0&&receipt.retentionDays<=365;
 return{...base,status:'DOCUMENTED_SCOPE_READY_FOR_SAMPLE_VALIDATION',canDiscover:has('current_listings'),canRetain:retain,canAnalyzePrices:has('pricing'),canDisplayPhotos:has('photos'),canUseSoldEvidence:has('individual_completed_sales'),canInspectFailedReserves:source==='grailzee'&&has('failed_auction_research'),retentionDays:retain?receipt.retentionDays:null,pricingDoesNotGrantSoldData:true,providerSampleValidated:false};
}
// Compatibility projection for the existing offline export adapters, not a grant.
export function prepareExistingAdapterMapping(input){
 const status=assessProviderApproval(input),r=input.receipt;
 if(status.status!=='DOCUMENTED_SCOPE_READY_FOR_SAMPLE_VALIDATION')return{status:status.status,authorization:null,automaticApproval:false};
 if(!status.canRetain||r.exportPermitted!==true)return{status:'CURRENT_ONLY_REQUIRES_APPROVED_MEMORY_SAMPLE_MAPPING',authorization:null,automaticApproval:false,canDiscover:status.canDiscover};
 const scopes=[...(status.canDiscover?['current_listings']:[]),...(status.canUseSoldEvidence?['completed_sales']:[]),...(status.canInspectFailedReserves?['failed_auction_research']:[])];
 return{status:'EXPORT_MAPPING_PREPARED_HOST_VALIDATION_REQUIRED',authorization:null,mapping:{source:input.source,reference:r.documentReference,expiresAt:r.expiresAt,scopes,maximumRetentionDays:status.retentionDays},requiredHostChecks:['provider_sample_schema','licensed_field_coverage','retention_deletion_including_revisions_and_backups'],activationAllowed:false,automaticApproval:false,pricingEnabled:false};
}
