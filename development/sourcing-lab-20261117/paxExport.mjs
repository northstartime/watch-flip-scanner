import {validCalendarTime} from './exportValidation.mjs';

const columns=['recordId','url','title','brand','reference','observedAt','originalListedAt','askingPrice',
  'currency','saleStatus','groupId','groupName','sellerName','availabilityStatus','availabilityEvidence','captureMethod',
  'condition','completeness','dial','bezel','bracelet','year'];
const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const validText=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\x00-\x1f]/.test(value);
const timestamp=value=>validCalendarTime(value)&&value.includes('T');
const postPath=/^\/groups\/([A-Za-z0-9._-]{1,100})\/(?:posts|permalink)\/(\d{1,40})\/?$/i;

function facebookPost(value){
  const url=new URL(value);
  const match=url.pathname.match(postPath);
  if(url.protocol!=='https:'||!['facebook.com','www.facebook.com','m.facebook.com'].includes(url.hostname)||
     url.port||url.username||url.password||!match)throw Error('PAX_FACEBOOK_POST_OR_GROUP_INVALID');
  return match;
}

function prepareListing(row,now){
  if(row?.source!=='facebook'||!validText(row.postUrl,2048))throw Error('PAX_FACEBOOK_POST_REQUIRED');
  const match=facebookPost(row.postUrl);
  if(typeof row.group?.id!=='string'||
     row.group.id.toLowerCase()!==match[1].toLowerCase())throw Error('PAX_FACEBOOK_POST_OR_GROUP_INVALID');
  const [,groupId,postId]=match;
  if(!validText(row.title,1000)||!validText(row.brand,80)||!validText(row.reference,80)||
     [row.group.name,row.seller,row.condition,row.boxPapers,row.dial,row.bezel,row.bracelet,row.year]
       .some(value=>value!=null&&!validText(value,200)))throw Error('PAX_LISTING_METADATA_INVALID');
  if(!timestamp(row.observedAt)||Date.parse(row.observedAt)>Date.parse(now)||
     (row.listedAt!=null&&(!timestamp(row.listedAt)||Date.parse(row.listedAt)>Date.parse(row.observedAt)))) {
    throw Error('PAX_LISTING_DATES_INVALID');
  }
  const ask=row.askingPrice,currency=row.currency;
  if(ask==null ? currency!=null : !['string','number'].includes(typeof ask)||
     !/^(?:[1-9]\d{0,7}|0)(?:\.\d{1,2})?$/.test(String(ask))||Number(ask)<=0||!/^[A-Z]{3}$/.test(currency??'')) {
    throw Error('PAX_ASK_OR_CURRENCY_INVALID');
  }
  const availability=row.availability;
  if(availability!=null&&(!['reported_available','unavailable','unknown'].includes(availability.status)||
     (availability.status!=='unknown'&&!validText(availability.evidence,500))||
     (availability.evidence!=null&&!validText(availability.evidence,500))))throw Error('PAX_AVAILABILITY_INVALID');
  return {recordId:'facebook-post:'+postId,url:`https://www.facebook.com/groups/${groupId.toLowerCase()}/posts/${postId}`,
    title:row.title,brand:row.brand,reference:row.reference,observedAt:row.observedAt,originalListedAt:row.listedAt,
    askingPrice:ask,currency,saleStatus:availability?.status==='reported_available'?'sale':'other',
    groupId:groupId.toLowerCase(),groupName:row.group.name,sellerName:row.seller,captureMethod:'pax',
    availabilityStatus:availability?.status,availabilityEvidence:availability?.evidence,condition:row.condition,completeness:row.boxPapers,
    dial:row.dial,bezel:row.bezel,bracelet:row.bracelet,year:row.year};
}

export function previewPaxFindings(payload,rights,now){
  if(rights?.source!=='facebook'||rights.authorizedToProcess!==true||rights.internalOnly!==true||
     !validText(rights.reference,500)||!validCalendarTime(rights.expiresAt)||!(Date.parse(rights.expiresAt)>Date.parse(now))){
    throw Error('DOCUMENTED_FACEBOOK_PREVIEW_PERMISSION_REQUIRED');
  }
  if(!Array.isArray(payload?.findings)||payload.findings.length<1||payload.findings.length>500||
     !validText(payload.observed_timezone,80))throw Error('PAX_FINDINGS_REPORT_REQUIRED');
  let today;
  try{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:payload.observed_timezone,
      year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)).map(({type,value})=>[type,value]));
    today=parts.year+'-'+parts.month+'-'+parts.day;
  }catch{throw Error('PAX_OBSERVATION_TIMEZONE_INVALID');}
  const seen=new Map(),issues=[];
  let duplicates=0;
  for(const [index,finding] of payload.findings.entries()){
    try{
      if(!validText(finding?.post_url,2048))throw Error();
      const [,groupId,postId]=facebookPost(finding.post_url);
      if(!validText(finding.source,200)||!validText(finding.reference,80)||
         !validText(finding.availability_evidence,500)||!validCalendarTime(finding.observed_date)||
         finding.observed_date.length!==10||finding.observed_date>today||
         (finding.price_currency!=null&&!/^[A-Z]{3}$/.test(finding.price_currency))||
         [finding.price,finding.listing_date,finding.condition,finding.box_papers,finding.model]
          .some(value=>value!=null&&!validText(value,500)))throw Error();
      const row={source:'facebook',group:finding.source,reference:finding.reference,model:finding.model??null,
        url:`https://www.facebook.com/groups/${groupId.toLowerCase()}/posts/${postId}`,observedDate:finding.observed_date,
        observedAt:null,observationTimezone:payload.observed_timezone,listingDateText:finding.listing_date??null,
        askText:finding.price??null,currency:finding.price_currency??null,availabilityEvidence:finding.availability_evidence,
        condition:finding.condition??null,boxPapers:finding.box_papers??null,
        decision:'REVIEW',score:null,projectedProfit:null,maximumAllIn:null};
      const prior=seen.get(postId);
      if(!prior)seen.set(postId,row);
      else if(JSON.stringify(prior)===JSON.stringify(row))duplicates++;
      else issues.push({row:index+1,code:'PAX_CONFLICTING_POST'});
    }catch{issues.push({row:index+1,code:'PAX_FINDING_INVALID'});}
  }
  const rows=issues.length?[]:[...seen.values()];
  return {status:issues.length?'IMPORT_REVIEW_REQUIRED':'READ_ONLY_PREVIEW',count:rows.length,duplicates,rows,issues,persisted:false};
}

export function preparePaxExport(payload,now){
  if(payload?.schemaVersion!==1||payload.source!=='facebook'||payload.captureMethod!=='pax'||
     !Array.isArray(payload.listings)||payload.listings.length<1||payload.listings.length>500) {
    throw Error('PAX_FACEBOOK_EXPORT_V1_REQUIRED');
  }
  const records=[],issues=[];
  for(const [index,row] of payload.listings.entries()){
    try {records.push(prepareListing(row,now));}
    catch(error){issues.push({row:index+1,code:/^PAX_/.test(error.message)?error.message:'PAX_FACEBOOK_POST_OR_GROUP_INVALID'});}
  }
  return {issues,csv:[columns.map(cell).join(','),...records.map(row=>columns.map(key=>cell(row[key])).join(','))].join('\n')};
}
