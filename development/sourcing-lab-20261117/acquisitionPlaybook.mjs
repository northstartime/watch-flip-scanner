import fs from 'node:fs/promises';
// Research guidance only: changing this file never changes financial limits or approval.
export async function loadAcquisitionPlaybook(file,targets){
 const book=JSON.parse(await fs.readFile(file,'utf8'));const fail=()=>{throw Error('INVALID_ACQUISITION_PLAYBOOK');};
 if(book.schemaVersion!==1||book.currency!=='USD'||!Array.isArray(book.entries)||book.entries.length!==targets.length)fail();
 const byKey=new Map();for(const e of book.entries){const key=JSON.stringify([e.brand,e.reference]);if(byKey.has(key)||!targets.some(t=>t.brand===e.brand&&t.reference===e.reference))fail();
  for(const k of ['configurationChecks','conditionRisks','serviceRisks','preferredSourcingChannels','likelyExitChannels'])if(!Array.isArray(e[k])||!e[k].length||e[k].length>30||e[k].some(v=>typeof v!=='string'||!v.trim()||v.length>2000))fail();
  if(typeof e.ownerNotes!=='string'||e.ownerNotes.length>4000||!Number.isFinite(e.minimumNetProfitUSD)||e.minimumNetProfitUSD<1000)fail();
  byKey.set(key,{...e,financialPolicyApplied:false});
 }return byKey;
}
