// Mechanical requirements from a fully reviewed scenario, not seller behavior predictions.
export function priceNegotiationFacts({decision,askingPrice,maximumCashOffer,estimatedNetProfit,minimumNetProfit}={}){
 if(!['BUY','NEGOTIATE'].includes(decision)||![askingPrice,maximumCashOffer,estimatedNetProfit,minimumNetProfit].every(Number.isFinite)||askingPrice<=0||maximumCashOffer<=0||minimumNetProfit<1000)return null;
 const reduction=Math.max(0,Math.round(askingPrice*100)-Math.round(maximumCashOffer*100)),shortfall=Math.max(0,Math.round(minimumNetProfit*100)-Math.round(estimatedNetProfit*100));
 return{requiredCashReduction:reduction/100,requiredReductionPercent:Math.round(reduction/Math.round(askingPrice*100)*10000)/100,netProfitShortfallAtAsk:shortfall/100,sellerWillingnessVerified:false,ceilingChanged:false,basis:'existing_reviewed_exit_and_documented_costs_not_market_asks'};
}
