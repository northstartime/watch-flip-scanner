// Inactive local adapters. No credential lookup, default fetch or automatic activation.
import {safeURL,identity} from '../market-intelligence/evidence.mjs';
export const sourceCatalog=Object.freeze([
 ['facebook','Facebook groups'],['ebay','eBay'],['chrono24','Chrono24'],['grailzee','Grailzee'],
 ['reddit','Reddit r/Watchexchange'],['rolex-forums','Rolex Forums'],['watchuseek','Watchuseek'],
 ['watchrecon','WatchRecon'],['watchcharts','WatchCharts / Marketplace'],['watchscout','WatchScout'],
 ['bezel','Bezel'],['loupe-this','Loupe This'],['everywatch','EveryWatch'],
].map(([id,name])=>Object.freeze({id,name,enabled:false,liveVerified:false})));
const fail=code=>{const error=Error(code);error.code=code;throw error;};
const timestamp=value=>{const n=Date.parse(value);if(!Number.isFinite(n))fail('INVALID_OBSERVATION_TIME');return new Date(n).toISOString();};
const usd=value=>{const n=typeof value==='string'&&/^\d+(?:\.\d{1,2})?$/.test(value)?Number(value):value;return typeof n==='number'&&Number.isFinite(n)&&n>0?n:null;};
export function normalizeEBayItem(raw,{observedAt,identityParser=()=>null}={}){
 if(!raw||typeof raw.itemId!=='string'||!raw.itemId.trim()||typeof raw.title!=='string')fail('INVALID_EBAY_RECORD');
 const url=safeURL(raw.itemWebUrl);if(!url||!/(^|\.)ebay\.(com|co\.uk|de|ca|com\.au)$/i.test(new URL(url).hostname))fail('INVALID_EBAY_URL');
 const options=Array.isArray(raw.buyingOptions)?raw.buyingOptions:[];
 const askingPrice=options.includes('FIXED_PRICE')&&raw.price?.currency==='USD'?usd(raw.price.value):null;
 const currentBid=options.includes('AUCTION')&&raw.currentBidPrice?.currency==='USD'?usd(raw.currentBidPrice.value):null;
 const watch=identity(identityParser(raw));
 const published=Date.parse(raw.itemCreationDate),observed=timestamp(observedAt);
 return {id:'ebay:'+raw.itemId,source:'ebay',sourceRecordId:raw.itemId,title:raw.title,watch,url,
  saleStatus:'sale',askingPrice,currency:raw.price?.currency??null,currentBid,
  auctionStatus:options.includes('AUCTION')?'active':null,
  image:safeURL(raw.image?.imageUrl),originalListedAt:Number.isFinite(published)&&published<=Date.parse(observed)?new Date(published).toISOString():null,
  observedAt:observed,identityStatus:watch?'parsed_unverified':'unknown',valuationStatus:'unverified',kind:'asking',
  seller:raw.seller?.username?{displayName:String(raw.seller.username),reputationVerified:false}:null};
}
export function existingCollectorAdapter({id,collect,normalize,access,minIntervalMs=0}){
 if(!sourceCatalog.some(s=>s.id===id)||typeof collect!=='function'||typeof normalize!=='function'||!Number.isFinite(minIntervalMs)||minIntervalMs<0)fail('INVALID_SOURCE_ADAPTER');
 return {id,access,minIntervalMs,estimatedCost:0,async load(context){const records=await collect(context);return{records:records.map(row=>normalize(row,context)),complete:true};}};
}
export async function runAdapters(adapters,{mode='fixture',allowLive=false,now=Date.now(),state={},timeoutMs=30000,approvedCost=0,cursorBySource={}}={}){
 if(!['fixture','live'].includes(mode)||!Array.isArray(adapters)||new Set(adapters.map(a=>a.id)).size!==adapters.length||!Number.isFinite(now)||!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isFinite(approvedCost)||approvedCost<0)fail('INVALID_SOURCE_RUN');
 let reservedCost=0;
 const results=await Promise.all(adapters.map(async adapter=>{
  const before=state[adapter.id]??{};
  const blocked=reason=>({id:adapter.id,status:reason,records:[],state:before});
  if(!adapter.access?.authorized||!['official_api','authorized_export','existing_collector'].includes(adapter.access.mechanism)||!adapter.access.reference)return blocked('ACCESS_REQUIRED');
  if(mode==='live'&&!allowLive)return blocked('LIVE_APPROVAL_REQUIRED');
  if(!Number.isFinite(adapter.estimatedCost)||adapter.estimatedCost<0||adapter.estimatedCost>approvedCost-reservedCost)return blocked('COST_APPROVAL_REQUIRED');
  if(typeof adapter.load!=='function'||!Number.isFinite(adapter.minIntervalMs)||adapter.minIntervalMs<0)return blocked('INVALID_ADAPTER');
  if(before.nextAllowedAt>now)return blocked('RATE_LIMITED');
  reservedCost+=adapter.estimatedCost;
  let timer;const controller=new AbortController();
  try{
   const response=await Promise.race([Promise.resolve().then(()=>adapter.load({observedAt:new Date(now).toISOString(),cursor:cursorBySource[adapter.id]??null,mode,signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(Error(),{code:'SOURCE_TIMEOUT'}));},timeoutMs);})]);
   if(!response||!Array.isArray(response.records)||response.records.length>1000)fail('INVALID_SOURCE_RESPONSE');
   const unique=new Map();let duplicates=0;
   for(const row of response.records){
    if(!row||typeof row.id!=='string'||!row.id||row.source!==adapter.id||!safeURL(row.url))fail('INVALID_NORMALIZED_LISTING');
    if(unique.has(row.id)){if(JSON.stringify(unique.get(row.id))!==JSON.stringify(row))fail('CONFLICTING_SOURCE_DUPLICATE');duplicates++;continue;}unique.set(row.id,row);
   }
   return{id:adapter.id,status:response.complete===true?'SUCCESS':'PARTIAL',records:[...unique.values()],duplicates,
    state:{lastAttemptAt:now,lastSuccessAt:response.complete===true?now:before.lastSuccessAt??null,nextAllowedAt:now+adapter.minIntervalMs,cursor:response.complete===true?response.cursor??null:before.cursor??null}};
  }catch(error){
   const retry=Number.isFinite(error.retryAfterMs)&&error.retryAfterMs>=0?error.retryAfterMs:0;
   return{id:adapter.id,status:['AUTHENTICATION_REQUIRED','SOURCE_TIMEOUT','RATE_LIMITED'].includes(error.code)?error.code:'FAILED',records:[],
    state:{...before,lastAttemptAt:now,nextAllowedAt:now+Math.max(adapter.minIntervalMs,retry)}};
  }finally{clearTimeout(timer);controller.abort();}
 }));
 return {sources:results,records:results.flatMap(r=>r.records),liveVerified:false,state:Object.fromEntries(results.map(r=>[r.id,r.state]))};
}
