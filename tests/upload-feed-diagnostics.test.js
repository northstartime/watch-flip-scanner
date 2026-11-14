import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseFeed, diagnosePublishedFeed } from '../tools/diagnose-upload-feed.js';
import { testMarker } from '../tools/test-controlled-upload.js';
globalThis.fetch=()=>{throw new Error('Network forbidden');};
test('read-only inspector returns only metadata and field rejection, without authentication or POST',async()=>{
  let calls=0;
  const result=await diagnosePublishedFeed({fetchImpl:async(url,options)=>{
    calls++;
    assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,undefined);
    assert.equal(options.redirect,'error');
    assert.ok(url.endsWith('/api/opportunities'));
    const row={...testMarker,id:'fixture-private-id',title:'fixture-private-title'};
    delete row.image;
    return {ok:true,json:async()=>[row]};
  }});
  assert.equal(calls,1);
  assert.equal(result.validation.fields[0].reason,'missing');
  assert.equal(JSON.stringify(result).includes('fixture-private'),false);
});
test('marker presence is reported without removing or writing any records',()=>{
  assert.equal(diagnoseFeed([testMarker]).testCardPresent,true);
  assert.equal(diagnoseFeed([testMarker]).validation.code,'VALID');
});

import { formatFeedFailure } from '../tools/diagnose-upload-feed.js';
async function failure(fetchImpl, timeoutMs) {
  try { await diagnosePublishedFeed({ fetchImpl, timeoutMs }); assert.fail('Expected failure'); }
  catch (error) { return formatFeedFailure(error); }
}
for (const status of [401, 404, 503]) test(`HTTP ${status} is reported without reading private error body`, async () => {
  let calls = 0, bodyRead = false, cancelled = false;
  const result = await failure(async () => {
    calls++;
    return { ok: false, status, body: {cancel: async () => {cancelled=true;}}, json: async () => {bodyRead=true; throw new Error('fixture-private-body');} };
  });
  assert.deepEqual(result, {ok:false,category:'HTTP_ERROR',status});
  assert.equal(calls,1);
  assert.equal(bodyRead,false);
  assert.equal(cancelled,true);
});
test('network exceptions and nested causes never appear in output', async () => {
  const result = await failure(async () => {throw new Error('fixture-private-url-key',{cause:new Error('fixture-private-cause')});});
  assert.deepEqual(result,{ok:false,category:'NETWORK_ERROR'});
  assert.equal(JSON.stringify(result).includes('fixture-private'),false);
});
test('invalid JSON does not print the parser message or post contents', async () => {
  assert.deepEqual(await failure(async()=>({ok:true,json:async()=>{throw new SyntaxError('fixture-private-post');}})),{ok:false,category:'INVALID_JSON'});
});
test('response body transport failure is a network error rather than invalid JSON', async () => {
  assert.deepEqual(await failure(async()=>({ok:true,json:async()=>{throw new TypeError('fixture-private-stream');}})),{ok:false,category:'NETWORK_ERROR'});
});
test('stalled fetch times out and aborts without retries', async () => {
  let signal, calls=0;
  const result = await failure(async(_,options)=>{signal=options.signal; calls++; return new Promise(()=>{});},10);
  assert.deepEqual(result,{ok:false,category:'TIMEOUT'});
  assert.equal(signal.aborted,true);
  assert.equal(calls,1);
});
test('timeout covers stalled response JSON too', async () => {
  assert.deepEqual(await failure(async()=>({ok:true,json:()=>new Promise(()=>{})}),10),{ok:false,category:'TIMEOUT'});
});
test('unexpected errors are rendered through a strict safe formatter',()=>{
  const error=new Error('fixture-private-secret');
  error.category='fixture-private-category';
  assert.deepEqual(formatFeedFailure(error),{ok:false,category:'INSPECTION_ERROR'});
});
