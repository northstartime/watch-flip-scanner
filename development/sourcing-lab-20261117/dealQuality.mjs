import {identifyReference,listingExclusion} from './listingSignals.mjs';
import {sellerReportedDetails} from './sellerReportedDetails.mjs';
export const hasDealQualityHold=row=>row.analysis?.reasons?.some(r=>/placeholder|misleading_price|fractional_cent|modified_watch|conflicting_listing|title_reference_or_brand|not_a_current_whole_watch/.test(r))===true;
export function reviewDealQuality(listing,{targets,now}={}){
 const issues=[];const title=String(listing?.title??'').slice(0,1000),watch=listing?.watch??listing;
 if(listingExclusion(title))issues.push('not_a_current_whole_watch_sale');
 const wording=title.replace(/\b(?:no aftermarket (?:parts|dial|bezel)|not modified|not a replica)\b/gi,'');
 if(/\b(?:aftermarket|modified|modded|franken|custom dial|custom bezel|custom diamonds|redial|re-dial)\b/i.test(wording))issues.push('modified_watch_exact_comps_review_required');
 if(/\b(?:per month|monthly|installments?|finance payment|starting (?:at|from)|price on request|trade value|each link|per link)\b|\b\d+\s*\/\s*(?:mo|month)\b/i.test(title))issues.push('misleading_price_basis_review_required');
 if(typeof listing?.askingPrice==='number'&&listing.askingPrice<=1)issues.push('placeholder_price_review_required');
 if(/\$\s*1(?:\.00)?(?=$|\s|[^\d.,])/i.test(title))issues.push('placeholder_price_in_title_review_required');
 if(typeof listing?.askingPrice==='number'&&Math.abs(listing.askingPrice*100-Math.round(listing.askingPrice*100))>0.00001)issues.push('fractional_cent_price_review_required');
 const identity=identifyReference({title,reference:watch?.reference,brand:watch?.brand},targets);
 if(!identity.watch)issues.push('title_reference_or_brand_conflict');
 const claims=sellerReportedDetails({title,specifics:{year:watch?.configuration?.year},now});
 if(claims.conflicts.some(c=>c.field==='year'))issues.push('conflicting_listing_year_review_required');
 const dial=watch?.configuration?.dial?.toLowerCase(),dialClaims=[...title.matchAll(/\b(black|blue|white|green|silver|grey|gray|champagne|pink|red|brown|salmon|rhodium)\s+dial\b/gi)].map(m=>m[1].toLowerCase().replace('gray','grey'));
 if(dial&&dialClaims.some(color=>!new RegExp('\\b'+color+'\\b').test(dial.replace('gray','grey'))))issues.push('conflicting_listing_dial_review_required');
 // Explicit additional accessories do not describe the mounted/main bracelet.
 // Modification screening above still sees the entire original title.
 const braceletTitle=title.replace(/\b(?:extra|additional|spare|complimentary)\s+(?:(?:original|oem|factory)\s+)?(?:rubber|leather|steel|titanium|oyster|jubilee|president)\s+(?:bracelet|strap)\b/gi,'');
 const bracelet=watch?.configuration?.bracelet?.toLowerCase();for(const group of [['oyster','jubilee','president'],['rubber','leather','steel','titanium']]){const known=group.find(word=>new RegExp('\\b'+word+'\\b').test(bracelet??''));if(known&&group.some(word=>word!==known&&new RegExp('\\b'+word+'\\s+(?:bracelet|strap)\\b','i').test(braceletTitle)))issues.push('conflicting_listing_bracelet_review_required');}
 return{status:issues.length?'REVIEW_REQUIRED':'NO_AUTOMATED_RED_FLAGS',issues:[...new Set(issues)],authenticityVerified:false,priceVerified:false,automaticApproval:false};
}
