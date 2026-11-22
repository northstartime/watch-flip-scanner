import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
import {applyDealDeskValuation,dealDeskPreviewListings,readDealDeskValuations} from './dealDeskValuations.js';
import {evaluateWatch} from './dealDeskFeedScoring.js';
import {deduplicateFeedOpportunities,projectOpportunityForFeed,toMobileOpportunity} from './dealDeskFeedIntegrity.js';

const allowedSources=new Set(['facebook','chrono24','grailzee']);
const digest=value=>createHash('sha256').update(value).digest();
const peerAddress=value=>value?.replace(/^::ffff:/i,'');

export function unifiedDealDeskRead({health=false,env=process.env}={}){
  return async (req,res)=>{
    res.set('Cache-Control','no-store, private');
    const token=env.NORTH_STAR_UNIFIED_READ_TOKEN;
    const directory=env.NORTH_STAR_DEAL_DESK_DIR;
    if(typeof token!=='string'||!/^[-_A-Za-z0-9]{32,}$/.test(token)||token===env.NORTH_STAR_UPLOAD_KEY?.trim()||
       !directory||!path.isAbsolute(directory)){
      return res.status(503).json({error:'UNIFIED_FEED_DISABLED'});
    }
    const proxy=peerAddress(env.NORTH_STAR_UNIFIED_TRUSTED_PROXY);
    const trustedTLSProxy=proxy&&isIP(proxy)&&proxy===peerAddress(req.socket.remoteAddress)&&
      req.get('x-forwarded-proto')==='https';
    if(req.socket.encrypted!==true&&!trustedTLSProxy)return res.status(403).json({error:'HTTPS_REQUIRED'});
    const supplied=req.get('authorization')?.match(/^Bearer ([-_A-Za-z0-9]+)$/i)?.[1];
    if(!supplied||!timingSafeEqual(digest(supplied),digest(token))){
      res.set('WWW-Authenticate','Bearer');
      return res.status(401).json({error:'UNAUTHORIZED'});
    }
    try{
      if(!(await fs.stat(directory)).isDirectory())throw Error('Invalid Deal Desk workspace');
      const now=Date.now();
      const valuations=await readDealDeskValuations(directory,{clock:()=>new Date(now).toISOString()});
      const authorized=valuations.filter(row=>allowedSources.has(row.source)&&row.settings?.rights?.source===row.source&&
        row.settings.rights.authorizedExport===true&&row.settings.rights.historyPermitted===true);
      const feed=deduplicateFeedOpportunities(dealDeskPreviewListings(authorized,now).map(listing=>{
        const watch=applyDealDeskValuation(listing,authorized);
        return toMobileOpportunity({watch,...evaluateWatch(watch)});
      }),now).map(row=>projectOpportunityForFeed(row,now));
      return res.json(health?{ok:true,count:feed.length,updatedAt:feed.reduce((latest,row)=>
        latest===null||Date.parse(row.capturedAt)>Date.parse(latest)?row.capturedAt:latest,null)}:feed);
    }catch{
      return res.status(503).json({error:'UNIFIED_FEED_UNAVAILABLE'});
    }
  };
}
