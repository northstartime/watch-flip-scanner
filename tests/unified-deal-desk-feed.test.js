import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDashboardService} from '../development/sourcing-lab-20261117/dashboardService.mjs';

test('hosted read path is separate, private and gated while the legacy feed replays 19 stored to 10 visible',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'northstar-unified-fixture-'));
  const storage=path.join(root,'legacy'), workspace=path.join(root,'desk');
  await fs.mkdir(storage);await fs.mkdir(workspace);
  const cleanup=async()=>{const target=await fs.realpath(root),parent=await fs.realpath(os.tmpdir());
    assert.equal(path.dirname(target),parent);assert.match(path.basename(target),/^northstar-unified-fixture-/);
    await fs.rm(target,{recursive:true,force:true});};
  t.after(cleanup);
  const files=['NORTH_STAR_DATA_DIR','NORTH_STAR_DEAL_DESK_DIR','NORTH_STAR_UNIFIED_READ_TOKEN','NORTH_STAR_UNIFIED_TRUSTED_PROXY','NORTH_STAR_UPLOAD_KEY'];
  const previous=Object.fromEntries(files.map(key=>[key,process.env[key]]));
  t.after(()=>{for(const key of files){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
  Object.assign(process.env,{NORTH_STAR_DATA_DIR:storage,NORTH_STAR_DEAL_DESK_DIR:workspace,
    NORTH_STAR_UPLOAD_KEY:'synthetic-upload-fixture-separate-key'});
  delete process.env.NORTH_STAR_UNIFIED_READ_TOKEN;
  delete process.env.NORTH_STAR_UNIFIED_TRUSTED_PROXY;
  const now=Date.now(),iso=offset=>new Date(now+offset).toISOString();
  const record=(id,extra={})=>({id:'moda-'+id,source:'Moda',url:'https://www.facebook.com/groups/test/posts/'+id,
    title:'WTS Synthetic Rolex 124060',capturedAt:iso(-1000),...extra});
  const inventory=[
    ...Array.from({length:8},(_,i)=>record(100+i)),
    record(200,{id:'moda-200-watch-124060',parentPostId:'200',watchKey:'124060'}),
    record(200,{id:'moda-200-watch-126334',parentPostId:'200',watchKey:'126334',title:'WTS Synthetic Rolex 126334',queue:'opportunities'}),
    record(200),...Array.from({length:7},(_,i)=>record(300+i,{title:'WTB Rolex 124060'})),record(400,{source:'eBay'}),
  ];
  const inventoryFile=path.join(storage,'opportunities.json'),requestFile=path.join(storage,'scan-request.json');
  await fs.writeFile(inventoryFile,JSON.stringify(inventory));
  await fs.writeFile(requestFile,'{"requestedAt":null}');
  const desk=createDashboardService(workspace);
  const permission={confirmed:true,reference:'SYNTHETIC permission fixture',expiresAt:iso(86400000)};
  for(const [source,url] of [
    ['facebook','https://www.facebook.com/groups/test/posts/500'],
    ['chrono24','https://www.chrono24.com/rolex/example.htm'],
    ['grailzee','https://grailzee.com/products/example'],
  ]){
    const listing={source,permission,record:{recordId:source,brand:'Rolex',reference:'124060',title:'WTS Synthetic Rolex 124060',
      url,observedAt:iso(-1000),saleStatus:'sale',askingPrice:'10000',currency:'USD'}};
    assert.equal((await desk.quickListing('real',listing)).status,'IMPORTED');
  }
  const {app}=await import('../src/server.js');
  const listener=await new Promise((resolve,reject)=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));s.once('error',reject);});
  try {
    const base='http://127.0.0.1:'+listener.address().port;
    const get=(route,options)=>fetch(base+route,{...options,signal:AbortSignal.timeout(3000)});
    const legacy=await(await get('/api/opportunities')).json();
    assert.equal((await(await get('/api/health')).json()).count,19);
    assert.equal(legacy.length,10);
    assert.equal(legacy.filter(row=>row.parentPostId==='200').length,2);
    assert.ok(legacy.every(row=>row.preliminaryScreening&&!row.title.startsWith('WTB')));
    assert.equal((await(await get('/api/opportunities?queue=opportunities')).json()).length,1);
    const route='/api/deal-desk/opportunities';
    assert.equal((await get(route)).status,503);
    const token='synthetic-read-fixture-separate-key';
    process.env.NORTH_STAR_UNIFIED_READ_TOKEN=token;
    const headers={Authorization:'Bearer '+token,'X-Forwarded-Proto':'https'};
    assert.equal((await get(route,{headers})).status,403);
    process.env.NORTH_STAR_UNIFIED_TRUSTED_PROXY='127.0.0.1';
    assert.equal((await get(route,{headers:{Authorization:headers.Authorization}})).status,403);
    assert.equal((await get(route,{headers:{...headers,'X-Forwarded-Proto':'https,http'}})).status,403);
    assert.equal((await get(route,{headers:{'X-Forwarded-Proto':'https',Authorization:'Bearer '+process.env.NORTH_STAR_UPLOAD_KEY}})).status,401);
    assert.equal((await get(route+'?token='+token,{headers:{'X-Forwarded-Proto':'https'}})).status,401);
    const response=await get(route,{headers});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store, private');
    const feed=await response.json();
    assert.deepEqual(feed.map(row=>row.source).sort(),['chrono24','facebook','grailzee']);
    assert.ok(feed.every(row=>row.decision==='REVIEW'&&row.maximumAllIn==null&&row.projectedProfit===null));
    assert.equal((await(await get('/api/deal-desk/health',{headers})).json()).count,3);
    assert.equal((await get(route,{method:'POST',headers})).status,404);
    assert.equal(await fs.readFile(inventoryFile,'utf8'),JSON.stringify(inventory));
    assert.equal(await fs.readFile(requestFile,'utf8'),'{"requestedAt":null}');
  }finally{await new Promise(resolve=>listener.close(resolve));}
});
