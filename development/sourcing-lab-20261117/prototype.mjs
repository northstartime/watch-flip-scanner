import {normalizeEBayItem} from './reused/development/sources/sourceAdapters.mjs';
import {observeListing,motivation} from './reused/development/listing-history/history.mjs';
import {identifyReference,freshness,deduplicateRecords,summarizeHistory,listingExclusion} from './listingSignals.mjs';
import {validCalendarTime} from './exportValidation.mjs';
import {identifyStructuredWatch} from './structuredIdentity.mjs';

const fail=code=>{throw Object.assign(Error(code),{code});};
export function searchPlan(targets,{maxQueries=4,privateOnly=true}={}){
 if(!Array.isArray(targets)||!Number.isInteger(maxQueries)||maxQueries<1||maxQueries>28)fail('INVALID_BUDGET');
 return targets.slice(0,maxQueries).map(t=>{
  const url=new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.search=new URLSearchParams({q:`${t.brand} ${t.reference}`,category_ids:'31387',limit:'20',sort:'newlyListed',filter:`buyingOptions:{FIXED_PRICE},itemLocationCountry:US${privateOnly?',sellerAccountTypes:{INDIVIDUAL}':''}`});
  return{target:t,url:url.href};
 });
}
export async function requestJSON(url,options={},fetcher=fetch){
 // No pagination URL, redirect, alternate host, hidden endpoint, or retry fallback.
 const parsed=new URL(url);
 if(parsed.origin!=='https://api.ebay.com'||!['/identity/v1/oauth2/token','/buy/browse/v1/item_summary/search'].includes(parsed.pathname))fail('ENDPOINT_REFUSED');
 let response;
 try{response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(12000)});}
 catch(e){fail(e.cause?.code==='EACCES'?'NETWORK_PERMISSION_DENIED':'NETWORK_REQUEST_FAILED');}
 if(!response.ok)fail(response.status===429?'RATE_LIMITED':response.status===401||response.status===403?'ACCESS_REQUIRED':`HTTP_${response.status}`);
 const maximum=2*1024*1024;let text;
 if(response.body?.getReader){
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maximum){await reader.cancel();fail('RESPONSE_TOO_LARGE');}chunks.push(part.value);}text=Buffer.concat(chunks).toString('utf8');}
  catch(e){if(e.code==='RESPONSE_TOO_LARGE')throw e;fail('RESPONSE_READ_FAILED');}finally{reader.releaseLock();}
 }else{text=await response.text();if(Buffer.byteLength(text)>maximum)fail('RESPONSE_TOO_LARGE');}
 try{return JSON.parse(text);}catch{fail('INVALID_JSON');}
}
export async function tokenFor({clientId,clientSecret},fetcher){
 if(!clientId||!clientSecret)fail('EXISTING_CREDENTIALS_REQUIRED');
 const row=await requestJSON('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'},fetcher);
 if(typeof row.access_token!=='string'||!row.access_token)fail('INVALID_TOKEN_RESPONSE');
 return row.access_token;
}
export function processItems(items,{targets,observedAt,previous=[],evidence=[],costs=null}={}){
 if(!Array.isArray(items)||items.length>560||!Number.isFinite(Date.parse(observedAt)))fail('INVALID_BATCH');
 const byKey=new Map(previous.map(e=>[e.key,e])),rejected=[];
 const dedup=deduplicateRecords(items.map(raw=>({...raw,source:'ebay',sourceRecordId:raw.itemId})));
 if(dedup.conflicts.length)fail('CONFLICTING_DUPLICATE');
 const opportunities=[];
 for(const raw of dedup.records){
  const title=String(raw.title??'');
  const identity=identifyStructuredWatch({title,localizedAspects:raw.localizedAspects??[]},targets);
  const exclusion=listingExclusion(title);
  if(exclusion||!identity.watch){rejected.push({id:raw.itemId,reason:exclusion??identity.status});continue;}
  const target=targets.find(t=>t.reference===identity.watch.reference&&t.brand===identity.watch.brand);
  // Creation date can precede availability. Only origin date establishes source DOM.
  const row=normalizeEBayItem({...raw,itemCreationDate:validCalendarTime(raw.itemOriginDate)?raw.itemOriginDate:null},{observedAt,identityParser:()=>identity.watch});
  const age=freshness({observedAt,sourceListedAt:raw.itemOriginDate??null,endedAt:raw.itemEndDate??null,status:'sale'},{now:observedAt});
  if(age.reasons.includes('not_currently_available')){row.saleStatus='other';row.auctionStatus='ended';}
  // A title match identifies a research candidate, never its exact configuration.
  const key=JSON.stringify(['ebay',row.sourceRecordId]);
  const before=byKey.get(key)?.content.watch;
  if(before&&(before.brand!==row.watch.brand||before.reference!==row.watch.reference))fail('LISTING_IDENTITY_CHANGED_REVIEW_REQUIRED');
  const {entry}=observeListing(byKey.get(key),row);byKey.set(key,entry);
  const signals=motivation(entry,{now:observedAt});
  // API License Agreement section 9(5): do not model prices from eBay content
  // without prior written consent. Credentials and user consent cannot grant it.
  const analysis={decision:'RESEARCH',reasons:['ebay_written_pricing_consent_required','exact_configuration_requires_confirmation'],estimatedNetProfit:null,estimatedROI:null,maximumAcquisitionAllIn:null,maximumCashOffer:null,recommendedOpeningOffer:null,purchaseAuthorized:false,contactAuthorized:false};
  opportunities.push({id:row.id,title,url:row.url,reference:target.reference,askingPrice:row.askingPrice,currency:row.currency,currentBid:row.currentBid,
   sellerType:'unverified',watch:row.watch,...signals,freshness:age,historySummary:summarizeHistory(entry,{now:observedAt}),analysis,observedAt});
 }
 opportunities.sort((a,b)=>b.signals.length-a.signals.length||(b.facts.sourceDaysOnMarket??b.facts.daysSinceFirstObserved)-(a.facts.sourceDaysOnMarket??a.facts.daysSinceFirstObserved)||a.id.localeCompare(b.id));
 return{opportunities,rejected,history:[...byKey.values()],rawCount:items.length,uniqueCount:dedup.records.length,duplicates:dedup.duplicates};
}
