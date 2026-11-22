// Observations support questions, not a claim about a seller's financial position.
export function sellerMotivation(row,{now}={}){
 const rights=row.settings?.rights,time=Date.parse(now);
 if(!Number.isFinite(time))throw Error('EXPLICIT_MOTIVATION_TIME_REQUIRED');
 let ebay=false;try{ebay=/(^|\.)ebay\.[a-z.]+$/i.test(new URL(row.url).hostname);}catch{}
 const base={facts:[],inferences:[],questions:[],sellerDistressVerified:false,discountEntitlement:null,buyCeilingAdjustment:0,automaticContact:false};
 if(ebay||String(row.source??'').trim().toLowerCase()==='ebay'||rights?.authorizedExport!==true||!Number.isFinite(Date.parse(rights.expiresAt))||Date.parse(rights.expiresAt)<=time)return{...base,status:'SOURCE_RIGHTS_REQUIRED'};
 const history=row.history??{},lineage=row.lineage??{};
 if(Number.isInteger(history.daysSinceFirstObserved)&&history.daysSinceFirstObserved>=0)base.facts.push({kind:'days_since_first_observed',days:history.daysSinceFirstObserved});
 if(Number.isInteger(history.sourceDaysOnMarket)&&history.sourceDaysOnMarket>=0)base.facts.push({kind:'source_reported_listing_age',days:history.sourceDaysOnMarket,continuousAvailabilityProven:false});
 if(Number.isInteger(history.priceReductionCount)&&history.priceReductionCount>0)base.facts.push({kind:'observed_price_reductions',count:history.priceReductionCount,netReduction:history.netReduction??null,basis:'permitted_dated_observations_not_complete_price_history'});
 if(history.latestPriceChange)base.facts.push({kind:'most_recent_observed_price_change',...history.latestPriceChange});
 if(lineage.relisted===true&&Number.isInteger(lineage.reviewedLinks)&&lineage.reviewedLinks>0)base.facts.push({kind:'reviewed_same_watch_relist_links',count:lineage.reviewedLinks,continuousAvailabilityProven:false});
 if(history.researchLeads?.some(l=>l.kind==='reported_failed_reserve'))base.facts.push({kind:'source_reported_failed_reserve',completedSale:false,executableOffer:false});
 if(!history.availableToAct)return{...base,status:'RECHECK_AVAILABILITY',questions:['Confirm current availability before discussing price']};
 const wholesale=row.intelligence?.wholesale;
 if(rights.pricingPermitted===true&&row.currency==='USD'&&Number.isFinite(row.askingPrice)&&row.askingPrice>0&&
    wholesale?.observedSales>=3&&Number.isFinite(wholesale.gross)&&wholesale.gross>0){
  base.facts.push({kind:'ask_vs_reviewed_wholesale',ask:row.askingPrice,wholesale:wholesale.gross,
   difference:Math.round((row.askingPrice-wholesale.gross)*100)/100,verifiedSales:wholesale.observedSales});
 }
 if(history.priceReductionCount>=2&&typeof history.currentAskingPrice==='number'&&Number.isFinite(history.currentAskingPrice)&&history.currentAskingPrice>0&&(!history.latestPriceChange||history.latestPriceChange.appliesToCurrentAsk&&history.latestPriceChange.direction==='decrease'))base.inferences.push({kind:'repeated_repricing_may_indicate_flexibility',certainty:'inference'});
 if(lineage.relisted)base.inferences.push({kind:'relist_may_merit_follow_up',certainty:'inference'});
 const repricedUp=history.latestPriceChange?.direction==='increase'||history.latestPriceChange?.direction==='currency_changed';
 base.questions=[...(history.researchLeads?.some(l=>l.kind==='reported_failed_reserve')?['After the reported failed reserve, is this exact watch currently available for a direct offer and on what terms?']:[]),'Is the watch still available in the described configuration?',...(repricedUp?['The latest observed ask increased or changed currency; can you confirm the current total price?']:base.inferences.length?['Is there flexibility on price given the documented listing history?']:[]),'Can you confirm the total price including applicable shipping and fees?'];
 return{...base,status:'OBSERVATIONS_SEPARATE_FROM_SELLER_INTENT'};
}
