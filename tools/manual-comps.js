// Explicit human-reviewed intake only. No provider scraping, credentials or scan.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEvidenceStore} from '../development/market-intelligence/evidenceStore.mjs';
import {normalizeEvidence} from '../development/market-intelligence/evidence.mjs';
const providers={WatchCharts:'watchcharts.com',Grailzee:'grailzee.com',eBay:'ebay.com'};
export async function importReviewedComps({records,directory,reviewer,proof,confirmed=false,at=new Date().toISOString()}){
 if(!confirmed||!reviewer?.trim()||!proof?.trim())throw Error('EXPLICIT_HUMAN_REVIEW_REQUIRED');
 if(!Array.isArray(records)||!records.length||records.length>100)throw Error('COMPS_BATCH_REQUIRED');
 const normalized=records.map(input=>{
  if(input.kind!=='sold'||input.actualSoldAmountConfirmed!==true||!providers[input.source])throw Error('ACTUAL_SOLD_PRICE_REQUIRED_NOT_ASKING_OR_ESTIMATE');
  const row=normalizeEvidence({...input,verification:{status:'unverified'}});
  const host=new URL(row.url).hostname.toLowerCase(),domain=providers[row.source];
  if(host!==domain&&!host.endsWith('.'+domain))throw Error('COMP_SOURCE_URL_MISMATCH');
  if(!row.eventAt||Date.parse(row.observedAt)>Date.parse(at))throw Error('VALID_SALE_AND_REVIEW_DATES_REQUIRED');
  if(!Object.keys(row.watch.configuration).length)throw Error('COMP_CONFIGURATION_REQUIRED');
  return row;
 });
 const store=createEvidenceStore(directory);let state=await store.read();
 state=await store.importUnverified(normalized,{expectedRevision:state?.revision??0,at});
 for(const row of normalized)state=await store.verify(row,{expectedRevision:state.revision,at,
  review:{reviewerId:reviewer.trim(),proofId:proof.trim(),method:'manual_review'}});
 return{status:'MANUAL_COMPS_REVIEW_RECORDED',revision:state.revision,records:state.state.records.length,
  note:'Human review recorded; comp-derived prices remain estimates, not guaranteed exit values.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
 try{
  if(args.includes('--template')){
   console.log(JSON.stringify({records:[{source:'WatchCharts',recordId:'REPLACE_WITH_SOURCE_RECORD_ID',
    url:'https://watchcharts.com/REPLACE_WITH_SOURCE_RECORD',watch:{brand:'Tudor',reference:'79360N',configuration:{dial:'Panda',condition:'REPLACE',completeness:'REPLACE'}},
    kind:'sold',amount:null,currency:'USD',eventAt:null,observedAt:null,saleChannel:'retail',actualSoldAmountConfirmed:false}]},null,2));
  }else{
   if(!args.includes('--import')||!args.includes('--reviewer')||!args.includes('--proof')||!args.includes('--confirm-reviewed'))throw Error('IMPORT_REVIEW_FLAGS_REQUIRED');
   const input=JSON.parse(await fs.readFile(get('--import'),'utf8'));
   const directory=args.includes('--directory')?path.resolve(get('--directory')):fileURLToPath(new URL('../automation/research/comps',import.meta.url));
   console.log(JSON.stringify(await importReviewedComps({records:input.records,directory,reviewer:get('--reviewer'),proof:get('--proof'),confirmed:true})));
  }
 }catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'MANUAL_COMPS_IMPORT_FAILED_REVIEW_BEFORE_RETRY');process.exitCode=1;}
}
