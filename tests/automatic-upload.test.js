import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { uploadOpportunities } from '../src/cloudSync.js';
import { toMobileOpportunity } from '../src/listingIntegrity.js';
import { offlineInventoryServer } from './helpers/offline-inventory-server.js';

globalThis.fetch = () => { throw new Error('Real network forbidden'); };
const env = { NORTH_STAR_CLOUD_URL: 'https://synthetic.invalid', NORTH_STAR_UPLOAD_KEY: 'automatic-fixture' };
const row = id => ({ id, title: 'Fixture', source: 'Moda', url: '', price: null, marketValue: null, projectedProfit: null, score: 0, decision: 'REVIEW', image: null });
const legacy = [{ id: 10, source: 'eBay', custom: { preserve: true } }, { id: 'unknown', omittedFieldsStayOmitted: true }];
const options = fetchImpl => ({ env, fetchImpl, log() {} });

async function fixture(t) {
  const previous = process.env.NORTH_STAR_UPLOAD_KEY;
  process.env.NORTH_STAR_UPLOAD_KEY = env.NORTH_STAR_UPLOAD_KEY;
  t.after(() => { if (previous === undefined) delete process.env.NORTH_STAR_UPLOAD_KEY; else process.env.NORTH_STAR_UPLOAD_KEY = previous; });
  const server = await offlineInventoryServer(t);
  fs.writeFileSync(server.file, JSON.stringify(legacy, null, 2));
  return server;
}

test('automatic upload preserves full hidden legacy inventory and skips numeric/string collisions', async t => {
  const server = await fixture(t);
  const calls = [];
  const result = await uploadOpportunities([row('10'), row('new')], options((url, request) => {
    calls.push({ url, request }); return server.fetchImpl(url, request);
  }));
  assert.equal(result.added, 1); assert.equal(result.skippedExistingIds, 1);
  assert.deepEqual(calls.map(call => call.request.method), ['GET', 'POST', 'GET']);
  assert.ok(calls[0].url.endsWith('/inventory')); assert.ok(calls[2].url.endsWith('/inventory'));
  assert.match(calls[1].request.headers['If-Match'], /^"[a-f0-9]{64}"$/);
  assert.ok(calls.every(call => call.request.headers.Authorization === 'Bearer automatic-fixture' && call.request.redirect === 'error'));
  assert.deepEqual(JSON.parse(fs.readFileSync(server.file)), [...legacy, row('new')]);
});

test('duplicate-only and empty batches do not write or change bytes', async t => {
  const server = await fixture(t); const before = fs.readFileSync(server.file);
  for (const batch of [[row('10')], []]) {
    let posts = 0;
    const result = await uploadOpportunities(batch, options((url, request) => { if (request.method === 'POST') posts++; return server.fetchImpl(url, request); }));
    assert.equal(result.posts, 0); assert.equal(posts, 0);
    assert.ok(fs.readFileSync(server.file).equals(before));
  }
});

test('duplicate incoming IDs and incomplete new rows fail before network', async () => {
  for (const batch of [[row(1), row('1')], [{ id: 'incomplete' }]]) {
    await assert.rejects(uploadOpportunities(batch, options(() => { assert.fail('No network allowed'); })), error => error.code === 'UPLOAD_ADDITIONS_INVALID' && error.postAttempted === false);
  }
});

test('V1 actual publication mapping produces strict canonical review rows without starting collectors', async () => {
  const source = fs.readFileSync(new URL('../src/v1.js', import.meta.url), 'utf8');
  const start = source.indexOf('const mobileListings =');
  const end = source.indexOf('await uploadOpportunities(mobileListings);', start);
  assert.ok(start >= 0 && end > start);
  const raw = [{ id: 'facebook-fixture', listingText: 'Fixture Facebook watch', price: null, source: 'Moda', url: '' },
    { id: 'ebay-fixture', title: 'Fixture eBay watch', price: 1000, source: 'eBay', url: '', image: 'fixture-image' }];
  let published;
  const context = vm.createContext({ enrichedListings: raw, toMobileOpportunity, uploadOpportunities: async rows => { published = rows; } });
  await vm.runInContext(`(async()=>{${source.slice(start, end)}await uploadOpportunities(mobileListings);})()`, context);
  const canonical = JSON.parse(JSON.stringify(published));
  assert.equal(canonical[0].title, raw[0].listingText); assert.equal(canonical[0].image, null);
  assert.equal(canonical[1].image, 'fixture-image');
  assert.ok(canonical.every(value => value.decision === 'REVIEW' && value.projectedProfit === null));
  const version = '"' + 'a'.repeat(64) + '"';
  let posts = 0;
  await assert.rejects(uploadOpportunities(canonical, options(async (url, request) => {
    if (request.method === 'POST') { posts++; return { ok: false, status: 412 }; }
    return { ok: true, headers: new Headers({ ETag: version }), json: async () => ({ ok: true, complete: true, version, opportunities: [] }) };
  })), error => error.status === 412);
  assert.equal(posts, 1);
});

