import {validateDirectOfferURL} from './directOfferPolicy.mjs';
// Offline intake only: no URLs fetched, credentials read, account setup or access
// grants. A rights receipt must come from an independently documented permission.
import {parseCSV} from './reused/development/market-intelligence/authorizedExport.mjs';
import {identifyReference,deduplicateRecords,listingExclusion} from './listingSignals.mjs';
import {identity,safeURL} from './reused/development/market-intelligence/evidence.mjs';
import {validCalendarTime} from './exportValidation.mjs';
const sources=new Set(['direct','ebay','chrono24','grailzee','reddit','watchfinder','watchcharts','facebook']);
const hostFor={ebay:/(^|\.)ebay\.(com|co\.uk|de|ca|com\.au)$/,chrono24:/(^|\.)chrono24\.com$/,grailzee:/(^|\.)grailzee\.com$/,reddit:/(^|\.)reddit\.com$/,watchfinder:/(^|\.)watchfinder\.com$/,watchcharts:/(^|\.)watchcharts\.com$/,facebook:/(^|\.)facebook\.com$/};
const fail=code=>{throw Object.assign(Error(code),{code});};
export function importListingCSV(text,{source,rights,targets,now}={}){
 const time=Date.parse(now);
 if(!Number.isFinite(time)||!sources.has(source))fail('INVALID_IMPORT_POLICY');
 if(rights?.source!==source||rights?.authorizedToProcess!==true||rights?.historyPermitted!==true||rights?.internalOnly!==true||typeof rights.reference!=='string'||!rights.reference.trim()||!validCalendarTime(rights.expiresAt)||Date.parse(rights.expiresAt)<=time)fail('DOCUMENTED_EXPORT_AND_HISTORY_RIGHTS_REQUIRED');
 const {header,rows}=parseCSV(text,{maxRows:500,maxBytes:1024*1024});
 const required=['recordId','url','title','observedAt','saleStatus','askingPrice','currency'];
 for(const field of required)if(!header.includes(field))fail('LISTING_COLUMN_REQUIRED');
 const accepted=[],issues=[];
 for(let i=0;i<rows.length;i++){
  try{
   if(rows[i].length!==header.length)fail('EXPORT_COLUMN_COUNT');
   const row=Object.fromEntries(header.map((h,j)=>[h,rows[i][j]]));
   if(source==='direct')validateDirectOfferURL(row.url,{originConfirmed:rights.directOriginConfirmed,recordId:row.recordId});
   const u=new URL(row.url);if(u.protocol!=='https:'||u.username||u.password||u.port||!safeURL(row.url)||(source!=='direct'&&!hostFor[source].test(u.hostname)))fail('SOURCE_URL_REQUIRED');
   if(!row.recordId.trim()||row.recordId.length>512||!row.title.trim()||row.title.length>1000||/[\x00-\x1f]/.test(row.recordId+row.title))fail('INVALID_LISTING_METADATA');
   if(listingExclusion(row.title))fail('WHOLE_WATCH_SALE_REVIEW_REQUIRED');
   if(!validCalendarTime(row.observedAt)||Date.parse(row.observedAt)>time)fail('INVALID_OBSERVATION_DATE');
   if(row.originalListedAt&&(!validCalendarTime(row.originalListedAt)||Date.parse(row.originalListedAt)>Date.parse(row.observedAt)))fail('INVALID_SOURCE_DATE');
   if(!['sale','sold','wtb','other'].includes(row.saleStatus))fail('EXPLICIT_SALE_STATUS_REQUIRED');
   if(row.auctionStatus&&!['active','ended','sold','reserve_not_met','withdrawn'].includes(row.auctionStatus))fail('INVALID_AUCTION_STATUS');
   if(row.sellerType&&!['unknown','private_reported','business_reported'].includes(row.sellerType))fail('INVALID_SELLER_CLASSIFICATION');
   if(row.askingPrice&&!/^(?:[1-9][0-9]*|0)(?:\.[0-9]{1,2})?$/.test(row.askingPrice))fail('EXPLICIT_NUMERIC_ASK_REQUIRED');
   const askingPrice=row.askingPrice?Number(row.askingPrice):null;
   if(askingPrice!==null&&(!Number.isFinite(askingPrice)||askingPrice<=0||askingPrice>100000000||!/^[A-Z]{3}$/.test(row.currency)))fail('INVALID_ASK_OR_CURRENCY');
   const identified=identifyReference({title:row.title,reference:row.reference||null,brand:row.brand||null},targets);
   if(!identified.watch)fail('REFERENCE_REVIEW_REQUIRED');
   const configuration={};for(const key of ['dial','bezel','bracelet','year','condition','caseMaterial','completeness'])if(row[key]?.trim())configuration[key]=row[key].trim();
   if(!identity({...identified.watch,configuration}))fail('INVALID_WATCH_CONFIGURATION');
   accepted.push({source,sourceRecordId:row.recordId.trim(),url:u.href,title:row.title.trim(),watch:{...identified.watch,configuration},askingPrice,currency:askingPrice===null?null:row.currency,
    observedAt:new Date(row.observedAt).toISOString(),originalListedAt:row.originalListedAt?new Date(row.originalListedAt).toISOString():null,saleStatus:row.auctionStatus&&row.auctionStatus!=='active'?'other':row.saleStatus,auctionStatus:row.auctionStatus||null,
    sellerType:row.sellerType||'unknown',valuationStatus:'unverified',rightsReference:rights.reference,pricingPermitted:false,
    ...(source==='facebook'&&row.captureMethod==='pax'?Object.fromEntries(
      ['groupId','groupName','sellerName','availabilityStatus','availabilityEvidence','captureMethod'].filter(key=>row[key]).map(key=>[key,row[key]])):{})});
  }catch(e){issues.push({row:i+2,code:/^[A-Z_]+$/.test(e.code??'')?e.code:'INVALID_EXPORT_ROW'});}
 }
 const dedup=deduplicateRecords(accepted);
 return{status:issues.length||dedup.conflicts.length?'REVIEW_REQUIRED':'READY_FOR_LOCAL_HISTORY',records:dedup.records,issues,conflicts:dedup.conflicts,duplicates:dedup.duplicates,
  autoVerified:false,pricingAuthorized:false,actualAccessGrantVerified:false,networkCalls:0};
}
