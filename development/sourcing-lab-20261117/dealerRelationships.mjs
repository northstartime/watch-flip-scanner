import {validCalendarTime} from './exportValidation.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {createSnapshotStore,canonicalJSON} from './reused/development/storage/snapshotStore.mjs';
import {safeURL} from './reused/development/market-intelligence/evidence.mjs';
export const dueDiligenceChecks=['businessHistory','recentFeedback','physicalLocation','paymentProtection','returnInspection','authentication','originalComponents','matchingPaperwork','transactionRisk'];
const fail=c=>{throw Object.assign(Error(c),{code:c});};
const text=(s,max=2000)=>typeof s==='string'&&s.trim().length>0&&s.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f<>]/.test(s);
const date=s=>typeof s==='string'&&validCalendarTime(s);
const money=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000000&&Math.abs(v*100-Math.round(v*100))<0.00001;
export const dealerHash=d=>createHash('sha256').update(canonicalJSON(d)).digest('hex');
export function inspectDealerWatch(review,{now}={}){
 const time=Date.parse(now);if(!Number.isFinite(time))fail('EXPLICIT_DEALER_REVIEW_TIME_REQUIRED');
 const reasons=[],flags=review?.flags??{};if(!review)return{status:'REVIEW_REQUIRED',reasons:['watch_specific_dealer_review_required'],availabilityConfirmed:false,listingAgeKnown:false,automaticApproval:false};
 if(review.availability==='unavailable')reasons.push('watch_reported_unavailable');
 else if(review.availability!=='confirmed'||!text(review.availabilityBasis)||!date(review.checkedAt)||Date.parse(review.checkedAt)>time||time-Date.parse(review.checkedAt)>86400000)reasons.push('current_watch_availability_confirmation_required');
 for(const check of dueDiligenceChecks){const c=review.checks?.[check];if(c?.status==='failed')reasons.push('dealer_'+check+'_failed');else if(c?.status!=='checked'||!text(c.basis))reasons.push('dealer_'+check+'_review_required');}
 if(flags.genericPhotos&&review.freshWatchPhotosConfirmed!==true)reasons.push('fresh_specific_watch_photos_required');
 if(flags.discontinuedAdvertisedNew&&review.newOldStockExplained!==true)reasons.push('new_old_stock_identity_and_condition_explanation_required');
 if(flags.unusuallyLowPrice&&review.totalPriceConfirmed!==true)reasons.push('actual_total_watch_price_confirmation_required');
 if(flags.missingConfiguration&&review.configurationConfirmed!==true)reasons.push('actual_watch_configuration_confirmation_required');
 return{status:reasons.length?'REVIEW_REQUIRED':'CURRENT_MANUAL_REVIEW',reasons,availabilityConfirmed:reasons.every(r=>!r.includes('availability')&&!r.includes('unavailable')),listingAgeKnown:!flags.listingDateUncertain,signals:flags,sellerMotivationVerified:false,automaticApproval:false};
}
export function createDealerStore(directory,{dataset}){
 if(!['real','demo'].includes(dataset))fail('INVALID_DATASET');
 const store=createSnapshotStore(directory,{kind:'private-dealer-relationships',validate:s=>{if(s.dataset!==dataset||!Array.isArray(s.entries)||s.entries.length>200||new Set(s.entries.map(d=>d.id)).size!==s.entries.length)fail('INVALID_DEALER_STORE');for(const d of s.entries){if(!text(d.name,120)||!Array.isArray(d.events)||d.events.length>300||!Array.isArray(d.reviews)||d.reviews.length>100||!Array.isArray(d.listingKeys))fail('INVALID_DEALER_STORE');}}});
 async function mutate(input,at,change){const before=await store.read();return store.transact({expectedRevision:before?.revision??0,at,action:'manual_dealer_update',initialState:{dataset,entries:[]},mutate:s=>{const d=s.entries.find(d=>d.id===input.id);if(!d)fail('DEALER_NOT_FOUND');if(input.expectedHash!==dealerHash(d))fail('DEALER_CHANGED_REOPEN_RECORD');change(d,s);d.updatedAt=at;return s;}});}
 return{read:store.read,async apply(input,{at,knownKeys}){
  if(!date(at))fail('EXPLICIT_DEALER_REVIEW_TIME_REQUIRED');
  if(input.action==='profile'){
   const r=input.record;if(!r||!text(r.name,120)||!text(r.contact,1000)||!safeURL(r.website)||!Array.isArray(r.references)||r.references.length>100||r.references.some(v=>!text(v,80))||!Array.isArray(r.listingKeys)||r.listingKeys.some(k=>!knownKeys.includes(k))||r.listingKeys.length>100||r.notes!=null&&(typeof r.notes!=='string'||r.notes.length>4000||r.notes!==''&&!text(r.notes,4000))||r.followUpAt!=null&&r.followUpAt!==''&&!date(r.followUpAt))fail('EXPLICIT_DEALER_PROFILE_REQUIRED');
   if(input.id){await mutate(input,at,(d,s)=>{for(const other of s.entries)if(other.id!==d.id&&r.listingKeys.some(k=>other.listingKeys.includes(k)))fail('WATCH_ALREADY_LINKED_TO_ANOTHER_DEALER');if(d.listingKeys.some(k=>!r.listingKeys.includes(k)))fail('DEALER_WATCH_LINK_REMOVAL_REQUIRES_NEW_OFFER');if(d.name!==r.name||d.contact!==r.contact||d.website!==safeURL(r.website))d.reviews=[];Object.assign(d,{name:r.name,contact:r.contact,website:safeURL(r.website),references:r.references,listingKeys:r.listingKeys,notes:r.notes??'',followUpAt:r.followUpAt??null});});}
   else{const before=await store.read();await store.transact({expectedRevision:before?.revision??0,at,action:'manual_dealer_profile',initialState:{dataset,entries:[]},mutate:s=>{if(s.entries.length>=200)fail('DEALER_LIMIT_REACHED');if(s.entries.some(d=>d.website===safeURL(r.website)||r.listingKeys.some(k=>d.listingKeys.includes(k))))fail('DEALER_OR_WATCH_ALREADY_SAVED');s.entries.push({id:randomUUID(),name:r.name,contact:r.contact,website:safeURL(r.website),references:r.references,listingKeys:r.listingKeys,notes:r.notes??'',followUpAt:r.followUpAt??null,createdAt:at,updatedAt:at,events:[],reviews:[]});return s;}});}
  }else if(input.action==='event'){
   const e=input.event;if(!e||!['contact','quote','negotiation','completed_transaction','inspection'].includes(e.kind)||!date(e.occurredAt)||Date.parse(e.occurredAt)>Date.parse(at)||!text(e.note,2000)||!text(e.reference,80)||e.amount!==null&&!money(e.amount)||['quote','negotiation','completed_transaction'].includes(e.kind)&&(!money(e.amount)||e.amount<=0||e.processingRightsConfirmed!==true||e.originalCounterpartyConfirmed!==true||!text(e.permissionBasis)))fail('DOCUMENTED_MANUAL_DEALER_EVENT_REQUIRED');
   await mutate(input,at,d=>{if(d.events.length>=300)fail('DEALER_EVENT_LIMIT_REACHED');d.events.push({id:randomUUID(),kind:e.kind,occurredAt:e.occurredAt,reference:e.reference,amount:e.amount,note:e.note,permissionBasis:e.permissionBasis??null,evidenceStatus:'OWNER_ENTERED_NOT_VERIFIED_SALE_OR_EXIT',recordedAt:at});});
  }else if(input.action==='review'){
   const r=input.review;if(!r||!knownKeys.includes(r.listingKey)||!['unknown','confirmed','unavailable'].includes(r.availability)||!text(r.availabilityBasis)||dueDiligenceChecks.some(k=>!['unknown','checked','failed'].includes(r.checks?.[k]?.status)||r.checks[k].status==='checked'&&!text(r.checks[k].basis))||!r.flags||['genericPhotos','discontinuedAdvertisedNew','unusuallyLowPrice','missingConfiguration','listingDateUncertain'].some(k=>typeof r.flags[k]!=='boolean'))fail('EXPLICIT_WATCH_SPECIFIC_REVIEW_REQUIRED');
   await mutate(input,at,d=>{if(!d.listingKeys.includes(r.listingKey))fail('LINK_WATCH_TO_DEALER_FIRST');d.reviews=d.reviews.filter(old=>old.listingKey!==r.listingKey);d.reviews.push({listingKey:r.listingKey,listingVersion:r.listingVersion,checkedAt:at,availability:r.availability,availabilityBasis:r.availabilityBasis,checks:Object.fromEntries(dueDiligenceChecks.map(k=>[k,{status:r.checks[k].status,basis:r.checks[k].basis??''}])),flags:Object.fromEntries(['genericPhotos','discontinuedAdvertisedNew','unusuallyLowPrice','missingConfiguration','listingDateUncertain'].map(k=>[k,r.flags[k]])),...Object.fromEntries(['freshWatchPhotosConfirmed','newOldStockExplained','totalPriceConfirmed','configurationConfirmed'].map(k=>[k,r[k]===true]))});});
  }else fail('INVALID_DEALER_ACTION');
  return{status:'DEALER_SAVED'};
 }};
}
