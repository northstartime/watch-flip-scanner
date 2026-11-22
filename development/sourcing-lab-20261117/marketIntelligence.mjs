import {saleCalculator} from './saleProceeds.mjs';
import {acquisitionCalculator} from './acquisitionCosts.mjs';
const known=v=>typeof v==='string'&&v.trim()&&!/^(unknown|unspecified|n\/a|na|\?|-|not known)$/i.test(v.trim());
const fixed=['shipping','insurance','platformFixed','paymentFixed','other'],rates=['platformRate','paymentRate'];
const money=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100000000;
const floorCents=v=>Math.floor(v*100+1e-9)/100;
function quantile(values,q){const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor((sorted.length-1)*q)]:null;}
function median(values){const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length?(a.length%2?a[m]:(a[m-1]+a[m])/2):null;}
export function configurationAudit(watch,{now}={}){
 if(!Number.isFinite(Date.parse(now)))throw Error('EXPLICIT_CONFIGURATION_TIME_REQUIRED');
 const fields=['dial','bracelet','year','condition','completeness'];if(watch?.reference==='16622')fields.push('bezel');const missing=fields.filter(k=>!known(watch?.configuration?.[k]));
 if(!known(watch?.brand)||!known(watch?.reference))missing.push('identity');
 if(!missing.includes('year')&&(!/^\d{4}$/.test(watch.configuration.year)||Number(watch.configuration.year)<1900||Number(watch.configuration.year)>new Date(now).getUTCFullYear()))missing.push('valid_year');
 return{complete:missing.length===0,missing,required:fields,meaning:'explicit_configuration_fields_not_authenticity_verification'};
}
export function costAudit(costs){
 const missing=[];try{saleCalculator(costs?.sale);}catch{missing.push('complete_resale_costs');}
 if(!money(costs?.acquisitionExtras)||!known(costs?.acquisitionCostBasis))missing.push('documented_acquisition_costs');
 try{acquisitionCalculator(costs);}catch{missing.push('documented_acquisition_terms_required');}
 if(!costs?.sale||fixed.some(k=>!money(costs.sale[k]))||rates.some(k=>typeof costs.sale[k]!=='number'||!Number.isFinite(costs.sale[k])||costs.sale[k]<0||costs.sale[k]>=1)||!known(costs.sale.costBasis))missing.push('complete_resale_costs');
 if(costs?.sale&&rates.reduce((n,k)=>n+(costs.sale[k]??0),0)>=1)missing.push('combined_selling_rates_invalid');
 if(costs?.acquisitionItems!==undefined){
  const items=costs.acquisitionItems;
  if(!Array.isArray(items)||!items.length||items.length>30||items.some(i=>!i||!known(i.name)||!money(i.amount)||!known(i.basis))||new Set(items.map(i=>i.name)).size!==items.length||Math.abs(items.reduce((s,i)=>s+i.amount,0)-costs.acquisitionExtras)>0.005)missing.push('acquisition_itemization_must_match_all_in_extras');
 }
 return{complete:missing.length===0,missing,itemized:Array.isArray(costs?.acquisitionItems),unknownValuesNeverZero:true};
}
export function channelMarketIntelligence(research,{costs,now,minSales=3}={}){
 if(!Number.isFinite(Date.parse(now))||!Number.isSafeInteger(minSales)||minSales<3)throw Error('EXPLICIT_MARKET_POLICY_REQUIRED');
 const rows=(research?.accepted??[]).filter(r=>r.kind==='sold'&&r.verification?.status==='verified'&&r.currency==='USD'&&Date.parse(r.eventAt)<=Date.parse(now)&&Date.parse(r.observedAt)<=Date.parse(now)&&Date.parse(now)-Date.parse(r.eventAt)<=90*86400000);
 const audit=costAudit(costs),sale=costs?.sale;
 function estimate(channel,q){const observations=rows.filter(r=>r.saleChannel===channel),gross=observations.length>=minSales?quantile(observations.map(r=>r.amount),q):null;
  const separate=costs?.channelSales!==undefined,scenario=separate?{...costs,sale:costs.channelSales?.[channel]}:costs,channelAudit=costAudit(scenario),channelSale=scenario?.sale;
  return{channel,observedSales:observations.length,gross,net:gross!==null&&channelAudit.complete?saleCalculator(channelSale).at(gross).netProceeds:null,
  costScenario:separate?'documented_channel_specific':'shared_explicit_scenario_not_channel_specific',label:gross===null?'Insufficient Comps':null,status:gross===null?'insufficient_verified_channel_sales':channelAudit.complete?'estimate_from_verified_channel_sales':'documented_costs_required',basis:'configuration_matched_reviewed_sales_not_an_executable_quote'};}
 const days=rows.filter(r=>Number.isFinite(Date.parse(r.originalListedAt))&&Date.parse(r.originalListedAt)<=Date.parse(r.eventAt)).map(r=>(Date.parse(r.eventAt)-Date.parse(r.originalListedAt))/86400000);
 const months=new Map();for(const row of rows){const month=row.eventAt.slice(0,7);if(!months.has(month))months.set(month,[]);months.get(month).push(row.amount);}
 return{wholesale:estimate('wholesale',0.25),conservativeRetail:estimate('retail',0.25),optimisticRetail:estimate('retail',0.75),costAudit:audit,
  history:[...months].sort(([a],[b])=>a.localeCompare(b)).map(([month,amounts])=>({month,count:amounts.length,median:amounts.length>=minSales?median(amounts):null})),
  liquidity:{sampleSales:rows.length,windowDays:90,salesWithKnownDaysToSale:days.length,medianObservedDaysToSale:days.length>=minSales?median(days):null,coverage:'reviewed_sample_not_whole_market',estimatedFutureHoldingDays:null},
  optimisticExitNeverUsedForBuyCeilings:true};
}
export function opportunityConfidence(row){
 const matched=row.comps?.verifiedSoldCount??0;
 if(!row.verified)return{level:'research',score:null,meaning:'qualification_incomplete_not_a_profit_probability'};
 return{level:matched>=10?'stronger_evidence':'qualified_small_sample',score:Math.min(100,60+matched*2),meaning:'documented_evidence_coverage_rule_not_profit_probability'};
}
export function rankOpportunities(rows,{mode='fresh'}={}){
 if(!['fresh','priority'].includes(mode))throw Error('INVALID_RANK_MODE');
 return [...rows].sort((a,b)=>{
  const availability=Number(b.history.availableToAct)-Number(a.history.availableToAct);if(availability)return availability;
  if(mode==='priority')return Number(b.verified)-Number(a.verified)||(b.confidence?.score??-1)-(a.confidence?.score??-1)||(a.intelligence?.liquidity?.medianObservedDaysToSale??Infinity)-(b.intelligence?.liquidity?.medianObservedDaysToSale??Infinity)||(b.analysis.estimatedNetProfit??-Infinity)-(a.analysis.estimatedNetProfit??-Infinity)||a.key.localeCompare(b.key);
  return Date.parse(b.observedAt)-Date.parse(a.observedAt)||Number(b.history.newlyListed===true)-Number(a.history.newlyListed===true)||(a.history.sourceDaysOnMarket??Infinity)-(b.history.sourceDaysOnMarket??Infinity)||a.key.localeCompare(b.key);
 });
}
