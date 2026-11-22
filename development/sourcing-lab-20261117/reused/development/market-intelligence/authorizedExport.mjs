// Offline CSV intake only. This is not a provider API or license validator.
import {normalizeEvidence} from './evidence.mjs';
const fail=code=>{const e=Error(code);e.code=code;throw e;};
export function parseCSV(text,{maxRows=5000,maxBytes=2*1024*1024}={}){
 if(!Number.isSafeInteger(maxRows)||maxRows<1||maxRows>10000||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>10*1024*1024)fail('INVALID_EXPORT_LIMITS');
 if(typeof text!=='string'||Buffer.byteLength(text)>maxBytes)fail('EXPORT_SIZE_LIMIT');
 const rows=[];let row=[],field='',quoted=false,closed=false;
 const finishField=()=>{if(field.length>4000)fail('EXPORT_CELL_LIMIT');row.push(field);field='';closed=false;};
 const finishRow=()=>{finishField();if(row.some(cell=>cell.length))rows.push(row);row=[];if(rows.length>maxRows+1)fail('EXPORT_ROW_LIMIT');};
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c===','){finishField();continue;}
  if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;finishRow();continue;}
  if(c==='"'){if(field||closed)fail('INVALID_CSV_QUOTING');quoted=true;continue;}
  if(closed)fail('INVALID_CSV_QUOTING');field+=c;
 }
 if(quoted)fail('INVALID_CSV_QUOTING');if(field||row.length||closed)finishRow();
 if(!rows.length)fail('EXPORT_HEADER_REQUIRED');
 const header=rows.shift().map(h=>h.trim());if(header.some(h=>!h||h.length>100)||new Set(header.map(h=>h.toLowerCase())).size!==header.length)fail('INVALID_EXPORT_HEADERS');
 return{header,rows};
}
export function authorizedEvidenceCSV(text,{source,rights,columns={}}={}){
 if(typeof source!=='string'||!source.trim()||!rights||rights.authorizedToProcess!==true||rights.internalOnly!==true||typeof rights.proofId!=='string'||!rights.proofId.trim())fail('AUTHORIZED_INTERNAL_EXPORT_REQUIRED');
 const {header,rows}=parseCSV(text),index=new Map(header.map((h,i)=>[h,i]));
 const required=['recordId','url','brand','reference','kind','amount','currency','observedAt'];
 for(const name of required)if(!index.has(columns[name]??name))fail('REQUIRED_EXPORT_COLUMN_MISSING');
 const accepted=[],issues=[],seen=new Map();
 for(let i=0;i<rows.length;i++){
  try{
   const cells=rows[i];if(cells.length!==header.length)fail('EXPORT_COLUMN_COUNT');
   const read=name=>cells[index.get(columns[name]??name)]??'';
   if(!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(read('amount')))fail('EXPLICIT_NUMERIC_EXPORT_AMOUNT_REQUIRED');
   const configuration={};for(const key of ['dial','bezel','bracelet','year','caseMaterial','condition','completeness'])if(read(key).trim())configuration[key]=read(key).trim();
   const raw={source:source.trim(),recordId:read('recordId'),url:read('url'),watch:{brand:read('brand'),reference:read('reference'),configuration},kind:read('kind'),amount:Number(read('amount')),currency:read('currency'),observedAt:read('observedAt'),verification:{status:'unverified'}};
   for(const key of ['eventAt','originalListedAt','expiresAt'])if(read(key))raw[key]=read(key);
   if(read('saleChannel'))raw.saleChannel=read('saleChannel');
   for(const key of ['buyerFee','sellerFee'])if(read(key).trim()){
    if(!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(read(key).trim()))fail('INVALID_SALE_FEE');
    raw[key]=Number(read(key));
   }
   const evidence=normalizeEvidence(raw),id=JSON.stringify([evidence.source.toLowerCase(),evidence.recordId]);
   const prior=seen.get(id);if(prior&&JSON.stringify(prior)!==JSON.stringify(evidence))fail('CONFLICTING_EXPORT_RECORD');
   if(!prior){accepted.push(evidence);seen.set(id,evidence);}
  }catch(e){issues.push({row:i+2,code:/^[A-Z_]+$/.test(e.code??'')?e.code:'INVALID_EXPORT_RECORD'});}
 }
 return{status:issues.length?'REVIEW_REQUIRED':'READY_FOR_UNVERIFIED_IMPORT',accepted,issues,rightsProofId:rights.proofId.trim(),distribution:'internal_only',automaticallyImported:false,marketValidated:false};
}
