// Targeted diagnostic of three already-known posts. No discovery, scanner, upload,
// dotenv, credentials, inventory or request writes. Run only in the existing AWS
// interactive session when no scan is active. Own scratch page is always closed.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readOwnedFacebookPost} from '../src/collectors/facebookPostOwnership.js';
import {parseAskingPrice} from '../src/listingIntegrity.js';
import {withScratchPage} from '../src/browserSession.js';
export function diagnoseCapturedText(before,after){
 const first=parseAskingPrice(before.text??''),last=parseAskingPrice(after.text??'');
 if(first.amount===null && last.amount!==null && before.diagnostics?.textStatus==='truncated')return 'post_expansion_recovered_asking_price';
 if(after.diagnostics?.textStatus==='truncated')return 'post_still_truncated';
 if(last.amount===null && parseAskingPrice(after.diagnosticText?.domText??'').amount!==null)return 'dom_extraction_omitted_asking_price';
 if(last.amount===null && after.diagnostics?.domHasAdditionalDigits)return 'rendered_text_omits_dom_digits_requires_owned_node_inspection';
 return last.amount===null?'no_numeric_asking_price_in_expanded_rendered_text':'asking_price_present';
}
async function run(){
 const root=process.argv[2];if(!root || !path.isAbsolute(root))throw Error('EXPLICIT_INSTALLED_ROOT_REQUIRED');
 const require=createRequire(path.join(root,'package.json'));
 const {chromium}=require('playwright');
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{timeout:10000,noDefaults:true});
 try{
  const context=browser.contexts().find(c=>c.pages().some(p=>p.url().includes('/groups/watchtradercommunity')));
  if(!context)throw Error('EXISTING_GROUP_SESSION_REQUIRED');
  const rows=await withScratchPage(context,async page=>{
   const reports=[];
   for(const postId of ['2258449521403982','2264692400779694','2264680817447519']){
    await page.goto(`https://www.facebook.com/groups/watchtradercommunity/posts/${postId}/`,{waitUntil:'domcontentloaded',timeout:15000});
    await page.waitForSelector('[data-ad-rendering-role="story_message"]:visible',{timeout:10000});
    const args={groupId:'watchtradercommunity',postId,inspectText:true};
    const before=await page.locator('body').evaluate(readOwnedFacebookPost,args);
    if(!before.text)throw Error('OWNERSHIP_UNRESOLVED');
    const expanded=await page.locator('body').evaluate(readOwnedFacebookPost,{...args,expand:true});
    if(expanded.diagnostics?.expansionAttempted)await page.waitForTimeout(750);
    const after=await page.locator('body').evaluate(readOwnedFacebookPost,args);
    if(!after.text)throw Error('OWNERSHIP_UNRESOLVED');
    reports.push({postId,cause:diagnoseCapturedText(before,after),beforeTruncated:before.diagnostics?.textStatus==='truncated',afterTruncated:after.diagnostics?.textStatus==='truncated',
      expansionAttempted:Boolean(expanded.diagnostics?.expansionAttempted),renderedDigitCount:after.diagnostics?.renderedDigitCount,domDigitCount:after.diagnostics?.domDigitCount,
      askingStatus:parseAskingPrice(after.text).status});
   }return reports;
  },{timeoutMs:90000,cleanupMs:5000});
  console.log(JSON.stringify({ok:true,scannerRun:false,upload:false,posts:rows},null,2));
 }finally{await browser.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const timer=setTimeout(()=>{console.error('STOP: targeted diagnostic timed out; do not retry automatically.');process.exit(1);},110000);
 run().catch(()=>{console.error('STOP: targeted post diagnostic failed; no scan or upload was invoked.');process.exitCode=1;}).finally(()=>clearTimeout(timer));
}
