import {priceNegotiationFacts} from './negotiationRequirements.mjs';
import {saleCalculator} from './saleProceeds.mjs';
import {configurationMatches,safeURL} from './reused/development/market-intelligence/evidence.mjs';
import {reviewedExitSelection} from './reviewedExitSelection.mjs';
import {configurationAudit,costAudit} from './marketIntelligence.mjs';import {freshness,listingExclusion} from './listingSignals.mjs';
import {acquisitionCalculator} from './acquisitionCosts.mjs';import {reviewDealQuality} from './dealQuality.mjs';
const floor=v=>Math.floor(v*100+1e-9)/100;
// research must be obtained from the validated reviewed-store matcher. Never
// rerun the older URL-stripping batch matcher or rewrite original evidence URLs.
export function negotiateReviewedOpportunity({listing,target,targets=[],research,quoteEvidence=[],costs,rights,qualification={},now,openingDiscountRate=null}={}){
 const base={negotiationFacts:null,decision:'RESEARCH',northStarScore:null,reasons:[],estimatedNetProfit:null,estimatedROI:null,maximumCashOffer:null,maximumAcquisitionAllIn:null,recommendedOpeningOffer:null,grossExitUsed:null,netExit:null,purchaseAuthorized:false,contactAuthorized:false};
 if(!listing||listing.saleStatus!=='sale'||listingExclusion(listing.title))return{...base,decision:'PASS',reasons:['not_a_current_whole_watch_sale']};
 const reasons=[],clock=Date.parse(now),config=configurationAudit(listing,{now}),audit=costAudit(costs);
 let ebay=false;try{ebay=/(^|\.)ebay\.[a-z.]+$/i.test(new URL(listing.url).hostname);}catch{}
 if(String(listing.source??'').trim().toLowerCase()==='ebay'||ebay)reasons.push('ebay_written_pricing_consent_required');
 if(rights?.authorizedExport!==true||rights?.pricingPermitted!==true||typeof rights.reference!=='string'||!rights.reference.trim()||!Number.isFinite(Date.parse(rights.expiresAt))||Date.parse(rights.expiresAt)<=clock)reasons.push('documented_current_pricing_rights_required');
 if(!reasons.length){const quality=reviewDealQuality(listing,{targets:targets.length?targets:target?[target]:[],now});reasons.push(...quality.issues);}
 if(!target||target.brand!==listing.brand||target.reference!==listing.reference||!configurationMatches(target.configuration,listing.configuration))reasons.push('target_configuration_unconfirmed');
 if(!config.complete)reasons.push(...config.missing.map(f=>'listing_'+f+'_unconfirmed'));
 if(!audit.complete)reasons.push(...audit.missing);
 const directOrigin=listing.directOfferProvenance;
 const documentedOfflineOffer=listing.source==='direct'&&listing.url===null&&directOrigin?.kind==='original_counterparty_offer'&&Boolean(directOrigin.id&&directOrigin.reference)&&directOrigin.observedAt===listing.observedAt;
 if((!safeURL(listing.url)&&!documentedOfflineOffer)||typeof listing.askingPrice!=='number'||!Number.isFinite(listing.askingPrice)||listing.askingPrice<=0||listing.askingPrice>100000000||listing.currency!=='USD')reasons.push('explicit_usd_asking_price_required');
 if(research?.status!=='evidence_available'||research.verifiedSoldCount<3||!Number.isFinite(research.conservativeGrossEstimate)||research.conservativeGrossEstimate<=0)reasons.push('sufficient_exact_reviewed_sales_required');
 const freshnessResult=freshness({observedAt:listing.observedAt,sourceListedAt:listing.originalListedAt??null,status:listing.saleStatus},{now});if(!freshnessResult.availableToAct)reasons.push(...freshnessResult.reasons);
 const checked=Date.parse(qualification.listingCheckedAt);if(qualification.askingPriceVerified!==true||qualification.exactConfigurationVerified!==true||!Number.isFinite(checked)||checked>clock||clock-checked>86400000)reasons.push('current_manual_listing_review_required');
 const quotes=listing.brand&&listing.reference?reviewedExitSelection(listing,quoteEvidence,{now}):{status:'insufficient_data'};if(quotes.provenanceConflicts?.length)reasons.push('contradictory_reviewed_exit_provenance');if(quotes.status!=='verified_quote_available')reasons.push('verified_current_exact_exit_quote_required');
 if(openingDiscountRate!==null&&(typeof openingDiscountRate!=='number'||!Number.isFinite(openingDiscountRate)||openingDiscountRate<0||openingDiscountRate>=1))reasons.push('invalid_opening_policy');
 if(target?.preliminaryMaximumAllIn!==undefined&&target?.preliminaryMaximumAllIn!==null&&(!Number.isFinite(target.preliminaryMaximumAllIn)||target.preliminaryMaximumAllIn<=0))reasons.push('invalid_preliminary_ceiling');
 if(target?.minimumNetProfit!==undefined&&(typeof target.minimumNetProfit!=='number'||!Number.isFinite(target.minimumNetProfit)||target.minimumNetProfit<=0))reasons.push('invalid_profit_objective');
 if(reasons.length)return{...base,reasons:[...new Set(reasons)]};
 const gross=Math.min(research.conservativeGrossEstimate,quotes.bestGrossQuote),sale=costs.sale;
 const net=saleCalculator(sale).at(gross).netProceeds;
 const objective=Math.max(1000,target.minimumNetProfit??1000),maximum=floor(Math.max(0,Math.min(net-objective,target.preliminaryMaximumAllIn??Infinity))),acquisition=acquisitionCalculator(costs),cash=acquisition.ceiling(maximum),breakdown=acquisition.at(listing.askingPrice);
 const allIn=breakdown.allIn,profit=floor(net-allIn);
 const decision=cash===null||cash<=0?'PASS':allIn<=maximum&&profit>=objective?'BUY':'NEGOTIATE';
 return{...base,decision,negotiationFacts:priceNegotiationFacts({decision,askingPrice:listing.askingPrice,maximumCashOffer:cash,estimatedNetProfit:profit,minimumNetProfit:objective}),maximumAcquisitionAllIn:maximum,maximumCashOffer:cash,grossExitUsed:gross,netExit:net,estimatedNetProfit:profit,estimatedROI:allIn>0?floor(profit/allIn*100):null,
  recommendedOpeningOffer:openingDiscountRate===null||cash===null||decision==='PASS'?null:floor(Math.min(listing.askingPrice,cash*(1-openingDiscountRate))),minimumNetProfit:objective,acquisitionAtAsk:breakdown,acquisitionCostBasis:acquisition.basis,
  reasons:[decision==='BUY'?'asking_price_meets_all_in_profit_objective':decision==='NEGOTIATE'?'negotiate_at_or_below_maximum_cash_offer':'costs_leave_no_viable_budget','exit_capped_by_lower_of_reviewed_comps_and_current_quote'],
  exitEvidence:{source:quotes.quotes[0].source, verifiedAt:quotes.quotes[0].verification.checkedAt, expiresAt:quotes.quoteExpiresAt},
  valuationStatus:'scenario_from_reviewed_evidence_not_guaranteed_profit',optimisticRetailUsed:false};
}
