// Explain the existing engine's blockers, without granting rights or calculating prices.
export function nextDealAction(row,{now}={}){
 const time=Date.parse(now);if(!Number.isFinite(time))throw Error('EXPLICIT_READINESS_TIME_REQUIRED');
 const answer=(stage,nextAction)=>({stage,nextAction,automaticActions:0});
 if(row.source==='ebay')return answer('SOURCE_PERMISSION','Obtain eBay pricing/retention permission before connecting this lead to deal analysis');
 if(!row.history?.availableToAct)return answer('RECHECK_LISTING','Recheck current original listing availability; stale observations cannot qualify');
 if(row.analysis?.decision==='PASS')return answer('PASS','Pass under current evidence and costs; do not negotiate from an unsupported exit');
 if(row.settings?.rights?.authorizedExport!==true||row.settings.rights.pricingPermitted!==true||!Number.isFinite(Date.parse(row.settings.rights.expiresAt))||Date.parse(row.settings.rights.expiresAt)<=time)return answer('SOURCE_PERMISSION','Confirm current source processing and pricing rights');
 if(row.verified===true&&row.analysis?.decision==='BUY'&&row.analysis.estimatedNetProfit>=1000)return answer('EVIDENCE_QUALIFIED','Complete seller/authenticity due diligence; no transaction approval');
 const reasons=row.analysis?.reasons??[];
 if(reasons.includes('dealer_due_diligence_or_availability_required'))return answer('DEALER_REVIEW','Complete current watch-specific dealer, payment, inspection, originality and availability checks');
 if(row.configurationAudit?.complete===false||reasons.some(r=>r.startsWith('listing_')&&r.endsWith('_unconfirmed')||r==='target_configuration_unconfirmed'))return answer('CONFIGURATION','Confirm exact reference, dial, bracelet, year, condition and completeness');
 if(reasons.includes('listing_observation_changed_recheck_required')||reasons.includes('current_manual_listing_review_required'))return answer('RECHECK_LISTING','Recheck asking price, configuration and availability on the current original listing');
 if(reasons.some(r=>/cost|fee|opening_policy/.test(r)))return answer('DOCUMENT_COSTS','Document acquisition and selling costs; blank expenses are not zero');
 if((row.comps?.verifiedSoldCount??0)<3||reasons.includes('sufficient_exact_reviewed_sales_required'))return answer('SOLD_EVIDENCE','Obtain sufficient exact reviewed completed-sale proof; asks are not resale values');
 if(reasons.includes('verified_current_exact_exit_quote_required'))return answer('EXIT_EVIDENCE','Obtain a current exact executable exit quote; optimistic retail is not a buy ceiling');
 if(row.analysis?.decision==='NEGOTIATE')return answer('NEGOTIATION_REQUIRED','Review the suggested opening offer and stay below the documented all-in ceiling to target $1,000 net');
 return answer('COMPLETE_REVIEW','Resolve the remaining engine blockers before treating this lead as an evidence-qualified deal');
}
