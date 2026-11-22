import {acquisitionCalculator} from './acquisitionCosts.mjs';
import {saleCalculator} from './saleProceeds.mjs';
import {reviewedExitSelection} from './reviewedExitSelection.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const cents=v=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100000000||Math.abs(v*100-Math.round(v*100))>0.00001)fail('EXPLICIT_CENT_AMOUNTS_REQUIRED');return Math.round(v*100);};
const basis=v=>typeof v==='string'&&v.trim().length>0&&v.length<=2000;
// Re-evaluate existing, independently reviewed rows. No raw price is accepted as exit evidence.
// This scenario neither changes the source observation/review nor approves a transaction.
export function evaluateDealerPackage(input,{rows,quoteEvidence=[],now,dataKind}={}){
 if(!Number.isFinite(Date.parse(now)))fail('EXPLICIT_EVALUATION_TIME_REQUIRED');
 if(!input||!['dealer','wearable'].includes(input.strategy)||!Array.isArray(input.items)||input.items.length<1||input.items.length>10)fail('ONE_TO_TEN_DISTINCT_WATCHES_REQUIRED');
 if(new Set(input.items.map(i=>i.key)).size!==input.items.length)fail('DUPLICATE_PACKAGE_WATCH');
 if(!basis(input.costAllocationReference))fail('DOCUMENTED_PACKAGE_COST_ALLOCATION_REQUIRED');
 const wearable=input.strategy==='wearable',results=[];let totalPrice=0;
 for(const item of input.items){
  const row=rows.find(r=>r.key===item.key);if(!row)fail('PACKAGE_LISTING_NOT_FOUND');
  const price=item.negotiatedPrice===null||item.negotiatedPrice===undefined?row.askingPrice:item.negotiatedPrice;
  cents(price);if(price<=0)fail('POSITIVE_PURCHASE_PRICE_REQUIRED');
  if(item.negotiatedPrice!==null&&item.negotiatedPrice!==undefined&&!basis(item.negotiationReference))fail('NEGOTIATED_PRICE_BASIS_REQUIRED');
  totalPrice+=cents(price);const allocated=cents(item.allocatedPackageCosts),holding=cents(item.holdingCosts),wear=cents(item.wearAllowance);
  if(!basis(item.reserveBasis))fail('DOCUMENTED_HOLDING_AND_WEAR_BASIS_REQUIRED');
  const problems=[];if(wearable&&(!Number.isInteger(item.holdingDays)||item.holdingDays<60||item.holdingDays>90))problems.push('wearable_holding_period_must_be_60_to_90_days');
  if(wearable&&!basis(item.liquidityPlan))problems.push('documented_90_day_exit_plan_required');
  const a=row.analysis;
  if(!['BUY','NEGOTIATE','PASS'].includes(a?.decision)||!Number.isFinite(a?.netExit)||!Number.isFinite(a?.grossExitUsed)||!Number.isFinite(a?.maximumAcquisitionAllIn)||!row.history?.availableToAct||row.configurationAudit?.complete!==true||!row.settings?.costs)problems.push('current_complete_reviewed_listing_costs_and_exit_evidence_required');
  let wholesale=null;
  if(wearable&&!problems.length){
   const selected=reviewedExitSelection(row.watch,quoteEvidence,{now});
   const eligible=(selected.quotes??[]).filter(q=>q.saleChannel==='wholesale'&&q.currency==='USD');
   if(selected.provenanceConflicts?.length||!eligible.length)problems.push('current_reviewed_exact_wholesale_fallback_required');
   else wholesale=saleCalculator(row.settings.costs.channelSales?.wholesale??row.settings.costs.sale).at(Math.min(a.grossExitUsed,...eligible.map(q=>q.amount))).netProceeds;
  }
  const common={key:row.key,reference:row.watch?.reference,askingPrice:row.askingPrice,proposedPrice:price,priceBasis:item.negotiatedPrice==null?'current_reviewed_ask':'owner_supplied_negotiation_scenario',holdingDays:item.holdingDays??null,allocatedPackageCosts:allocated/100,holdingCosts:holding/100,wearAllowance:wear/100,reasons:problems,purchaseAuthorized:false};
  if(problems.length){results.push({...common,decision:'INVESTIGATE',netProfit:null,wholesaleNetProfit:null,capitalExposure:null,maximumCashPrice:null});continue;}
  const original=row.settings.costs,calculator=acquisitionCalculator(original),purchase=calculator.at(price),objective=Math.max(1000,a.minimumNetProfit??1000);
  const retailExit=cents(a.netExit)-wear,fallback=wholesale===null?null:cents(wholesale)-wear,limiting=Math.min(retailExit,fallback??Infinity);
  // Existing financial ceilings can only decrease. Wear is an exit haircut, not charged twice.
  const ceiling=Math.max(0,Math.min(cents(a.maximumAcquisitionAllIn),limiting-cents(objective)-holding-allocated,wearable?1000000-allocated:Infinity));
  const maxPrice=calculator.ceiling(ceiling/100),allIn=cents(purchase.allIn)+allocated,capital=allIn+holding+wear;
  const profit=retailExit-allIn-holding,wholesaleProfit=fallback===null?null:fallback-allIn-holding;
  const rate=row.settings.openingDiscountRate;const opening=maxPrice===null?null:Number.isFinite(rate)&&rate>=0&&rate<1?Math.floor(Math.min(price,maxPrice*(1-rate))*100+1e-9)/100:Number.isFinite(a.recommendedOpeningOffer)?Math.min(price,maxPrice,a.recommendedOpeningOffer):null;
  const viable=maxPrice!==null&&maxPrice>0,within=viable&&cents(price)<=cents(maxPrice)&&profit>=cents(objective)&&(wholesaleProfit===null||wholesaleProfit>=cents(objective));
  results.push({...common,decision:!viable?'PASS':within?'WITHIN_REVIEWED_SCENARIO':'NEGOTIATE',netProfit:profit/100,wholesaleNetProfit:wholesaleProfit===null?null:wholesaleProfit/100,conservativeNetExitAfterWear:retailExit/100,wholesaleNetExitAfterWear:fallback===null?null:fallback/100,acquisitionAllIn:allIn/100,capitalExposure:capital/100,maximumCashPrice:maxPrice,maximumAcquisitionAllIn:maxPrice===null?null:(ceiling+allocated)/100,targetCashPrice:maxPrice===null?null:Math.min(price,maxPrice),openingOffer:opening,minimumNetProfit:objective,conditionPreferenceMet:/^excellent$/i.test(row.watch?.configuration?.condition??''),quoteValidForHoldingPeriod:false,recheckRequired:'Reinspect condition, rights, costs, availability and current exit quotes before purchase and before sale. No future price or liquidity is guaranteed.'});
 }
 if(input.packagePrice!==null&&input.packagePrice!==undefined&&cents(input.packagePrice)!==totalPrice)fail('PACKAGE_PRICE_MUST_MATCH_EXPLICIT_WATCH_ALLOCATIONS');
 const complete=results.every(r=>r.netProfit!==null),sum=field=>results.reduce((n,r)=>n+cents(r[field]),0)/100;
 const exposure=complete?sum('capitalExposure'):null,capital=input.availableCapital==null?null:cents(input.availableCapital)/100,capitalStatus=capital===null?'NOT_PROVIDED':exposure===null?'EXPOSURE_INCOMPLETE':capital>=exposure?'SUFFICIENT_FOR_SCENARIO':'INSUFFICIENT';
 return{capitalStatus,availableCapital:capital,capitalShortfall:capital===null||exposure===null?null:Math.max(0,Math.round((exposure-capital)*100))/100,readyForOwnerCapitalReview:complete&&capitalStatus==='SUFFICIENT_FOR_SCENARIO'&&results.every(r=>r.decision==='WITHIN_REVIEWED_SCENARIO'),dataKind,status:complete?'REVIEWED_SCENARIO':'INCOMPLETE_PACKAGE',strategy:input.strategy,watchCount:results.length,items:results,proposedWatchPrices:totalPrice/100,totalCapitalExposure:complete?sum('capitalExposure'):null,totalNetProfit:complete?results.reduce((n,r)=>n+Math.round(r.netProfit*100),0)/100:null,allWatchesMeetTarget:complete&&results.every(r=>r.decision==='WITHIN_REVIEWED_SCENARIO'),crossSubsidyPermitted:false,purchaseAuthorized:false,contactAuthorized:false,persisted:false,evaluatedAt:now};
}
