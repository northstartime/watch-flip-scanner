import {dailyWorkspace} from './dailyWorkspace.mjs';
import {createDealerStore,dealerHash,inspectDealerWatch} from './dealerRelationships.mjs';
import {createHash} from 'node:crypto';
import {optionalTargets} from './optionalTargets.mjs';
import {evaluateDealerPackage} from './dealerOffers.mjs';
import {loadAcquisitionPlaybook} from './acquisitionPlaybook.mjs';
import {dailyDecision} from './dailyDecision.mjs';
import {createWantedStore,wantedShortlist,customerDemandSummary,wantedRequestHash} from './customerWanted.mjs';
import {sellerMotivation} from './sellerMotivation.mjs';
import {assessProviderApproval} from './providerApproval.mjs';
import path from 'node:path';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {observeListing} from './reused/development/listing-history/history.mjs';
import {createHistoryStore} from './reused/development/listing-history/historyStore.mjs';
import {createEvidenceStore} from './reused/development/market-intelligence/evidenceStore.mjs';
import {createSnapshotStore,canonicalJSON} from './reused/development/storage/snapshotStore.mjs';
import {authorizedEvidenceCSV} from './reused/development/market-intelligence/authorizedExport.mjs';
import {importListingCSV} from './listingExport.mjs';import {summarizeHistory} from './listingSignals.mjs';
import {researchReviewedSnapshot} from './compWorkbench.mjs';
import {configurationAudit,costAudit,channelMarketIntelligence,opportunityConfidence,rankOpportunities} from './marketIntelligence.mjs';import {negotiateReviewedOpportunity} from './negotiationEngine.mjs';
import * as fixture from './fixtures/scenarios.mjs';
import {createWorkspaceStore,planManualScan,reviewedRelistHistory} from './workspaceWorkflow.mjs';
import {browseResponseCSV,discoveryReportCSV} from './ebayImport.mjs';
import {evidenceCalendarIssues} from './exportValidation.mjs';
import {manualListingRequest,manualEvidenceRequest,isWatchChartsEvidence} from './manualEntry.mjs';
import {buildDailyShortlist} from './dailyShortlist.mjs';
import {manualCosts} from './manualCosts.mjs';
import {prepareChrono24Intake} from './chrono24Integration.mjs';
import {prepareFacebookArchive} from './facebookArchive.mjs';
import {preparePaxExport,previewPaxFindings} from './paxExport.mjs';
import {prepareGrailzeeRecord} from './grailzeeIntake.mjs';
import {analyzeDirectOffer} from './analyzeWatch.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),key=r=>JSON.stringify([r.source,r.sourceRecordId]);
const reviewHash=r=>createHash('sha256').update(canonicalJSON(r)).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
export function createDashboardService(directory,{clock=()=>new Date().toISOString(),playbookFile=path.join(root,'acquisition-playbook.json')}={}){
 async function targets(dataset,includeAllOptional=false){const original=JSON.parse(await fs.readFile(path.join(root,'reused/config/acquisition-targets.json'))).targets;let book;try{book=await loadAcquisitionPlaybook(playbookFile,original);}catch{book=new Map(original.map(t=>[JSON.stringify([t.brand,t.reference]),{brand:t.brand,reference:t.reference,configurationResearchStatus:'PLAYBOOK_FILE_INVALID_REVIEW_REQUIRED',configurationChecks:[],financialPolicyApplied:false}]));}const core=original.map(t=>({...t,minimumNetProfit:1000,playbook:book.get(JSON.stringify([t.brand,t.reference]))}));const watched=dataset?(await stores(dataset).workspace.read())?.state.watchlist??[]:[];return [...core,...(await optionalTargets()).filter(t=>includeAllOptional||watched.includes(t.reference))];}
 function stores(dataset){
  if(!['demo','real'].includes(dataset))fail('INVALID_DATASET');
  // Preserve the earlier demo unchanged; the stricter completeness demo is new.
  const base=path.join(directory,dataset==='demo'?'demo-v2':dataset);
  return{workspace:createWorkspaceStore(path.join(base,'workspace')),history:createHistoryStore(path.join(base,'history')),evidence:createEvidenceStore(path.join(base,'evidence')),
   meta:createSnapshotStore(path.join(base,'reviews'),{kind:'dashboard-reviews',validate:s=>{if(!Array.isArray(s.items))fail('INVALID_DASHBOARD_REVIEWS');}}),base};
 }
 async function editMeta(s,mutate){const before=await s.meta.read();return s.meta.transact({expectedRevision:before?.revision??0,at:clock(),action:'manual_review',initialState:{items:[]},mutate});}
 async function seedDemo(){
  const s=stores('demo');if(await s.history.read())return{status:'DEMO_ALREADY_LOADED'};
  const now=clock(),delta=Date.parse(now)-Date.parse(fixture.now),shift=d=>new Date(Date.parse(d)+delta).toISOString();let saved;
  for(const batch of fixture.batches){const rows=batch.map(r=>({...r,watch:{...r.watch,configuration:Object.keys(r.watch.configuration).length?{...r.watch.configuration,completeness:'Full set'}:{}},observedAt:shift(r.observedAt),originalListedAt:shift(r.originalListedAt),askingPrice:r.sourceRecordId==='motivated'&&r.observedAt===fixture.now?2300:r.askingPrice}));saved=await s.history.ingest(rows,{expectedRevision:saved?.revision??0,at:now});}
  const inputs=[...fixture.sales,fixture.quote].map(r=>({...r,...(['one','two','three'].includes(r.recordId)?{saleChannel:'retail'}:{}),watch:{...r.watch,configuration:{...r.watch.configuration,completeness:'Full set'}},eventAt:shift(r.eventAt),observedAt:now,...(r.expiresAt?{expiresAt:shift(r.expiresAt)}:{})}));
  let ev=await s.evidence.importUnverified(inputs,{expectedRevision:0,at:now});
  for(const id of fixture.reviewedIds)ev=await s.evidence.verify({source:'fixture-sales',recordId:id},{expectedRevision:ev.revision,at:now,review:{reviewerId:'SYNTHETIC DEMO',proofId:'SYNTHETIC-NOT-REAL-'+id,method:'manual_review'}});
  await editMeta(s,state=>{state.items=saved.state.listings.map(r=>({key:key(r),reviewedContentHash:r.contentHash,reviewedObservedAt:r.lastObservedAt,rights:{authorizedExport:true,pricingPermitted:true,reference:'SYNTHETIC DEMO ONLY',expiresAt:new Date(Date.parse(now)+86400000*365).toISOString()},costs:fixture.costs,qualification:{askingPriceVerified:true,exactConfigurationVerified:Object.keys(r.content.watch?.configuration??{}).length>=4,listingCheckedAt:r.lastObservedAt},reviewerId:'SYNTHETIC DEMO',listingProofId:'SYNTHETIC-NOT-REAL',openingDiscountRate:0.05}));return state;});
  return{status:'SYNTHETIC_DEMO_LOADED'};
 }
 async function state(dataset,{wholesaleOnly=false}={}){
  const s=stores(dataset),now=clock(),[history,meta,evidence,allTargets,workspaceSnapshot]=await Promise.all([s.history.read(),s.meta.read(),s.evidence.read(),targets(dataset),s.workspace.read()]);
  const workspace=workspaceSnapshot?.state??{watchlist:[],saved:[],scans:[]};
  const dealers=(await createDealerStore(path.join(s.base,'dealers'),{dataset}).read())?.state.entries??[];
  const rows=[],researchCache=new Map();
  const valuationEvidence=wholesaleOnly&&evidence ? {...evidence,state:{...evidence.state,
   records:evidence.state.records.filter(record=>record.evidence.saleChannel==='wholesale')}} : evidence;
  for(const entry of history?.state.listings??[]){
   const settings=meta?.state.items.find(r=>r.key===key(entry)),watch=entry.content.watch;
   const historySummary=summarizeHistory(entry,{now});
   const lineage=reviewedRelistHistory(history.state,entry,{now});
   if(lineage.relisted){historySummary.newlyListed=false;if(historySummary.availableToAct)historySummary.signals.push({kind:'reviewed_relisting',type:'inference',basis:'explicit_same_watch_proof'});}
   const researchKey=JSON.stringify(watch);if(watch&&!researchCache.has(researchKey))researchCache.set(researchKey,researchReviewedSnapshot(valuationEvidence,watch,{now,requireCompleteness:true,requireBezel:wholesaleOnly}));
   const comps=watch?researchCache.get(researchKey):{accepted:[],verifiedSoldCount:0,diagnostics:[],status:'insufficient_data'};
   const valuationCosts=wholesaleOnly&&settings?.costs?.channelSales ? {...settings.costs,sale:settings.costs.channelSales.wholesale} : settings?.costs;
   const listing={...entry.content,...watch,source:entry.source,observedAt:entry.lastObservedAt,originalListedAt:entry.originalListedAt};
   let analysis={negotiationFacts:null,decision:'RESEARCH',reasons:['documented_pricing_rights_costs_and_listing_review_required'],maximumCashOffer:null,recommendedOpeningOffer:null,estimatedNetProfit:null,maximumAcquisitionAllIn:null},netExit=null;
   if(settings?.rights?.pricingPermitted===true&&Date.parse(settings.rights.expiresAt)>Date.parse(now)){
    try{
     const quoted=(valuationEvidence?.state.records??[]).filter(r=>r.evidence.kind==='executable_exit'&&!isWatchChartsEvidence(r.evidence.source,r.evidence.url)&&r.evidence.verification.status==='verified'&&!r.review?.revoked).map(r=>r.evidence);
     analysis=negotiateReviewedOpportunity({listing,targets:allTargets,target:allTargets.find(t=>t.reference===listing.reference&&t.brand===listing.brand),research:comps,quoteEvidence:quoted,costs:valuationCosts,qualification:settings.qualification,now,rights:settings.rights,openingDiscountRate:settings.openingDiscountRate??null});
     if(analysis.recommendedOpeningOffer!==null&&listing.askingPrice!==null)analysis.recommendedOpeningOffer=Math.min(analysis.recommendedOpeningOffer,listing.askingPrice);
     if(Number.isFinite(analysis.netExit))netExit=analysis.netExit;
    }catch(e){if(e.code||e.message==='DOCUMENTED_PRICING_RIGHTS_REQUIRED')analysis.reasons=[e.code??e.message];else throw e;}
   }
   if(settings&&(settings.reviewedContentHash!==entry.contentHash||settings.reviewedObservedAt!==entry.lastObservedAt)){
    analysis={...analysis,negotiationFacts:null,decision:analysis.decision==='PASS'?'PASS':'RESEARCH',northStarScore:null,maximumCashOffer:null,maximumAcquisitionAllIn:null,recommendedOpeningOffer:null,estimatedNetProfit:null,estimatedROI:null,grossExitUsed:null,netExit:null,exitEvidence:null,reasons:[...new Set([...analysis.reasons,'listing_observation_changed_recheck_required'])]};netExit=null;
   }
   const configuration=configurationAudit(watch,{now}),costs=costAudit(valuationCosts);
   if(!configuration.complete||!costs.complete){analysis={...analysis,decision:analysis.decision==='PASS'?'PASS':'RESEARCH',maximumCashOffer:null,maximumAcquisitionAllIn:null,recommendedOpeningOffer:null,estimatedNetProfit:null,estimatedROI:null,reasons:[...new Set([...analysis.reasons,...configuration.missing.map(f=>'listing_'+f+'_unconfirmed'),...costs.missing])],grossExitUsed:null,netExit:null,exitEvidence:null};netExit=null;}
   const pricingAllowed=settings?.rights?.pricingPermitted===true&&Date.parse(settings.rights.expiresAt)>Date.parse(now)&&entry.source!=='ebay'&&!/(^|\.)ebay\./i.test(new URL(entry.content.url).hostname);
   const intelligence=pricingAllowed?channelMarketIntelligence(comps,{costs:settings.costs,now}):null;
   const dealer=dealers.find(d=>d.listingKeys.includes(key(entry))),savedDealerReview=dealer?.reviews.find(r=>r.listingKey===key(entry)),listingVersion=reviewHash({contentHash:entry.contentHash,observedAt:entry.lastObservedAt}),dealerReview=!dealer&&settings?.sellerType==='business_reported'?inspectDealerWatch(null,{now}):dealer?(savedDealerReview&&savedDealerReview.listingVersion!==listingVersion?{status:'REVIEW_REQUIRED',reasons:['dealer_watch_observation_changed'],availabilityConfirmed:false,listingAgeKnown:false}:inspectDealerWatch(savedDealerReview,{now})):null;
   if(dealerReview&&dealerReview.status!=='CURRENT_MANUAL_REVIEW'){if(dealerReview.reasons.includes('watch_reported_unavailable'))historySummary.availableToAct=false;analysis={...analysis,decision:analysis.decision==='PASS'?'PASS':'RESEARCH',negotiationFacts:null,maximumCashOffer:null,maximumAcquisitionAllIn:null,recommendedOpeningOffer:null,estimatedNetProfit:null,estimatedROI:null,netExit:null,grossExitUsed:null,exitEvidence:null,reasons:[...analysis.reasons,'dealer_due_diligence_or_availability_required',...dealerReview.reasons]};netExit=null;}
   const verified=analysis.decision==='BUY'&&analysis.estimatedNetProfit>=1000&&historySummary.availableToAct;
   rows.push({key:key(entry),source:entry.source,sourceRecordId:entry.sourceRecordId,title:entry.content.title??watch?.reference??'Listing',url:entry.content.url,watch,askingPrice:entry.content.askingPrice,currency:entry.content.currency,
    observedAt:entry.lastObservedAt,lineage,sellerType:settings?.sellerType??'unknown',saved:workspace.saved.find(r=>r.key===key(entry))??null,watchlisted:workspace.watchlist.includes(watch?.reference),configurationAudit:configuration,intelligence,history:historySummary,comps:{...comps,displayedComps:Math.min(comps.accepted.length,20),diagnosticTotal:comps.diagnostics.length,diagnostics:comps.diagnostics.slice(0,40),provenanceConflictCount:comps.provenanceConflicts?.length??0,provenanceConflicts:comps.provenanceConflicts?.slice(0,20)??[],accepted:comps.accepted.slice(0,20).map(r=>({...r,proofReference:r.verification.proofId,verification:{status:r.verification.status}}))},analysis,netExit,verified,
    originalListedAt:entry.originalListedAt,
    ...(entry.content.captureMethod==='pax'?{provenance:{captureMethod:'pax',groupId:entry.content.groupId,groupName:entry.content.groupName??null,seller:entry.content.sellerName??null,availabilityStatus:entry.content.availabilityStatus??null,availabilityEvidence:entry.content.availabilityEvidence??null}}:{}),
    listingVersion,dealerId:dealer?.id??null,dealerReview,category:verified?'verified':'preliminary',dataKind:dataset==='demo'?'SYNTHETIC_FIXTURE':'AUTHORIZED_EXPORT',settings:settings??null});
  }
  for(const row of rows){row.dailyDecision=dailyDecision(row,{now});row.confidence=opportunityConfidence(row);row.motivation=sellerMotivation(row,{now});}
  const wantedSnapshot=await createWantedStore(path.join(s.base,'wanted'),{targets:await targets(dataset,true),dataset}).read(),wanted=wantedSnapshot?.state.entries??[];
  for(const row of rows)row.customerDemand=customerDemandSummary(wanted,row,{now});
  // Fresh observations first; known new source listings precede older listings.
  rows.sort((a,b)=>Number(b.history.availableToAct)-Number(a.history.availableToAct)||Date.parse(b.observedAt)-Date.parse(a.observedAt)||Number(b.history.newlyListed===true)-Number(a.history.newlyListed===true)||(a.history.sourceDaysOnMarket??Infinity)-(b.history.sourceDaysOnMarket??Infinity)||a.key.localeCompare(b.key));
  const buyerMatches=wantedShortlist(wanted,rows,{now});
  return{dailyWorkspace:dailyWorkspace({rows,dealers,wantedShortlist:buyerMatches,now}),dealers:dealers.map(d=>({...d,recordHash:dealerHash(d),followUpDue:Boolean(d.followUpAt&&Date.parse(d.followUpAt)<=Date.parse(now))})),wanted:wanted.map(e=>({...e,requestHash:wantedRequestHash(e)})),wantedShortlist:buyerMatches,providerReadiness:['chrono24','grailzee'].map(source=>assessProviderApproval({source,now})),dataset,dataKind:dataset==='demo'?'SYNTHETIC_FIXTURE':'AUTHORIZED_EXPORT',now,profitTarget:1000,optionalTargets:await optionalTargets(),targets:allTargets,rows,shortlist:buildDailyShortlist(rows,{now}),priorityOrder:rankOpportunities(rows,{mode:'priority'}).map(r=>r.key),workspace,manualPlans:Object.fromEntries(['ebay','chrono24','grailzee','reddit','watchfinder','watchcharts','facebook'].map(source=>[source,planManualScan(allTargets,workspace,{source,now})])),
   counts:{all:rows.length,verified:rows.filter(r=>r.verified).length,preliminary:rows.filter(r=>!r.verified).length},
   evidence:(evidence?.state.records??[]).map(r=>({source:r.evidence.source,recordId:r.evidence.recordId,kind:r.evidence.kind,amount:r.evidence.amount,saleChannel:r.evidence.saleChannel,buyerFee:r.evidence.buyerFee,sellerFee:r.evidence.sellerFee,url:r.evidence.url,watch:r.evidence.watch,status:r.evidence.verification.status,proofId:r.review?.proofId??null,currency:r.evidence.currency,eventAt:r.evidence.eventAt,observedAt:r.evidence.observedAt,expiresAt:r.evidence.expiresAt,reviewedFactsHash:reviewHash(r)})),
   access:{ebay:'Owner confirmed production discovery across28targets with2003unique listings. Live ephemeral discovery is at127.0.0.1:8878; owner confirmed genuine Chrome cards passed, including photos, prices, condition, location, feedback and source age. This persistent workspace rejects eBay web imports; pricing is disabled without further rights.',networkEnabled:false}};
 }
 async function importListings(dataset,input,{skipDuplicateObservations=false}={}){
  if(dataset!=='real')fail('IMPORT_REAL_DATASET_ONLY');const s=stores(dataset),now=clock();
  const parsed=importListingCSV(input.csv,{source:input.source,rights:input.rights,targets:await targets(dataset),now});
  if(parsed.status!=='READY_FOR_LOCAL_HISTORY')return{status:'IMPORT_REVIEW_REQUIRED',issues:parsed.issues,conflicts:parsed.conflicts};
  const before=await s.history.read();
  const existing=new Map((before?.state.listings??[]).map(row=>[row.key,row]));
  const records=parsed.records.filter(row=>{
   const previous=existing.get(key(row)),old=previous?.content.watch;
   if(old&&(old.brand!==row.watch.brand||old.reference!==row.watch.reference))fail('LISTING_IDENTITY_CHANGED_REVIEW_REQUIRED');
   return !skipDuplicateObservations||!previous||!observeListing(previous,row).duplicateObservation;
  });
  if(!parsed.records.length)fail('NO_LISTINGS_TO_IMPORT');
  const duplicates=parsed.duplicates+parsed.records.length-records.length;
  if(!records.length)return{status:'ALREADY_IMPORTED',count:0,duplicates};
  await s.history.ingest(records,{expectedRevision:before?.revision??0,at:now});
  await editMeta(s,meta=>{for(const row of records){let item=meta.items.find(r=>r.key===key(row));if(!item){item={key:key(row)};meta.items.push(item);}item.rights={...input.rights,authorizedExport:true,pricingPermitted:input.rights.pricingPermitted===true};
    // New provider observation never silently inherits human availability approval.
    item.sellerType=row.sellerType??'unknown';item.qualification={};}return meta;});
  return{status:'IMPORTED',count:records.length,duplicates};
 }
 async function importFacebookArchive(dataset,input){
  if(dataset!=='real')fail('IMPORT_REAL_DATASET_ONLY');
  if(input.previewOnly===true)return previewPaxFindings(input.paxExport,input.rights,clock());
  const {csv,issues}=input.paxExport===undefined?prepareFacebookArchive(input.rows,clock()):preparePaxExport(input.paxExport,clock());
  if(issues.length)return{status:'IMPORT_REVIEW_REQUIRED',issues};
  return importListings(dataset,{source:'facebook',csv,rights:{...input.rights,pricingPermitted:false}},{skipDuplicateObservations:true});
 }
 async function importChrono24Export(dataset,input){
  if(dataset!=='real')fail('IMPORT_REAL_DATASET_ONLY');
  const now=clock(),prepared=prepareChrono24Intake({...input,targets:await targets(dataset),now});
  if(prepared.issues.length)return{status:'IMPORT_REVIEW_REQUIRED',issues:prepared.issues};
  if(prepared.evidenceRequests.length||prepared.context.length)fail('CHRONO24_LISTING_EXPORT_ONLY_USE_EVIDENCE_REVIEW');
  if(!prepared.listingRequests.length)fail('NO_LISTINGS_TO_IMPORT');
  const [first]=prepared.listingRequests;
  const [header]=first.csv.split('\n',1);
  const csv=[header,...prepared.listingRequests.map(request=>request.csv.slice(header.length+1))].join('\n');
  return importListings(dataset,{source:'chrono24',csv,rights:first.rights},{skipDuplicateObservations:true});
 }
 async function importGrailzeeListing(dataset,input){
  if(dataset!=='real')fail('IMPORT_REAL_DATASET_ONLY');
  if(input.authorization?.internalOnly!==true)fail('GRAILZEE_INTERNAL_USE_PERMISSION_REQUIRED');
  const prepared=prepareGrailzeeRecord({...input,targets:await targets(dataset),now:clock()});
  if(!prepared.listingRequest)return {status:prepared.status,imported:false};
  return importListings(dataset,prepared.listingRequest,{skipDuplicateObservations:true});
 }
 async function importEBay(dataset,input){const normalized=input.response?.result?discoveryReportCSV(input.response):browseResponseCSV(input.response,{targets:await targets(dataset),observedAt:input.observedAt});if(!normalized.count)return{status:'NO_TARGET_WATCHES',rejected:normalized.rejected};return importListings(dataset,{source:'ebay',csv:normalized.csv,rights:input.rights});}
 async function saveListingReview(dataset,input){
  const costs=input.manualCosts?manualCosts(input.manualCosts):input.costs;
  const s=stores(dataset),history=await s.history.read();if(!history?.state.listings.some(r=>r.key===input.key))fail('LISTING_NOT_FOUND');
  if(typeof input.reviewerId!=='string'||!input.reviewerId.trim()||typeof input.listingProofId!=='string'||!input.listingProofId.trim())fail('REVIEWER_AND_LISTING_PROOF_REQUIRED');
  if(input.openingDiscountRate!==null&&(typeof input.openingDiscountRate!=='number'||input.openingDiscountRate<0||input.openingDiscountRate>=1))fail('INVALID_OPENING_POLICY');
  await editMeta(s,meta=>{const item=meta.items.find(r=>r.key===input.key);if(!item)fail('IMPORT_RIGHTS_REQUIRED');Object.assign(item,{reviewedContentHash:history.state.listings.find(r=>r.key===input.key).contentHash,reviewedObservedAt:history.state.listings.find(r=>r.key===input.key).lastObservedAt,costs,reviewerId:input.reviewerId.trim(),listingProofId:input.listingProofId.trim(),openingDiscountRate:input.openingDiscountRate,
   qualification:{askingPriceVerified:input.askingPriceVerified===true,exactConfigurationVerified:input.exactConfigurationVerified===true,listingCheckedAt:clock()}});return meta;});
  return{status:'REVIEW_SAVED'};
 }
 async function importEvidence(dataset,input){if(dataset!=='real')fail('IMPORT_REAL_DATASET_ONLY');const s=stores(dataset),now=clock(),parsed=authorizedEvidenceCSV(input.csv,{source:input.source,rights:input.rights});const dateIssues=evidenceCalendarIssues(input.csv);if(parsed.issues.length||dateIssues.length||!parsed.accepted.length)return{status:'EVIDENCE_REVIEW_REQUIRED',issues:[...parsed.issues,...dateIssues]};const old=await s.evidence.read();await s.evidence.importUnverified(parsed.accepted,{expectedRevision:old?.revision??0,at:now});return{status:'IMPORTED_UNVERIFIED',count:parsed.accepted.length};}
 async function reviewEvidence(dataset,input){
  if(input.confirmed!==true)fail('EXPLICIT_MANUAL_REVIEW_REQUIRED');const s=stores(dataset),before=await s.evidence.read();
  if(input.reviewedFactsHash!==undefined){const selected=before?.state.records.find(r=>r.evidence.source.toLowerCase()===String(input.source).toLowerCase()&&r.evidence.recordId===input.recordId);if(!selected||input.reviewedFactsHash!==reviewHash(selected))fail('EVIDENCE_CHANGED_REOPEN_PROOF');}
  if(input.revoke)await s.evidence.revoke({source:input.source,recordId:input.recordId},{expectedRevision:before?.revision??0,at:clock(),reviewerId:input.reviewerId,reason:input.proofId});
  else await s.evidence.verify({source:input.source,recordId:input.recordId},{expectedRevision:before?.revision??0,at:clock(),review:{reviewerId:input.reviewerId,proofId:input.proofId,method:'manual_review'}});
  return{status:input.revoke?'EVIDENCE_REVOKED':'EXPLICIT_REVIEW_RECORDED'};
 }
 async function updateWorkspace(dataset,input){const store=stores(dataset),allTargets=await targets(dataset,true),at=clock();
  if(input.action==='watch')await store.workspace.watch(input.reference,input.enabled,{at,targets:allTargets});
  else if(input.action==='save'){const history=await store.history.read();await store.workspace.save(input.key,input.enabled,input.note??'',{at,knownKeys:(history?.state.listings??[]).map(r=>r.key)});}
  else if(input.action==='scan')await store.workspace.scan(input,{at,targets:allTargets});
  else fail('INVALID_WORKSPACE_ACTION');return{status:'WORKSPACE_SAVED'};}
 async function linkRelist(dataset,input){if(input.confirmed!==true||typeof input.reviewerId!=='string'||!input.reviewerId.trim()||typeof input.proofId!=='string'||!input.proofId.trim()||input.reviewerId.length>60||input.proofId.length>128)fail('EXPLICIT_RELIST_REVIEW_REQUIRED');const s=stores(dataset),before=await s.history.read();await s.history.linkRelisting({from:input.from,to:input.to,proofId:input.reviewerId+': '+input.proofId},{expectedRevision:before?.revision??0,at:clock()});return{status:'REVIEWED_RELIST_LINKED'};}
 async function quickListing(dataset,input){return importListings(dataset,manualListingRequest({...input,now:clock()}));}
 async function quickEvidence(dataset,input){return importEvidence(dataset,manualEvidenceRequest({...input,now:clock()}));}
 async function saveWanted(dataset,input){const s=stores(dataset),store=createWantedStore(path.join(s.base,'wanted'),{targets:await targets(dataset,true),dataset}),at=clock();if(input.action==='archive'){await store.archive(input.id,{at,expectedRequestHash:input.expectedRequestHash});return{status:'CUSTOMER_REQUEST_ARCHIVED'};}if(input.action!=='save')fail('WANTED_ACTION_REQUIRED');const result=await store.save(input.record,{at,id:input.id??null,expectedRequestHash:input.expectedRequestHash});return{status:'CUSTOMER_REQUEST_SAVED',id:result.id,requestHash:result.requestHash};}
 async function dealerPackage(dataset,input){const current=await state(dataset),snapshot=await stores(dataset).evidence.read();const quoteEvidence=(snapshot?.state.records??[]).filter(r=>r.review?.revoked!==true).map(r=>r.evidence);return evaluateDealerPackage(input,{rows:current.rows,quoteEvidence,now:current.now,dataKind:current.dataKind});}
 async function saveDealer(dataset,input){const s=stores(dataset),history=await s.history.read();if(input.action==='review'){const record=history?.state.listings.find(r=>key(r)===input.review?.listingKey);if(!record||input.review.listingVersion!==reviewHash({contentHash:record.contentHash,observedAt:record.lastObservedAt}))fail('DEALER_WATCH_CHANGED_REOPEN_PROOF');}return createDealerStore(path.join(s.base,'dealers'),{dataset}).apply(input,{at:clock(),knownKeys:(history?.state.listings??[]).map(key)});}
 async function analyzeWatch(dataset,input){
  if(dataset!=='real')fail('ANALYZE_WATCH_REQUIRES_AUTHORIZED_WORKSPACE');
  const s=stores(dataset);
  const [allTargets,snapshot,history]=await Promise.all([targets(dataset,true),s.evidence.read(),s.history.read()]);
  return analyzeDirectOffer(input,{targets:allTargets,snapshot,history,now:clock()});
 }
 return{analyzeWatch,importFacebookArchive,importChrono24Export,importGrailzeeListing,saveDealer,dealerPackage,targets,state,seedDemo,saveWanted,importListings,importEBay,saveListingReview,importEvidence,reviewEvidence,updateWorkspace,linkRelist,quickListing,quickEvidence};
}
