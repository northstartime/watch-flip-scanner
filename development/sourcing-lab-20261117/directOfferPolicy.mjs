// Original counterparty offers only. This is not a grant or marketplace-copy loophole.
import {safeURL} from './reused/development/market-intelligence/evidence.mjs';
const marketplaces=/(^|\.)(ebay|chrono24|grailzee|reddit|redd|watchfinder|watchcharts|facebook|fb|watchuseek|rolexforums|watchrecon)\.[a-z.]+$/i;
export function validateDirectOfferURL(value,{originConfirmed,recordId}={}){
 const fail=code=>{throw Object.assign(Error(code),{code});};
 if(originConfirmed!==true||typeof recordId!=='string'||!recordId.trim())fail('DIRECT_ORIGINAL_OFFER_CONFIRMATION_AND_TRACKING_ID_REQUIRED');
 const normalized=safeURL(value);if(!normalized)fail('ORIGINAL_PRIVATE_HTTPS_OFFER_REFERENCE_REQUIRED');
 const u=new URL(normalized);if(u.port||marketplaces.test(u.hostname))fail('MARKETPLACE_CONTENT_CANNOT_BE_RELABELED_DIRECT');
 return normalized;
}
