// Three independent evidence buckets; never derive wholesale/retail with a markup.
import {comparableEvidence} from './evidence.mjs';
export function priceResearch(watch,evidence,{now,maxAgeDays=90,minSold=3}={}){
 const policy={now,maxAgeDays,minSold};
 const overall=comparableEvidence(watch,evidence,policy);
 const wholesale=comparableEvidence(watch,evidence.filter(r=>r.saleChannel==='wholesale'),policy);
 const retail=comparableEvidence(watch,evidence.filter(r=>r.saleChannel==='retail'),policy);
 const bucket=(research,channel)=>({value:research.soldMedian,currency:'USD',basis:research.status==='evidence_available'?'estimate_from_verified_'+channel+'_sales':'insufficient_data',verifiedSoldCount:research.verifiedSoldCount,comps:research.accepted.map(r=>({source:r.source,recordId:r.recordId,url:r.url,amount:r.amount,eventAt:r.eventAt,configuration:r.watch.configuration,proofId:r.verification.proofId})),rejected:research.rejected});
 return{market:bucket(overall,'market'),wholesale:bucket(wholesale,'wholesale'),retail:bucket(retail,'retail'),pricesAreEstimates:true,configurationSpecific:true,unverifiedValuesUsed:false};
}
