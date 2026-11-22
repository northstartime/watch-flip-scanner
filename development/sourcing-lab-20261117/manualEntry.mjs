import {validateDirectOfferURL} from './directOfferPolicy.mjs';
import {createHash} from 'node:crypto';import {validCalendarTime} from './exportValidation.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
const csv=(header,row)=>[header.map(cell).join(','),header.map(key=>cell(row[key])).join(',')].join('\n');
function receipt(input,source,now){if(input?.confirmed!==true||typeof input.reference!=='string'||!input.reference.trim()||!validCalendarTime(input.expiresAt)||Date.parse(input.expiresAt)<=Date.parse(now))fail('DOCUMENTED_CURRENT_PERMISSION_REQUIRED');return{source,authorizedToProcess:true,historyPermitted:true,internalOnly:true,reference:input.reference.trim(),expiresAt:input.expiresAt,pricingPermitted:input.pricingConfirmed===true&&Boolean(input.pricingReference?.trim()),pricingReference:input.pricingReference?.trim()??null};}
function internalId(record){if(record.recordId?.trim())return record.recordId.trim();let url;try{url=new URL(record.url);url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);url.searchParams.sort();}catch{fail('ORIGINAL_SOURCE_URL_REQUIRED');}return'manual-url:'+createHash('sha256').update(url.href).digest('hex').slice(0,32);}
export function manualListingRequest({record={},permission,source,now}={}){
 const rights=receipt(permission,source,now);if(source==='direct'){validateDirectOfferURL(record.url,{originConfirmed:record.directOriginConfirmed,recordId:record.recordId});rights.directOriginConfirmed=true;}if(record.observedNow!==true&&!validCalendarTime(record.observedAt))fail('ACTUAL_OBSERVATION_TIME_REQUIRED');
 if(!record.title?.trim())fail('ORIGINAL_TITLE_REQUIRED');
 const row={...record,recordId:internalId(record),observedAt:record.observedNow===true?now:record.observedAt,saleStatus:record.saleStatus??'sale'};
 if(!['unknown','private_reported','business_reported'].includes(row.sellerType??'unknown'))fail('INVALID_SELLER_CLASSIFICATION');
 const header=['recordId','url','title','observedAt','saleStatus','askingPrice','currency','brand','reference','originalListedAt','dial','bezel','bracelet','year','condition','completeness','caseMaterial','auctionStatus','sellerType'];
 return{source,rights,csv:csv(header,row),idBasis:record.recordId?'provider_record_id':'internal_url_key_not_provider_id',networkCalls:0};
}
export function isWatchChartsEvidence(source,url){
 if(String(source??'').trim().toLowerCase()==='watchcharts')return true;
 try{return /(^|\.)watchcharts\.com$/i.test(new URL(url).hostname);}catch{return false;}
}
export function manualEvidenceRequest({record={},permission,source,now}={}){
 const rights=receipt(permission,source,now);if(!['sold','executable_exit'].includes(record.kind)||!validCalendarTime(record.eventAt)||Date.parse(record.eventAt)>Date.parse(now))fail('ACTUAL_SALE_OR_QUOTE_DATE_REQUIRED');
 if(record.kind==='sold'&&record.finalPriceConfirmed!==true)fail('ACTUAL_FINAL_TRANSACTION_PRICE_REQUIRED');
 const watchcharts=isWatchChartsEvidence(source,record.url);
 if(watchcharts&&record.kind==='sold')fail('WATCHCHARTS_ESTIMATE_OR_INDEX_IS_NOT_A_SOLD_COMP');
 if(watchcharts&&record.kind==='executable_exit')fail('WATCHCHARTS_ESTIMATE_IS_NOT_EXECUTABLE_EXIT');
 if(record.kind==='executable_exit'&&(!validCalendarTime(record.expiresAt)||Date.parse(record.expiresAt)<=Date.parse(now)))fail('CURRENT_EXECUTABLE_QUOTE_EXPIRY_REQUIRED');
 const row={...record,recordId:internalId(record),observedAt:now,saleChannel:record.saleChannel??'unknown'};
 return{source,rights:{...rights,proofId:rights.reference},csv:csv(['recordId','url','brand','reference','kind','amount','currency','observedAt','eventAt','expiresAt','dial','bezel','bracelet','year','condition','completeness','caseMaterial','saleChannel','buyerFee','sellerFee'],row),autoVerified:false,networkCalls:0};
}
