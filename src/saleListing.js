import {watchReferences,recognizeWatchIdentity} from './watchIdentity.js';
import {parseAskingPrice,facebookPostIdentity} from './listingIntegrity.js';

export function classifySale(text) {
  const value=String(text??'').normalize('NFKC').trim();
  const lead=value.replace(/^(?:#[\w-]+\s*)+/,'').replace(/^[^\p{L}\p{N}\[]+/u,'').slice(0,350);
  if(/^(?:(?:fresh|quick|new|updated|another)\s+)*(?:ref(?:erence)?\s+check|reference request|references on)\b/i.test(lead) ||
      /\b(?:ref(?:erence)?\s+check\s+(?:on|for|myself)|please\s+vouch\s+for\s+(?:me|him|her|them))\b/i.test(lead))return {kind:'non_sale',reason:'reference_check_post'};
  if(/^(?:\[?WTB\]?|ISO|wanted\b|want(?:ing)?\s+to\s+buy|looking\s+(?:to\s+buy|for)|in search of)\b/i.test(lead))return {kind:'non_sale',reason:'wanted_to_buy_post'};
  if(/^(?:price\s+check|legit\s+check|authenticity\s+check|scam\s+alert|stolen\b|giveaway\b|raffle\b|sold\b|withdrawn\b)/i.test(lead))return {kind:'non_sale',reason:'non_sale_or_unavailable'};
  const identity=recognizeWatchIdentity(value);
  const watch=Boolean(identity.reference || /\b(?:rolex|rlx|hblt|hublot|omega|tudor|cartier|panerai|breitling|seiko|iwc)\b/i.test(value));
  const sale=/\b(?:FS|WTS|for sale|selling|asking|price|firm|obo|wholesale|wire first|no reserve|auction)\b/i.test(value) || parseAskingPrice(value).amount!==null;
  return watch&&sale?{kind:'sale',reason:'watch_sale_evidence'}:{kind:'non_sale',reason:'sale_intent_not_established'};
}

export function splitSalePost(item) {
  const classification=classifySale(item.listingText);
  if(classification.kind!=='sale')return {listings:[],reason:classification.reason};
  const identity=facebookPostIdentity(item.url);
  if(!identity)return {listings:[],reason:'invalid_listing_permalink'};
  const postId=identity.split(':')[1];
  if(item.id && String(item.id)!==`moda-${postId}`)return {listings:[],reason:'post_identity_conflict'};
  const text=String(item.listingText).normalize('NFKC');
  const references=watchReferences(text);
  let segments=[text];
  if(references.length>1) {
    let offset=0;const headers=[];
    for(const line of text.split('\n')) {
      const refs=watchReferences(line);
      if(refs.length===1 && /^\s*(?:\d+[.)]\s*)?(?:(?:rolex|rlx|omega|omg|hblt|hublot|tudor|tdr|cartier|panerai)\b[^\n]{0,60}?)?(?:ref(?:erence)?\.?\s*[:#-]?\s*)?(?:M?\d{4,6}[A-Z]{0,4}|PAM\d{3,6}|\d{3}\.)/i.test(line)) headers.push({offset,reference:refs[0]});
      offset+=line.length+1;
    }
    if(headers.length!==references.length || new Set(headers.map(h=>h.reference)).size!==headers.length)return {listings:[],reason:'multi_watch_boundaries_unresolved'};
    segments=headers.map((h,i)=>text.slice(h.offset,headers[i+1]?.offset??text.length).trim());
  }
  const multi=segments.length>1;
  const listings=segments.flatMap(segment=>{
    if(classifySale(segment).kind!=='sale')return [];
    const watch=recognizeWatchIdentity(segment);
    const key=watch.reference || [watch.brand,watch.model].filter(Boolean).join('-');
    if(!key)return [];
    const watchKey=key.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const priceExtraction=item.textStatus==='truncated'?{amount:null,currency:null,status:'missing',reason:'post_text_truncated',evidence:[],rejectedReasons:[]}:parseAskingPrice(segment);
    const photos=(item.photos??[]).filter(photo=>photo.postId===postId && watchReferences(photo.alt??'').length===1 && watchReferences(photo.alt??'')[0]===watch.reference);
    const image=multi?(photos.length===1?photos[0].src:null):(item.image??null);
    const group=new URL(item.url).pathname.split('/')[2];
    return [{...item,id:`moda-${postId}-watch-${watchKey}`,parentPostId:postId,watchKey,
      url:`https://www.facebook.com/groups/${group}/posts/${postId}/`,
      listingText:segment,originalPostText:text,saleStatus:'sale',listingKind:multi?'split_watch':'single_watch',
      componentCount:segments.length,reference:watch.reference,priceExtraction,price:priceExtraction.amount,image,
      photoAssociation:multi?(image?'reference_in_owned_photo_caption':'unresolved'):(image?'owned_single_watch_post':'unavailable'),
      reviewReasons:[...(item.reviewReasons??[]),...(multi&&!image?['photo_not_bound_to_watch']:[])]}];
  });
  return {listings,reason:listings.length?'sale_components_identified':'watch_identity_unresolved'};
}

export function eligibleSaleRecord(row) {
  const identity=row&&facebookPostIdentity(row.url);
  if(!identity)return false;
  if(row.watchKey && (row.parentPostId!==identity.split(':')[1] ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.watchKey) || row.id!==`moda-${row.parentPostId}-watch-${row.watchKey}`))return false;
  const text=row.originalListing??row.listingText??row.title;
  if(classifySale(text).kind!=='sale')return false;
  // Existing unsplit multi-watch records are retained on disk but not shown as one watch.
  if(!row.watchKey && watchReferences(text).length>1)return false;
  return true;
}
