import {processItems} from './prototype.mjs';
const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
// Official Browse response received through an independently authorized channel.
// No fetch, OAuth, hidden endpoints, seller identifiers or pricing permission.
export function browseResponseCSV(response,{targets,observedAt}={}){
 if(response?.itemId&&!response.itemSummaries)response={...response,itemSummaries:[response]};
 if(!response||response.errors?.length||response.warnings?.length||!Array.isArray(response.itemSummaries)||response.itemSummaries.length>100)throw Error('BOUNDED_OFFICIAL_BROWSE_RESPONSE_REQUIRED');
 const parsed=processItems(response.itemSummaries,{targets,observedAt});
 const header=['recordId','url','title','observedAt','saleStatus','askingPrice','currency','brand','reference','originalListedAt','dial','bracelet','year','condition','completeness'];
 const rows=parsed.opportunities.map(row=>[row.id.slice(5),row.url,row.title,observedAt,row.activeSale?'sale':'other',row.askingPrice,row.askingPrice===null?'':row.currency,row.watch.brand,row.watch.reference,
  parsed.history.find(h=>h.sourceRecordId===row.id.slice(5))?.originalListedAt??'',...['dial','bracelet','year','condition','completeness'].map(field=>row.watch.configuration[field]??'')]);
 return{csv:[header,...rows].map(row=>row.map(cell).join(',')).join('\n'),count:rows.length,rejected:parsed.rejected,pricingAuthorized:false};
}
export function discoveryReportCSV(report){
 if(report?.status!=='SUCCESS_BOUNDED_SAMPLE'||report.mode!=='live_read_only'||!Array.isArray(report.result?.opportunities)||report.result.opportunities.length>100||!Number.isFinite(Date.parse(report.observedAt)))throw Error('COMPLETED_DISCOVERY_REPORT_REQUIRED');
 const header=['recordId','url','title','observedAt','saleStatus','askingPrice','currency','brand','reference','originalListedAt','dial','bracelet','year','condition','completeness'];
 const rows=report.result.opportunities.map(r=>{
  if(typeof r.id!=='string'||!r.id.startsWith('ebay:')||r.observedAt!==report.observedAt)throw Error('INVALID_DISCOVERY_PROVENANCE');
  const id=r.id.slice(5),history=report.result.history?.find(h=>h.source==='ebay'&&h.sourceRecordId===id);
  return[id,r.url,r.title,report.observedAt,r.activeSale?'sale':'other',r.askingPrice,r.askingPrice===null?'':r.currency,r.watch?.brand,r.watch?.reference,history?.originalListedAt??'',...['dial','bracelet','year','condition','completeness'].map(field=>r.watch?.configuration?.[field]??'')];
 });
 return{csv:[header,...rows].map(row=>row.map(cell).join(',')).join('\n'),count:rows.length,pricingAuthorized:false};
}
