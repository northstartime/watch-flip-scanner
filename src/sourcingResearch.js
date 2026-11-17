import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createTargetStore,normalizeTarget} from '../development/acquisition-targets/targetStore.mjs';
import {createEvidenceStore} from '../development/market-intelligence/evidenceStore.mjs';
import {priceResearch} from '../development/market-intelligence/priceResearch.mjs';
import {configurationMatches} from '../development/market-intelligence/evidence.mjs';
import {recognizeWatchIdentity} from './watchIdentity.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;

// Reads only. Never initializes, seeds or rewrites inventory or research stores.
export async function loadSourcingContext({directory=path.join(root,'automation','research'),now=new Date().toISOString()}={}){
 const seed=JSON.parse(await fs.readFile(path.join(root,'config','acquisition-targets.json'),'utf8'));
 const stored=await createTargetStore(path.join(directory,'targets')).read();
 const targets=stored?.targets??seed.targets.map((row,i)=>({id:`seed-${i+1}`,...normalizeTarget(row)}));
 const snapshot=await createEvidenceStore(path.join(directory,'comps')).read();
 return{targets,evidence:snapshot?.state.records.map(r=>r.evidence)??[],now,targetRevision:stored?.revision??0,evidenceRevision:snapshot?.revision??0};
}

export function assessSourcing(row,{targets,evidence=[],now}={}){
 const identity=recognizeWatchIdentity('',row);
 const matches=targets.filter(t=>t.enabled!==false&&t.reference===identity.reference&&t.brand.toLowerCase()===String(identity.brand).toLowerCase());
 const ask=positive(row.price)?row.price:positive(row.buyPrice)?row.buyPrice:null;
 const currency=row.currency??'USD';
 const options=matches.map(t=>({target:t,configurationConfirmed:configurationMatches(t.configuration,row.configuration)}));
 const exact=options.filter(x=>x.configurationConfirmed);
 const applicable=exact.length===1?exact[0]:null;
 const target=applicable?.target??(options.length===1?options[0].target:null);
 const ceiling=positive(target?.preliminaryMaximumAllIn)?target.preliminaryMaximumAllIn:null;
 const extras=typeof row.acquisitionExtras==='number'&&Number.isFinite(row.acquisitionExtras)&&row.acquisitionExtras>=0?row.acquisitionExtras:null;
 const configurationConfirmed=Boolean(applicable);
 let signal=matches.length?'TARGET_RESEARCH':'OUTSIDE_TARGET_LIST';
 if(matches.length&&ceiling!==null&&ask!==null&&currency==='USD'){
  if(!configurationConfirmed)signal='CONFIGURATION_REVIEW';
  else if(ask>ceiling||(extras!==null&&ask+extras>ceiling))signal='NEGOTIATE_PRELIMINARY';
  else signal=extras===null?'ASK_BELOW_CEILING_COSTS_UNCONFIRMED':'WITHIN_PRELIMINARY_ALL_IN_CEILING';
 }
 const watch={brand:identity.brand,reference:identity.reference,configuration:{...(target?.configuration??{}),...(row.configuration??{})}};
 // Do not infer a listing's Panda dial or any other configuration from the target.
 const research=identity.brand&&identity.reference&&(!matches.length||configurationConfirmed)
  ?priceResearch(watch,evidence,{now}):null;
 return{identity,preliminary:{signal,target:matches.length>0,targetIds:matches.map(t=>t.id),
  maximumAllIn:ceiling,askingPrice:ask,acquisitionExtras:extras,
  budgetRemainingBeforeCosts:currency==='USD'&&ceiling!==null&&ask!==null?ceiling-ask:null,
  configurationConfirmed,currency,minimumNetProfitObjective:target?.minimumNetProfit??null,
  financialScore:null,projectedProfit:null,verifiedExitValue:null,
  basis:'preliminary_owner_target_not_market_valuation',
  note:matches.length?ceiling===null?'Target reference; no buy ceiling set. Obtain comps before negotiating.':signal==='CONFIGURATION_REVIEW'?'Target configuration is unconfirmed; ceiling is not applicable yet.':signal==='NEGOTIATE_PRELIMINARY'?'Asking/all-in price exceeds preliminary ceiling; investigate a lower offer.':'Preliminary target screening only; verify costs, condition, seller and resale evidence.':'Outside target list; retained for exceptional-opportunity research.'},
  research,verifiedFinancialScore:null};
}

// Response/new-output annotation only. Financial fields are never promoted from
// targets or comp medians. Existing stored rows remain byte-for-byte untouched.
export function annotateSourcing(row,context){
 const assessment=assessSourcing(row,context);
 const research=assessment.research&&Object.fromEntries(Object.entries(assessment.research).map(([key,value])=>
  ['market','wholesale','retail'].includes(key)?[key,{...value,comps:value.comps.map(({proofId,...publicComp})=>publicComp)}]:[key,value]));
 return{...row,brand:assessment.identity.brand,model:assessment.identity.model,
  preliminaryScreening:assessment.preliminary,manualCompResearch:research,
  reasons:[...new Set([...(row.reasons??[]),assessment.preliminary.note])]};
}