test('caller mutation during protected read cannot change the validated additions', async t => {
  const server = await fixture(t);
  const incoming = [row('new')];
  await uploadOpportunities(incoming, options(async (url, request) => {
    if (request.method === 'GET') incoming[0].title = 'Changed after validation';
    return server.fetchImpl(url, request);
  }));
  assert.deepEqual(JSON.parse(fs.readFileSync(server.file)), [...legacy, row('new')]);
});

test('two concurrent automatic uploads sharing a baseline allow exactly one commit and no retries', async t => {
  const server = await fixture(t);
  let reads = 0, posts = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  const fetchImpl = async (url, request) => {
    if (request.method === 'POST') posts++;
    const response = await server.fetchImpl(url, request);
    if (request.method === 'GET' && ++reads <= 2) {
      if (reads === 2) release();
      await barrier;
    }
    return response;
  };
  const results = await Promise.allSettled(['a', 'b'].map(id => uploadOpportunities([row(id)], options(fetchImpl))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected').reason;
  assert.equal(rejected.status, 412); assert.equal(rejected.postAttempted, true);
  assert.equal(posts, 2);
  const stored = JSON.parse(fs.readFileSync(server.file));
  assert.deepEqual(stored.slice(0, legacy.length), legacy); assert.equal(stored.length, legacy.length + 1);
});

test('intervening writer makes automatic upload stale without overwriting newer inventory', async t => {
  const server = await fixture(t); let posts = 0;
  const newer = row('other-writer');
  const fetchImpl = async (url, request) => {
    if (request.method === 'POST') {
      posts++;
      await server.fetchImpl(url, { ...request, body: JSON.stringify([...legacy, newer]) });
    }
    return server.fetchImpl(url, request);
  };
  await assert.rejects(uploadOpportunities([row('stale')], options(fetchImpl)), error => error.status === 412 && error.postAttempted);
  assert.equal(posts, 1); assert.deepEqual(JSON.parse(fs.readFileSync(server.file)), [...legacy, newer]);
});

test('old or incomplete inventory API never falls back to public feed or attempts POST', async () => {
  const version = '"' + 'a'.repeat(64) + '"';
  for (const response of [
    { ok: false, status: 404 },
    { ok: true, headers: new Headers({ ETag: version }), json: async () => ({ ok: true, version, opportunities: legacy }) },
    { ok: true, headers: new Headers({ ETag: '"wrong"' }), json: async () => ({ ok: true, version, complete: true, opportunities: legacy }) },
  ]) {
    let calls = 0;
    await assert.rejects(uploadOpportunities([row('new')], options(async (url, request) => { calls++; assert.ok(url.endsWith('/inventory')); assert.equal(request.method, 'GET'); return response; })), error => error.postAttempted === false);
    assert.equal(calls, 1);
  }
});

test('bad acknowledgements and changed read-back fail without retry or rollback', async t => {
  const server = await fixture(t);
  for (const mode of ['ack', 'readback', 'version']) {
    fs.writeFileSync(server.file, JSON.stringify(legacy)); let posts = 0, reads = 0;
    const fetchImpl = async (url, request) => {
      if (request.method === 'POST') posts++;
      if (request.method === 'GET') reads++;
      const response = await server.fetchImpl(url, request);
      if ((mode === 'ack' && request.method === 'POST') || (mode !== 'ack' && reads === 2)) {
        const value = await response.json();
        if (mode === 'ack') value.count++;
        else if (mode === 'readback') value.opportunities[0].custom.preserve = false;
        else { value.version = '"' + 'c'.repeat(64) + '"'; response.headers.set('etag', value.version); }
        return { ...response, json: async () => value };
      }
      return response;
    };
    await assert.rejects(uploadOpportunities([row('new')], options(fetchImpl)), error => error.postAttempted && /do not retry automatically/.test(error.message));
    assert.equal(posts, 1); assert.deepEqual(JSON.parse(fs.readFileSync(server.file)), [...legacy, row('new')]);
  }
});

test('POST timeout is uncertain and never retried, with sanitized diagnostics', async t => {
  const server = await fixture(t); let posts = 0, signal;
  await assert.rejects(uploadOpportunities([row('new')], { ...options((url, request) => {
    if (request.method !== 'POST') return server.fetchImpl(url, request);
    posts++; signal = request.signal; return new Promise(() => {});
  }), timeoutMs: 15 }), error => error.code === 'TIMEOUT' && error.postAttempted && !error.message.includes('automatic-fixture'));
  assert.equal(posts, 1); assert.equal(signal.aborted, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(server.file)), legacy);
});

test('transport messages cannot escape through recognized error codes', async () => {
  for (const code of ['TIMEOUT', 'UPLOAD_HTTP_ERROR', 'UPLOAD_RESPONSE_ERROR', undefined]) {
    await assert.rejects(uploadOpportunities([row('new')], options(async () => {
      const error = new Error('private-fixture-detail'); error.code = code; throw error;
    })), error => !error.message.includes('private-fixture-detail') && error.postAttempted === false);
  }
});
