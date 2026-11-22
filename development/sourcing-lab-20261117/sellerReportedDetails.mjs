// Deterministic text claims, never item verification or evidence of a sale.
export function sellerReportedDetails({title,description,specifics={},now}={}){
 const maxYear=new Date(now).getUTCFullYear();if(!Number.isFinite(maxYear))throw Error('EXPLICIT_CLAIM_TIME_REQUIRED');
 const claims={year:[],box:[],papers:[]},notes=[];
 for(const [source,input]of Object.entries({title,description})){
  if(typeof input!=='string')continue;
  const text=input.slice(0,12288).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\bB\s*&\s*P\b/gi,'box and papers').replace(/\s+/g,' ').trim();
  for(const match of text.matchAll(/\b(?:19|20)\d{2}\b/g)){
   if(Number(match[0])>maxYear)continue;
   const before=text.slice(Math.max(0,match.index-30),match.index),after=text.slice(match.index+4,match.index+30);
   if(/[-–/]\s*$/.test(before)||/^\s*[-–/]\s*(?:19|20)\d{2}\b/.test(after)){notes.push('Year range/date fragment requires manual review');continue;}
   const context=/\b(?:warranty|card|papers|purchase|receipt|dated)\s*(?:date[d]?\s*)?[:=-]?\s*$/i.test(before)||/^\s+(?:warranty|purchase|receipt|papers|card)\b/i.test(after)?'document_date':/\b(?:production|manufactured|manufacture|made)\s*(?:in\s*)?[:=-]?\s*$/i.test(before)?'production':'unspecified';
   claims.year.push({value:match[0],context,source});
  }
  if(/\bfull\s+(?:set|kit)\b/i.test(text))notes.push('Full set claimed; individual box/papers contents unconfirmed');
  // Parse clauses separately so negation or optional extras cannot become included items.
  for(const clause of text.split(/[.;!\n]/)){
   if(clause.includes('?')){if(/\b(?:box|papers)\b/i.test(clause))notes.push('Question about contents is not a seller assertion');continue;}
   if(/\b(?:optional|on request|may include|extra cost|sold separately)\b/i.test(clause)){if(/\b(?:box|papers)\b/i.test(clause))notes.push('Conditional contents require seller confirmation');continue;}
   const negative=/\b(?:no|without|missing)\s+(?:original\s+)?(box(?:\s*(?:and|or|&|\/)\s*papers)?|papers(?:\s*(?:and|or|&|\/)\s*box)?)\b/gi;
   let rest=clause.replace(/\b(?:original\s+)?(box|papers)\s*:\s*(not included|included|yes|no|none)\b/gi,(_,field,value)=>{claims[field.toLowerCase()].push({value:/^(yes|included)$/i.test(value)?'yes':'no',source});return ' ';});
   rest=rest.replace(negative,(span,items)=>{for(const field of ['box','papers'])if(new RegExp('\\b'+field+'\\b','i').test(items))claims[field].push({value:'no',source});return ' ';});
   rest=rest.replace(/\b(box|papers)\s+(?:not included|missing|absent)\b/gi,(_,field)=>{claims[field.toLowerCase()].push({value:'no',source});return ' ';});
   if(/\bwatch only\s*$/i.test(rest.trim()))for(const field of ['box','papers'])claims[field].push({value:'no',source});
   const pair=/\bbox\s*(?:and|&|\/|with)\s*papers\b/i.test(rest);
   for(const field of ['box','papers']){
    const has=pair||new RegExp('\\b(?:with|includes?|original)\\s+(?:original\\s+)?'+field+'\\b|\\b'+field+'\\s+included\\b','i').test(rest);
    if(!has)continue;
    if(new RegExp('\\b(?:service|replacement)\\s+(?:box|papers)\\b','i').test(rest)){notes.push('Service/replacement contents do not establish original box or papers');continue;}
    claims[field].push({value:'yes',source});
   }
  }
 }
 const conflicts=[],result={verified:false,notes:[...new Set(notes)],conflicts};
 for(const field of ['year','box','papers']){
  const all=claims[field].slice(0,24),eligible=field==='year'?all.filter(c=>c.context!=='document_date'):all,values=[...new Set(eligible.map(c=>c.value))];
  const value=values.length===1?values[0]:null;
  if(values.length>1)conflicts.push({field,kind:'seller_claims_disagree'});
  if(specifics.conflictingFields?.includes(field))conflicts.push({field,kind:'conflicting_item_specifics'});
  if(specifics[field]!=null&&eligible.some(c=>c.value!==specifics[field]))conflicts.push({field,kind:'item_specifics_disagree'});
  result[field]={value,status:values.length>1?'conflicting':value!==null?'seller_reported':'unknown',claims:all};
 }
 return result;
}
