// Read-only normalization/backfill. Never edits inventory or refreshes capture dates.
import {createHash} from 'node:crypto';
import {identity,safeURL} from '../market-intelligence/evidence.mjs';
import {canonicalJSON} from '../storage/snapshotStore.mjs';
const aliases={moda:'facebook',facebook:'facebook',ebay:'ebay','ebay-v1':'ebay'};
const fail=code=>{const e=Error(code);e.code=code;throw e;};
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&!/[\x00-\x1f]/.test(v)?v.trim():null;
export function normalizePublishedInventory(rows,{checkedAt,sourceAliases={}}={}){
 const time=Date.parse(checkedAt);if(!Array.isArray(rows)||rows.length>10000||!Number.isFinite(time))fail('EXPLICIT_INVENTORY_SNAPSHOT_REQUIRED');
 const observations=[],issues=[],seen=new Map();
 for(let index=0;index<rows.length;index++){
  const row=rows[index];
  try{
   if(!row||!text(row.id,512)||!text(row.source,100)||!safeURL(row.url))fail('INVALID_PUBLISHED_LISTING');
   const source={...aliases,...sourceAliases}[row.source.toLowerCase()];if(!/^[a-z][a-z0-9-]{0,80}$/.test(source??''))fail('PUBLISHED_SOURCE_MAPPING_REQUIRED');
   const captured=Date.parse(row.capturedAt);if(!Number.isFinite(captured)||captured>time)fail('ORIGINAL_CAPTURE_TIME_REQUIRED');
   const saleStatus=['sale','wtb','sold','other'].includes(row.saleStatus)?row.saleStatus:'other';
   const auction=String(row.buyingOption??'').toUpperCase().includes('AUCTION');
   const explicitUSD=row.currency==='USD'||((row.currency===undefined||row.currency===null)&&source==='facebook'&&row.priceExtraction?.status==='recognized');
   const asking=!auction&&explicitUSD&&typeof row.price==='number'&&Number.isFinite(row.price)&&row.price>0&&(source!=='facebook'||row.priceExtraction?.status==='recognized')?row.price:null;
   const watch=identity({brand:row.brand,reference:row.reference,configuration:row.configuration??{}});
   const result={source,sourceRecordId:row.id,url:safeURL(row.url),watch,askingPrice:asking,currency:asking===null?null:'USD',saleStatus,auctionStatus:auction?'active':null,observedAt:new Date(captured).toISOString()};
   if(row.originalListedAt!==undefined&&row.originalListedAt!==null){const listed=Date.parse(row.originalListedAt);if(!Number.isFinite(listed)||listed>captured)fail('INVALID_PUBLISHED_SOURCE_DATE');result.originalListedAt=new Date(listed).toISOString();}
   for(const [key,max]of [['model',120],['title',1000],['groupId',100],['groupName',200]])if(text(row[key],max))result[key]=row[key].trim();
   if(source==='facebook'&&result.groupId){const group=new URL(result.url).pathname.match(/^\/groups\/([^/]+)\/(?:posts|permalink)\//)?.[1];if(!group||decodeURIComponent(group).toLowerCase()!==result.groupId.toLowerCase())fail('GROUP_ATTRIBUTION_MISMATCH');}
   if(['owned_single_watch_post','reference_in_owned_photo_caption'].includes(row.photoAssociation)&&safeURL(row.image))result.photos=[safeURL(row.image)];
   const key=JSON.stringify([source,row.id]),prior=seen.get(key);
   if(prior&&canonicalJSON(prior)!==canonicalJSON(result))fail('CONFLICTING_PUBLISHED_ID');
   if(!prior){seen.set(key,result);observations.push(result);}
  }catch(error){issues.push({index,recordIdHash:typeof row?.id==='string'?createHash('sha256').update(row.id).digest('hex'):null,code:/^[A-Z_]+$/.test(error.code??'')?error.code:'INVALID_PUBLISHED_LISTING'});}
 }
 return{status:issues.length?'REVIEW_REQUIRED':'NORMALIZED',observations,issues,inputCount:rows.length,historyCoverage:'published_first_capture_only',priceChangesObservable:false,inventoryModified:false};
}
