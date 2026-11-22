// Explicit exit and auction scenarios only. Never executes trades or contacts buyers.
import {identity,normalizeEvidence,exactConfigurationExclusion} from './evidence.mjs';
const fail=code=>{const e=Error(code);e.code=code;throw e;};
const money=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100000000;
const rate=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<1;
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
export function exitQuotes(watch,evidence,{now,maxAgeHours=72}={}){
 const required=identity(watch),time=Date.parse(now);
 if(!required||!Number.isFinite(time)||!Number.isFinite(maxAgeHours)||maxAgeHours<=0)fail('EXPLICIT_EXIT_RESEARCH_POLICY_REQUIRED');
 const quotes=[],rejected={},seen=new Set();
 for(const raw of evidence??[]){
  let row,reason;try{row=normalizeEvidence(raw);}catch{reason='invalid_evidence';}
  if(!reason){
   if(row.kind!=='executable_exit')reason='not_an_executable_quote';
   else if(row.verification.status!=='verified')reason='unverified_quote';
   else if(row.watch.brand.toLowerCase()!==required.brand.toLowerCase()||row.watch.reference!==required.reference||exactConfigurationExclusion(required.configuration,row.watch.configuration))reason='configuration_unconfirmed';
   else if(Date.parse(row.eventAt)>time||Date.parse(row.observedAt)>time||time-Date.parse(row.eventAt)>maxAgeHours*3600000)reason='outside_quote_window';
   else if(Date.parse(row.expiresAt)<=time)reason='expired_quote';
   else if(seen.has(JSON.stringify([row.source.toLowerCase(),row.recordId])))reason='duplicate_quote';
  }
  if(reason){rejected[reason]=(rejected[reason]??0)+1;continue;}
  seen.add(JSON.stringify([row.source.toLowerCase(),row.recordId]));quotes.push(row);
 }
 quotes.sort((a,b)=>b.amount-a.amount);
 return{status:quotes.length?'verified_quote_available':'insufficient_data',quotes,rejected,bestGrossQuote:quotes[0]?.amount??null,quoteExpiresAt:quotes[0]?.expiresAt??null,valuationStatus:quotes.length?'verified_quote_not_guaranteed':'insufficient_data',requiresBuyerAndWatchConfirmation:true,contactAuthorized:false,transactionAuthorized:false};
}
export function auctionBidScenario({exit,minimumNetProfit,preliminaryMaximumAllIn=null,acquisition,bidIncrement=1}={}){
 const missing=[];
 if(!exit||!money(exit.netProceeds)||exit.netProceeds<=0||exit.currency!=='USD'||!['verified_executable_quote','estimate_from_verified_sales'].includes(exit.basis)||!Array.isArray(exit.proofIds)||!exit.proofIds.length||exit.proofIds.some(p=>typeof p!=='string'||!p.trim()))missing.push('documented_net_exit_scenario_required');
 if(!money(minimumNetProfit)||minimumNetProfit<=0)missing.push('minimum_net_profit_required');
 if(preliminaryMaximumAllIn!==null&&(!money(preliminaryMaximumAllIn)||preliminaryMaximumAllIn<=0))missing.push('invalid_preliminary_ceiling');
 if(!acquisition||!money(acquisition.fixedCosts)||!rate(acquisition.buyerPremiumRate)||!rate(acquisition.taxRate)||typeof acquisition.taxAppliesToPremium!=='boolean'||typeof acquisition.costBasis!=='string'||!acquisition.costBasis.trim())missing.push('complete_acquisition_cost_scenario_required');
 if(!money(bidIncrement)||bidIncrement<=0||Math.abs(bidIncrement*100-Math.round(bidIncrement*100))>0.000001)missing.push('valid_bid_increment_required');
 const base={classification:'Research',missing,maximumAuctionBid:null,maximumAcquisitionAllIn:null,estimatedNetProfitAtMaximumBid:null,exitBasis:exit?.basis??null,taxTreatment:'explicit_caller_scenario_not_assumed',requiresExitAndConditionVerification:true,bidAuthorized:false,purchaseAuthorized:false};
 if(missing.length)return base;
 const ceiling=Math.min(Math.max(0,round(exit.netProceeds-minimumNetProfit)),preliminaryMaximumAllIn??Infinity);
 const denominator=acquisition.taxAppliesToPremium?(1+acquisition.buyerPremiumRate)*(1+acquisition.taxRate):1+acquisition.buyerPremiumRate+acquisition.taxRate;
 const maximum=Math.max(0,Math.floor(((ceiling-acquisition.fixedCosts)/denominator+1e-9)/bidIncrement)*bidIncrement);
 let bid=round(maximum),allIn=round(bid*denominator+acquisition.fixedCosts);
 // Rounding must never increase the allowed all-in ceiling.
 if(allIn>ceiling){bid=Math.max(0,round(bid-bidIncrement));allIn=round(bid*denominator+acquisition.fixedCosts);}
 if(ceiling<acquisition.fixedCosts)return{...base,classification:'Pass: acquisition costs exceed ceiling',maximumAuctionBid:0,maximumAcquisitionAllIn:ceiling};
 return{...base,classification:exit.basis==='verified_executable_quote'?'Research: quote-backed bid scenario':'Research: estimated-exit bid scenario',maximumAuctionBid:bid,maximumAcquisitionAllIn:ceiling,estimatedAllInAtMaximumBid:allIn,estimatedNetProfitAtMaximumBid:round(exit.netProceeds-allIn),assumptions:[acquisition.costBasis]};
}
