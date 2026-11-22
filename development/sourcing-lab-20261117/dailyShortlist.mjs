import {nextDealAction} from './dealReadiness.mjs';
import {hasDealQualityHold} from './dealQuality.mjs';
export function buildDailyShortlist(rows,{now,timeZone='America/Chicago',limit=5}={}){
 if(!Number.isFinite(Date.parse(now))||!Number.isInteger(limit)||limit<1||limit>10)throw Error('INVALID_SHORTLIST_POLICY');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)),part=type=>parts.find(p=>p.type===type).value;
 const time=Date.parse(now),eligible=rows.filter(r=>r.history?.availableToAct===true&&Number.isFinite(Date.parse(r.observedAt))&&Date.parse(r.observedAt)<=time&&time-Date.parse(r.observedAt)<=86400000&&(!r.settings?.rights?.expiresAt||Date.parse(r.settings.rights.expiresAt)>time)&&!(typeof r.analysis?.estimatedNetProfit==='number'&&r.analysis.estimatedNetProfit<0)&&r.analysis?.decision!=='PASS'&&!hasDealQualityHold(r));
 const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
 const factors=r=>{
  const licensed=r.settings?.rights?.pricingPermitted===true&&Date.parse(r.settings.rights.expiresAt)>time&&r.source!=='ebay';
  const ceiling=licensed&&positive(r.analysis?.maximumCashOffer)?r.analysis.maximumCashOffer:null;
  const headroom=ceiling!==null&&r.currency==='USD'&&positive(r.askingPrice)?(ceiling-r.askingPrice)/ceiling:null;
  const days=r.intelligence?.liquidity?.medianObservedDaysToSale;
  const liquidity=licensed&&r.intelligence?.liquidity?.salesWithKnownDaysToSale>=3&&typeof days==='number'&&Number.isFinite(days)&&days>=0?days:null;
  let restrictedHost=false;try{restrictedHost=/(^|\.)ebay\.[a-z.]+$/i.test(new URL(r.url).hostname);}catch{}
  const reviewedNegotiationReady=licensed&&!restrictedHost&&r.settings.rights.authorizedExport===true&&r.analysis?.decision==='NEGOTIATE'&&r.configurationAudit?.complete===true&&r.comps?.verifiedSoldCount>=3&&ceiling!==null&&Number.isFinite(r.analysis.netExit)&&Number.isFinite(r.analysis.estimatedNetProfit)&&nextDealAction(r,{now}).stage==='NEGOTIATION_REQUIRED';
  return{reviewedNegotiationReady,buyerIntentMatches:licensed?(r.customerDemand?.qualifiedIntentMatches??0)+(r.customerDemand?.negotiationIntentMatches??0):0,newSourceListing:r.history?.newlyListed===true,headroom,liquidity,motivationSignals:(r.history?.signals??[]).filter(s=>['repeated_reductions','reviewed_relisting'].includes(s.kind)).length};
 };
 const ranked=eligible.map(row=>({row,f:factors(row)})).sort((a,b)=>Number(Boolean(b.row.verified))-Number(Boolean(a.row.verified))||Number(b.f.reviewedNegotiationReady)-Number(a.f.reviewedNegotiationReady)||b.f.buyerIntentMatches-a.f.buyerIntentMatches||Number(b.f.newSourceListing)-Number(a.f.newSourceListing)||(b.f.headroom??-Infinity)-(a.f.headroom??-Infinity)||(a.f.liquidity??Infinity)-(b.f.liquidity??Infinity)||b.f.motivationSignals-a.f.motivationSignals||Date.parse(b.row.observedAt)-Date.parse(a.row.observedAt)||Number(Boolean(b.row.saved))-Number(Boolean(a.row.saved))||Number(Boolean(b.row.watchlisted))-Number(Boolean(a.row.watchlisted))||a.row.key.localeCompare(b.row.key));
 return{day:part('year')+'-'+part('month')+'-'+part('day'),timeZone,limit,items:ranked.slice(0,limit).map(({row:r,f})=>({key:r.key,category:r.verified?'verified':'preliminary',...nextDealAction(r,{now}),priorityFactors:{reviewedNegotiationReady:f.reviewedNegotiationReady,buyerIntentMatches:f.buyerIntentMatches,buyerCommitmentVerified:false,sourceNewlyListed:f.newSourceListing,documentedHeadroomRatio:f.headroom,reviewedMedianDaysToSale:f.liquidity,inferredMotivationSignals:f.motivationSignals}})),excludedStale:rows.filter(r=>!eligible.includes(r)).length,actualProfitProbability:null,automaticActions:0,rankingMeaning:'qualified_then_reviewed_negotiation_customer_intent_source_freshness_documented_headroom_liquidity_inferred_signals'};
}
