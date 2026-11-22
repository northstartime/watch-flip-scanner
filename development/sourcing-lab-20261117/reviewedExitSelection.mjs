// Exact executable exits require independent, internally consistent reviewed provenance.
import {exitQuotes} from './reused/development/market-intelligence/exitAnalysis.mjs';
import {deduplicateReviewedEvidence} from './compWorkbench.mjs';
export function reviewedExitSelection(watch,rows,{now}={}){
 const current=exitQuotes(watch,rows,{now}),dedup=deduplicateReviewedEvidence(current.quotes??[]);
 // Same URL/ID with contradictory values/dates/configuration is not independent proof.
 const checked=exitQuotes(watch,dedup.accepted,{now});
 return{...checked,provenanceConflicts:dedup.conflicts,provenanceDuplicates:dedup.duplicates};
}
