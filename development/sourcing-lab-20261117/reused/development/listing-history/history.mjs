// Pure immutable listing-history reducer. Persistence/integration remains separate.
import {createHash} from 'node:crypto';
import {safeURL,identity} from '../market-intelligence/evidence.mjs';
const fail=code=>{const e=Error(code);e.code=code;throw e;};
const clone=value=>JSON.parse(JSON.stringify(value));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function observeListing(previous,observation){
 const time=Date.parse(observation?.observedAt),url=safeURL(observation?.url);
 if(!Number.isFinite(time)||!url||typeof observation.source!=='string'||!observation.source.trim()||typeof observation.sourceRecordId!=='string'||!observation.sourceRecordId.trim())fail('INVALID_LISTING_OBSERVATION');
 if(observation.source.length>100||observation.sourceRecordId.length>512||/[\x00-\x1f]/.test(observation.source+observation.sourceRecordId))fail('INVALID_LISTING_OBSERVATION');
 const key=JSON.stringify([observation.source,observation.sourceRecordId]);
 if(previous&&(previous.key!==key||Date.parse(previous.lastObservedAt)>time))fail('OUT_OF_ORDER_OR_DIFFERENT_LISTING');
 const asking=observation.askingPrice===undefined||observation.askingPrice===null?null:observation.askingPrice;
 if(asking!==null&&(typeof asking!=='number'||!Number.isFinite(asking)||asking<=0||typeof observation.currency!=='string'||!/^[A-Z]{3}$/.test(observation.currency)))fail('INVALID_OBSERVED_PRICE');
 const published=Date.parse(observation.originalListedAt);
 if(observation.originalListedAt&&(!Number.isFinite(published)||published>time))fail('INVALID_SOURCE_LISTING_DATE');
 if(previous&&Number.isFinite(published)&&(published>Date.parse(previous.firstObservedAt)||(previous.originalListedAt&&published!==Date.parse(previous.originalListedAt))))fail('CONFLICTING_SOURCE_LISTING_DATE');
 const auctionStatus=observation.auctionStatus??null;
 if(auctionStatus!==null&&!['active','last_chance','ended','sold','reserve_not_met','withdrawn'].includes(auctionStatus))fail('INVALID_AUCTION_STATUS');
 const content={url,watch:identity(observation.watch),askingPrice:asking,currency:asking===null?null:observation.currency,
  saleStatus:['sale','wtb','sold','other'].includes(observation.saleStatus)?observation.saleStatus:'other',
  auctionStatus};
 for(const [key,max]of [['model',120],['title',1000],['groupId',100],['groupName',200],['sellerName',200],['availabilityStatus',30],['availabilityEvidence',500],['captureMethod',20]]){
  if(observation[key]!==undefined){if(typeof observation[key]!=='string'||!observation[key].trim()||observation[key].length>max||/[\x00-\x1f]/.test(observation[key]))fail('INVALID_LISTING_METADATA');content[key]=observation[key].trim();}
 }
 if(observation.photos!==undefined){if(!Array.isArray(observation.photos)||observation.photos.length>20||observation.photos.some(p=>!safeURL(p)))fail('INVALID_LISTING_PHOTO');content.photos=[...new Set(observation.photos.map(safeURL))];}
 const fingerprint=digest(content),at=new Date(time).toISOString();
 if(previous&&previous.lastObservedAt===at){if(previous.contentHash!==fingerprint||(Number.isFinite(published)&&previous.originalListedAt!==new Date(published).toISOString()))fail('CONFLICTING_SIMULTANEOUS_OBSERVATION');return{entry:clone(previous),newDiscovery:false,contentChanged:false,duplicateObservation:true};}
 const entry=previous?clone(previous):{key,source:observation.source,sourceRecordId:observation.sourceRecordId,firstObservedAt:at,originalListedAt:null,priceHistory:[],observations:[],priceReductionCount:0};
 const lastPrice=entry.priceHistory.at(-1);
 if(asking!==null&&(!lastPrice||lastPrice.amount!==asking||lastPrice.currency!==observation.currency)){
  const reduction=Boolean(lastPrice&&lastPrice.currency===observation.currency&&asking<lastPrice.amount);
  entry.priceHistory.push({observedAt:at,amount:asking,currency:observation.currency,reduction});if(reduction)entry.priceReductionCount++;
 }
 if(entry.originalListedAt===null&&Number.isFinite(published))entry.originalListedAt=new Date(published).toISOString();
 entry.lastObservedAt=at;entry.content=content;entry.contentHash=fingerprint;
 entry.observations.push({observedAt:at,contentHash:fingerprint});
 return {entry,newDiscovery:!previous,contentChanged:!previous||previous.contentHash!==fingerprint,duplicateObservation:false};
}
export function motivation(entry,{now,staleDays=30,minimumReductions=2}={}){
 const time=Date.parse(now);
 if(!Number.isFinite(time)||time<Date.parse(entry.lastObservedAt)||!Number.isFinite(staleDays)||staleDays<=0||!Number.isSafeInteger(minimumReductions)||minimumReductions<1)fail('INVALID_MOTIVATION_POLICY');
 const observedDays=Math.floor((time-Date.parse(entry.firstObservedAt))/86400000);
 const sourceDays=entry.originalListedAt?Math.floor((time-Date.parse(entry.originalListedAt))/86400000):null;
 const signals=[];
 const activeSale=entry.content.saleStatus==='sale'&&!['ended','sold','reserve_not_met','withdrawn'].includes(entry.content.auctionStatus);
 if(activeSale&&(sourceDays??observedDays)>=staleDays)signals.push({kind:'stale_listing',type:'inference',basis:sourceDays===null?'observed_for_at_least_threshold_days':'source_listing_date',thresholdDays:staleDays});
 if(activeSale&&entry.priceReductionCount>=minimumReductions)signals.push({kind:'repeated_price_reductions',type:'inference',basis:'observed_asking_price_changes',threshold:minimumReductions});
 return {facts:{daysSinceFirstObserved:observedDays,sourceDaysOnMarket:sourceDays,priceReductionCount:entry.priceReductionCount,lastAskingPrice:entry.content.askingPrice??null,currency:entry.content.currency??null,lastKnownAskingPrice:entry.priceHistory.length?clone(entry.priceHistory.at(-1)):null},
  signals,activeSale,sellerMotivation:signals.length?'inferred_not_verified':'insufficient_evidence',recommendation:activeSale?(signals.length?'Research negotiation potential':'Research'):'Pass: not an active sale',sellerContactAuthorized:false};
}
