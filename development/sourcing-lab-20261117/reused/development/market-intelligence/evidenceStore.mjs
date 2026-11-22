// Private, explicit evidence intake. Provider claims never verify themselves.
import {createSnapshotStore,canonicalJSON} from '../storage/snapshotStore.mjs';
import {normalizeEvidence,comparableEvidence} from './evidence.mjs';
const fail=code=>{const e=Error(code);e.code=code;throw e;};
const key=row=>JSON.stringify([row.source.toLowerCase(),row.recordId]);
const sourceFacts=row=>{const {observedAt,verification,...facts}=row;return{...facts,source:facts.source.toLowerCase()};};
function validate(state){
 if(!state||!Array.isArray(state.records))fail('INVALID_EVIDENCE_STORE');
 const keys=new Set();
 for(const record of state.records){
  const row=normalizeEvidence(record.evidence);
  if(record.key!==key(row)||keys.has(record.key)||canonicalJSON(row)!==canonicalJSON(record.evidence)||record.distribution!=='internal_only')fail('INVALID_EVIDENCE_RECORD');keys.add(record.key);
  if(row.verification.status==='verified'&&(!record.review||!record.review.reviewerId||record.review.proofId!==row.verification.proofId))fail('EVIDENCE_REVIEW_REQUIRED');
 }
}
export function createEvidenceStore(directory){
 const store=createSnapshotStore(directory,{kind:'market-evidence',validate});
 return{
  read:store.read,
  async importUnverified(inputs,{expectedRevision,at}={}){
   if(!Array.isArray(inputs)||inputs.length<1||inputs.length>10000)fail('EVIDENCE_BATCH_REQUIRED');
   return store.transact({expectedRevision,at,action:'import_unverified',initialState:{records:[]},mutate:state=>{
    for(const input of inputs){
     const row=normalizeEvidence({...input,verification:{status:'unverified'}});
     if(Date.parse(row.observedAt)>Date.parse(at))fail('EVIDENCE_FROM_FUTURE');
     const id=key(row),existing=state.records.find(r=>r.key===id);
     if(existing){
      // Reimporting a source claim cannot revoke or overwrite an actual review.
      if(canonicalJSON(sourceFacts(existing.evidence))!==canonicalJSON(sourceFacts(row)))fail('EVIDENCE_CONFLICT_REVIEW_REQUIRED');
     }else state.records.push({key:id,evidence:row,review:null,distribution:'internal_only'});
    }
    return state;
   }});
  },
  async verify({source,recordId},{expectedRevision,at,review}={}){
   if(!review||typeof review.reviewerId!=='string'||!review.reviewerId.trim()||typeof review.proofId!=='string'||!review.proofId.trim()||!['manual_review','authorized_export_review'].includes(review.method))fail('HUMAN_EVIDENCE_REVIEW_REQUIRED');
   return store.transact({expectedRevision,at,action:'verify_evidence',initialState:{records:[]},mutate:state=>{
    const record=state.records.find(r=>r.key===key({source,recordId}));if(!record)fail('EVIDENCE_NOT_FOUND');
    // checkedAt is a review time, while observedAt becomes time of this reviewed observation.
    if(Date.parse(at)<Date.parse(record.evidence.observedAt))fail('EVIDENCE_REVIEW_BEFORE_OBSERVATION');
    record.evidence=normalizeEvidence({...record.evidence,observedAt:new Date(at).toISOString(),verification:{status:'verified',method:review.method,proofId:review.proofId.trim(),checkedAt:new Date(at).toISOString()}});
    record.review={reviewerId:review.reviewerId.trim(),proofId:review.proofId.trim(),at:new Date(at).toISOString()};return state;
   }});
  },
  async revoke({source,recordId},{expectedRevision,at,reviewerId,reason}={}){
   if(typeof reviewerId!=='string'||!reviewerId.trim()||typeof reason!=='string'||!reason.trim())fail('REVOCATION_REASON_REQUIRED');
   return store.transact({expectedRevision,at,action:'revoke_evidence',initialState:{records:[]},mutate:state=>{
    const record=state.records.find(r=>r.key===key({source,recordId}));if(!record)fail('EVIDENCE_NOT_FOUND');
    record.evidence={...record.evidence,verification:{status:'unverified'}};
    record.review={reviewerId:reviewerId.trim(),reason:reason.trim(),at:new Date(at).toISOString(),revoked:true};return state;
   }});
  },
  async research(target,policy){const snapshot=await store.read();return{storeRevision:snapshot?.revision??0,...comparableEvidence(target,snapshot?.state.records.map(r=>r.evidence)??[],policy)};}
 };
}
