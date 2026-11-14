import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { offlineInventoryServer } from './helpers/offline-inventory-server.js';
import { runControlledUpload, testMarker } from '../tools/test-controlled-upload.js';
globalThis.fetch=()=>{throw new Error('Network forbidden');};
const six=Array.from({length:6},(_,i)=>({id:`legacy-${i}`,source:i%2?'eBay':'Moda',title:'Rolex 124270 for sale, price on request',url:`https://www.facebook.com/groups/Watchtrading/posts/${100+i}/`,other:{keep:true}}));
const base='https://synthetic.invalid/api/opportunities';
const env={NORTH_STAR_CLOUD_URL:'https://synthetic.invalid',NORTH_STAR_UPLOAD_KEY:'fixture-key'};
test('versioned inventory API and controlled helper',async t=>{
  const before=process.env.NORTH_STAR_UPLOAD_KEY;
  process.env.NORTH_STAR_UPLOAD_KEY='fixture-key';
  t.after(()=>{if(before===undefined)delete process.env.NORTH_STAR_UPLOAD_KEY;else process.env.NORTH_STAR_UPLOAD_KEY=before;});
  const fixture=await offlineInventoryServer(t);
  const {fetchImpl,file}=fixture;
  const reset=()=>fs.writeFileSync(file,JSON.stringify(six,null,2));
  const headers={Authorization:'Bearer fixture-key'};
  await t.test('protected inventory refuses missing/wrong auth while public feed stays Facebook-only',async()=>{
    reset();
    for(const auth of [undefined,'Bearer wrong-fixture']){
      const response=await fetchImpl(base+'/inventory',{headers:auth?{Authorization:auth}:{}});
      assert.equal(response.status,401);
      assert.deepEqual(await response.json(),{error:'Unauthorized.'});
    }
    const response=await fetchImpl(base+'/inventory',{headers});
    const data=await response.json();
    assert.equal(data.complete,true);
    assert.deepEqual(data.opportunities,six);
    assert.equal(response.headers.get('etag'),data.version);
    assert.equal(response.headers.get('cache-control'),'no-store, private');
    const publicRows=await(await fetchImpl(base)).json();
    assert.deepEqual(publicRows,six.filter(row=>row.source==='Moda'));
  });
  await t.test('all writes require auth plus exact If-Match; blind legacy replacement cannot delete hidden rows',async()=>{
    reset();const original=fs.readFileSync(file);
    assert.equal((await fetchImpl(base,{method:'POST',body:'[]'})).status,401);
    const blind=await fetchImpl(base,{method:'POST',headers,body:'[]'});
    assert.equal(blind.status,428);
    assert.equal((await blind.json()).error,'IF_MATCH_REQUIRED');
    assert.deepEqual(fs.readFileSync(file),original);
    const snapshot=await(await fetchImpl(base+'/inventory',{headers})).json();
    const filtered=six.filter(row=>row.source==='Moda');
    const deletion=await fetchImpl(base,{method:'POST',headers:{...headers,'If-Match':snapshot.version},body:JSON.stringify(filtered)});
    assert.equal(deletion.status,409);
    assert.deepEqual(fs.readFileSync(file),original);
  });
  await t.test('complete protected baseline, one POST, full read-back preserve six records and expose only Facebook additions publicly',async()=>{
    reset();const calls=[];
    const addition={...testMarker,id:'new-facebook-fixture',source:'Moda',title:'Rolex 126000 for sale, asking $7000',url:'https://www.facebook.com/groups/Watchtrading/posts/999/'};
    const result=await runControlledUpload({live:true,quietWindowConfirmed:true,env,additions:[addition],fetchImpl:(url,options)=>{calls.push({url,method:options.method,headers:options.headers});return fetchImpl(url,options);}});
    assert.equal(result.existingPreserved,6);
    assert.equal(result.verifiedCount,7);
    assert.deepEqual(calls.map(x=>x.method),['GET','POST','GET']);
    assert.ok(calls[0].url.endsWith('/inventory')&&calls[2].url.endsWith('/inventory'));
    assert.ok(calls[1].headers['If-Match']);
    assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')).slice(0,6),six);
    const publicRows=await(await fetchImpl(base)).json();
    assert.equal(publicRows.length,4);
    assert.deepEqual(publicRows.at(-1),addition);
  });
  await t.test('concurrent helpers using the same baseline allow one commit; stale helper stops without retry',async()=>{
    reset();let posts=0;
    const bridge=(url,options)=>{if(options.method==='POST')posts++;return fetchImpl(url,options);};
    const results=await Promise.allSettled(['a','b'].map(id=>runControlledUpload({live:true,quietWindowConfirmed:true,env,additions:[{...testMarker,id}],fetchImpl:bridge})));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    const failure=results.find(x=>x.status==='rejected').reason;
    assert.equal(failure.status,412);
    assert.equal(failure.postAttempted,true);
    assert.equal(posts,2);
    const stored=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(stored.length,7);
    assert.deepEqual(stored.slice(0,6),six);
  });
  await t.test('stale API writes report 412 and cannot change committed records',async()=>{
    reset();
    const snapshot=await(await fetchImpl(base+'/inventory',{headers})).json();
    const options={method:'POST',headers:{...headers,'If-Match':snapshot.version},body:JSON.stringify([...six,testMarker])};
    assert.equal((await fetchImpl(base,options)).status,200);
    const bytes=fs.readFileSync(file);
    assert.equal((await fetchImpl(base,options)).status,412);
    assert.deepEqual(fs.readFileSync(file),bytes);
  });  await t.test('real Express JSON parsing rejects malformed bodies without exposing submitted content',async()=>{
    reset();const before=fs.readFileSync(file);
    const response=await fixture.parsedRequest('{"fixture-private-listing":');
    assert.equal(response.status,400);
    assert.deepEqual(response.body,{error:'INVALID_JSON'});
    assert.deepEqual(fs.readFileSync(file),before);
  });
  await t.test('real Express parser handles a conditional write without a listening socket',async()=>{
    reset();
    const snapshot=await(await fetchImpl(base+'/inventory',{headers})).json();
    const response=await fixture.parsedRequest(JSON.stringify([...six,testMarker]),{authorization:'Bearer fixture-key','if-match':snapshot.version});
    assert.equal(response.status,200);
    assert.equal(response.body.count,7);
    assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')).slice(0,6),six);
  });

});
