import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createUploadAuthorization, normalizeUploadKey } from '../src/uploadAuth.js';
import { cloudEndpoint, uploadOpportunities } from '../src/cloudSync.js';
import { openFacebookSession, withFacebookSession, withScratchPage } from '../src/browserSession.js';
import { dumpAccessibilityTree } from '../src/collectors/modaCollector.js';
import { getModaListings } from '../src/markets/moda.js';
import { embedModaImages } from '../src/mobileImages.js';
import { withTimeout, mapLimit, measureStage } from '../src/runtimeUtils.js';
import { server } from '../src/server.js';

globalThis.fetch = () => { throw new Error('Real HTTP is forbidden in offline tests'); };
for (const method of ['connect', 'connectOverCDP', 'launch', 'launchPersistentContext']) chromium[method] = () => { throw new Error('Real browser access is forbidden in offline tests'); };
const quiet = () => {};
// All tokens in this file are synthetic fixtures, never environment values.
const env = { NORTH_STAR_CLOUD_URL: 'https://synthetic.invalid', NORTH_STAR_UPLOAD_KEY: ' synthetic-fixture-token ' };
function authorize(configured, headers) {
  let status = 200, body, passed = false;
  const req = { get: name => headers[name.toLowerCase()] };
  const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
  createUploadAuthorization({ getConfiguredKey: () => configured })(req, res, () => { passed = true; });
  return { status, body, passed };
}

test('upload auth reproduces and fixes client/server whitespace mismatch', () => {
  assert.equal(authorize('  synthetic-fixture-token \r\n', { authorization: 'Bearer synthetic-fixture-token' }).passed, true);
  assert.equal(normalizeUploadKey(' \t '), null);
  assert.equal(normalizeUploadKey('synthetic\r\nfixture'), null);
});

test('upload auth distinguishes missing server configuration from rejection', () => {
  assert.equal(authorize(undefined, {}).status, 503);
  assert.equal(authorize('  ', {}).status, 503);
  assert.equal(authorize('synthetic-fixture-token', {}).status, 401);
  assert.equal(authorize('synthetic-fixture-token', { authorization: 'Bearer wrong-fixture' }).status, 401);
});

test('Bearer scheme is case insensitive; legacy API key remains supported', () => {
  assert.equal(authorize('synthetic-fixture-token', { authorization: 'bearer synthetic-fixture-token' }).passed, true);
  assert.equal(authorize('synthetic-fixture-token', { 'x-api-key': ' synthetic-fixture-token ' }).passed, true);
  assert.equal(authorize('synthetic-fixture-token', { authorization: 'Basic invalid', 'x-api-key': 'synthetic-fixture-token' }).status, 401);
  assert.equal(authorize('synthetic-fixture-token', { authorization: '', 'x-api-key': 'synthetic-fixture-token' }).status, 401);
});

test('cloud endpoint normalizes base or complete endpoint without duplication', () => {
  assert.equal(cloudEndpoint(' https://synthetic.invalid/ '), 'https://synthetic.invalid/api/opportunities');
  assert.equal(cloudEndpoint('https://synthetic.invalid/api/opportunities/'), 'https://synthetic.invalid/api/opportunities');
  assert.equal(cloudEndpoint('http://127.0.0.1:3000'), 'http://127.0.0.1:3000/api/opportunities');
  assert.equal(cloudEndpoint('  '), null);
  for (const value of ['not a URL', 'http://synthetic.invalid', 'https://fixture:fixture@synthetic.invalid', 'https://synthetic.invalid?fixture=1']) assert.throws(() => cloudEndpoint(value), /Invalid cloud upload URL/);
});

test('uploader and server middleware agree without a socket or real credential', async () => {
  const body = [{ id: 'synthetic-watch', title: 'Synthetic watch', source: 'Moda', url: '', price: null, marketValue: null, projectedProfit: null, score: 0, decision: 'REVIEW', image: null }];
  const before = '"' + 'a'.repeat(64) + '"';
  const after = '"' + 'b'.repeat(64) + '"';
  let requests = 0;
  const logs = [];
  const result = await uploadOpportunities(body, { env, log: value => logs.push(value), fetchImpl: async (url, options) => {
    requests++;
    assert.equal(url, 'https://synthetic.invalid/api/opportunities' + (options.method === 'GET' ? '/inventory' : ''));
    assert.equal(options.redirect, 'error');
    const auth = authorize(' synthetic-fixture-token ', { authorization: options.headers.Authorization });
    assert.equal(auth.passed, true);
    if (options.method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), body);
      assert.equal(options.headers['If-Match'], before);
      return { ok: true, headers: new Headers({ ETag: after }), json: async () => ({ ok: true, count: body.length, version: after }) };
    }
    const version = requests === 1 ? before : after;
    return { ok: true, headers: new Headers({ ETag: version }), json: async () => ({ ok: true, complete: true, version, opportunities: requests === 1 ? [] : body }) };
  } });
  assert.deepEqual(result, { ok: true, count: 1, added: 1, skippedExistingIds: 0, posts: 1 });
  assert.equal(requests, 3);
  assert.equal(logs.some(value => value.includes('synthetic-fixture-token')), false);
});

test('unconfigured upload skips without trying HTTP; missing key fails locally', async () => {
  const fetchImpl = () => { throw new Error('Must not fetch'); };
  assert.deepEqual(await uploadOpportunities([], { env: {}, log: quiet, fetchImpl }), { skipped: true });
  await assert.rejects(uploadOpportunities([], { env: { NORTH_STAR_CLOUD_URL: 'https://synthetic.invalid' }, fetchImpl }), /upload key is required/);
});

test('401 is actionable, never retries, and never echoes response content', async () => {
  let calls = 0, bodyRead = false;
  await assert.rejects(uploadOpportunities([], { env, log: quiet, fetchImpl: async () => {
    calls++;
    return { ok: false, status: 401, body: { cancel: async () => {} }, json: async () => { bodyRead = true; return { error: 'synthetic-private-detail' }; } };
  } }), error => error.status === 401 && /authorization rejected/.test(error.message) && !error.message.includes('synthetic-private-detail'));
  assert.equal(calls, 1);
  assert.equal(bodyRead, false);
});

for (const status of [403, 409, 412, 413, 428, 429, 500, 503]) test(`upload HTTP ${status} remains distinguishable without remote text`, async () => {
  await assert.rejects(uploadOpportunities([], { env, log: quiet, fetchImpl: async () => ({ ok: false, status }) }), error => error.status === status && error.message.includes(String(status)));
});

test('transport exceptions and redirects do not leak URL/key details', async () => {
  await assert.rejects(uploadOpportunities([], { env, log: quiet, fetchImpl: async () => { throw new Error('synthetic-private-detail'); } }), error => /transport error/.test(error.message) && !error.message.includes('synthetic-private-detail'));
});

test('upload timeout aborts even when a fake request ignores cancellation', async () => {
  let signal;
  await assert.rejects(uploadOpportunities([], { env, timeoutMs: 10, log: quiet, fetchImpl: async (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  } }), error => error.code === 'TIMEOUT');
  assert.equal(signal.aborted, true);
});

test('upload deadline covers stalled response parsing as well as request headers', async () => {
  await assert.rejects(uploadOpportunities([], { env, timeoutMs: 10, log: quiet, fetchImpl: async () => ({ ok: true, json: async () => new Promise(() => {}) }) }), error => error.code === 'TIMEOUT');
});

test('invalid success acknowledgements cannot be mistaken for a completed upload', async () => {
  for (const result of [{}, { ok: true, count: 2 }, null]) await assert.rejects(uploadOpportunities([], { env, log: quiet, fetchImpl: async () => ({ ok: true, json: async () => result }) }), /invalid acknowledgement/);
  await assert.rejects(uploadOpportunities([], { env, log: quiet, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('bad json'); } }) }), /invalid JSON/);
});

test('invalid upload bodies fail before networking', async () => {
  await assert.rejects(uploadOpportunities({}, { env }), /must be an opportunities array/);
  const circular = []; circular.push(circular);
  await assert.rejects(uploadOpportunities(circular, { env }), /cannot be serialized/);
});

function fakePage(url = 'about:blank') {
  const page = new EventEmitter();
  page.closed = false;
  page.url = () => url;
  page.isClosed = () => page.closed;
  page.close = async () => { page.closed = true; };
  return page;
}
function browserFixture() {
  const pages = [fakePage('https://www.facebook.com/groups/watchtradercommunity/'), fakePage('https://www.facebook.com/groups/Watchtrading/')];
  let connects = 0, disconnects = 0;
  const context = { pages: () => pages, close: () => { throw new Error('Never close a user context'); } };
  const browser = { contexts: () => [context], close: async () => { disconnects++; } };
  return { pages, context, connect: async (endpoint, options) => { connects++; assert.equal(endpoint, 'http://127.0.0.1:9222'); assert.equal(options.timeout, 10000); return browser; }, connects: () => connects, disconnects: () => disconnects };
}

test('one browser session selects exact groups and disconnects without closing user pages', async () => {
  const fixture = browserFixture();
  const session = await openFacebookSession({ connect: fixture.connect });
  assert.equal(await session.getPage('Watchtrading'), fixture.pages[1]);
  await session.close(); await session.close();
  assert.equal(fixture.connects(), 1);
  assert.equal(fixture.disconnects(), 1);
  assert.equal(fixture.pages.some(page => page.closed), false);
  await assert.rejects(session.getPage('Watchtrading'), /already released/);
});

test('missing group and operation errors still release the CDP connection', async () => {
  for (const operation of [session => session.getPage('missing'), async () => { throw new Error('Synthetic failure'); }]) {
    const fixture = browserFixture();
    await assert.rejects(withFacebookSession(operation, { connect: fixture.connect }));
    assert.equal(fixture.disconnects(), 1);
    assert.equal(fixture.pages.some(page => page.closed), false);
  }
});

test('disconnect has a deadline and surfaces cleanup failure', async () => {
  const session = await openFacebookSession({ connect: async () => ({ close: async () => new Promise(() => {}) }), timeoutMs: 10 });
  await assert.rejects(session.close(), error => error.code === 'TIMEOUT');
});

test('scratch page cleanup handles success, failure and nested popups while preserving unrelated pages', async () => {
  for (const fails of [false, true]) {
    const scratch = fakePage(), popup = fakePage(), child = fakePage(), unrelated = fakePage();
    const operation = withScratchPage({ newPage: async () => scratch }, async page => {
      page.emit('popup', popup); popup.emit('popup', child);
      if (fails) throw new Error('Synthetic failure');
      return 42;
    });
    if (fails) await assert.rejects(operation, /Synthetic failure/); else assert.equal(await operation, 42);
    for (const page of [scratch, popup, child]) { assert.equal(page.closed, true); assert.equal(page.listenerCount('popup'), 0); }
    assert.equal(unrelated.closed, false);
  }
});

test('scratch timeout aborts the operation and closes its page', async () => {
  const scratch = fakePage(); let signal;
  await assert.rejects(withScratchPage({ newPage: async () => scratch }, async (_, value) => {
    signal = value;
    return new Promise(() => {});
  }, { timeoutMs: 10 }), error => error.code === 'TIMEOUT');
  assert.equal(signal.aborted, true);
  assert.equal(scratch.closed, true);
  assert.equal(scratch.listenerCount('popup'), 0);
});

test('late scratch-page creation is closed after the creation deadline', async () => {
  const scratch = fakePage(); let finish;
  await assert.rejects(withScratchPage({ newPage: () => new Promise(resolve => { finish = resolve; }) }, quiet, { cleanupMs: 10 }), error => error.code === 'TIMEOUT');
  finish(scratch);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(scratch.closed, true);
});

test('uncloseable scratch page surfaces a bounded failure and removes its handlers', async () => {
  const scratch = fakePage(); scratch.close = async () => { throw new Error('Synthetic close failure'); };
  await assert.rejects(withScratchPage({ newPage: async () => scratch }, async () => 1), /could not be closed/);
  assert.equal(scratch.listenerCount('popup'), 0);
});

test('normal group scans share one connection and skip scratch creation for empty discovery', async () => {
  const fixture = browserFixture();
  const saved = [], timing = [];
  for (const page of fixture.pages) {
    page.waitForSelector = async () => {};
    page.waitForTimeout = async () => {};
    page.mouse = { wheel: async () => {} };
    page.locator = () => ({ evaluateAll: async () => [] });
  }
  fixture.context.newPage = () => { throw new Error('Empty feeds must not create scratch pages'); };
  const result = await getModaListings(undefined, { sessionOptions: { connect: fixture.connect }, collectorOptions: { saveListings: value => saved.push(value), onTiming: value => timing.push(value) } });
  assert.deepEqual(result, []);
  assert.equal(fixture.connects(), 1);
  assert.equal(fixture.disconnects(), 1);
  assert.equal(saved.length, 2);
  assert.equal(timing.some(event => event.stage === 'facebook-discovery'), true);
});

test('discovery exits as soon as its target is found, using one extraction call per pass', async () => {
  let calls = 0, scrolls = 0;
  const page = { waitForSelector: async () => {}, locator: () => ({ evaluateAll: async callback => {
    calls++;
    return callback([{ href: 'https://www.facebook.com/groups/synthetic/posts/101/' }]);
  } }), mouse: { wheel: async () => { scrolls++; } }, context: () => ({ newPage: async () => { throw new Error('Synthetic creation failure'); } }) };
  await assert.rejects(dumpAccessibilityTree('synthetic', { getPage: async () => page, maxListings: 1, saveListings: quiet, onTiming: quiet }), /Synthetic creation failure/);
  assert.equal(calls, 1);
  assert.equal(scrolls, 0);
});

test('discovery budget rejects stalled extraction without creating a scratch tab', async () => {
  let created = false;
  const page = { waitForSelector: async () => {}, locator: () => ({ evaluateAll: async () => new Promise(() => {}) }), context: () => ({ newPage: () => { created = true; } }) };
  await assert.rejects(dumpAccessibilityTree('synthetic', { getPage: async () => page, groupTimeoutMs: 10, saveListings: quiet, onTiming: quiet }), error => error.code === 'TIMEOUT');
  assert.equal(created, false);
});

const imageWatch = (suffix = 'one') => ({ source: 'Moda', image: `https://synthetic.fbcdn.net/${suffix}.jpg` });
const imageResponse = () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });

test('image embedding deduplicates URLs and limits concurrent downloads', async () => {
  let calls = 0, active = 0, peak = 0;
  const watches = [imageWatch(), imageWatch(), imageWatch('two'), imageWatch('three')];
  const result = await embedModaImages(watches, { log: quiet, fetchImpl: async (_, options) => {
    calls++; active++; peak = Math.max(peak, active);
    assert.equal(options.redirect, 'error');
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return imageResponse();
  } });
  assert.equal(calls, 3);
  assert.equal(peak, 2);
  assert.equal(result.every(watch => watch.image === 'data:image/jpeg;base64,AQID'), true);
});

test('image host validation blocks deceptive hosts and redirect-capable requests', async () => {
  let calls = 0;
  const watches = [{ source: 'Moda', image: 'https://evilfbcdn.net/one.jpg' }, { source: 'Moda', image: 'http://synthetic.fbcdn.net/one.jpg' }];
  assert.deepEqual(await embedModaImages(watches, { log: quiet, fetchImpl: () => { calls++; } }), watches);
  assert.equal(calls, 0);
});

test('oversized image streams and incorrect content types preserve original images', async () => {
  for (const response of [() => imageResponse(), () => new Response('abc', { headers: { 'content-type': 'text/html' } }), () => new Response('abc', { headers: { 'content-type': 'image/jpeg', 'content-length': '99999' } })]) {
    const watches = [imageWatch()];
    assert.deepEqual(await embedModaImages(watches, { maxBytes: 2, log: quiet, fetchImpl: async () => response() }), watches);
  }
});

test('individual image timeout aborts a stalled request and preserves its listing', async () => {
  const watches = [imageWatch()]; let signal;
  const result = await embedModaImages(watches, { timeoutMs: 10, log: quiet, fetchImpl: async (_, options) => { signal = options.signal; return new Promise(() => {}); } });
  assert.deepEqual(result, watches);
  assert.equal(signal.aborted, true);
});

test('overall image budget aborts active downloads and does not start queued downloads', async () => {
  const watches = [imageWatch(), imageWatch('two'), imageWatch('three')];
  let calls = 0;
  const result = await embedModaImages(watches, { timeoutMs: 30, batchTimeoutMs: 10, log: quiet, fetchImpl: async (_, options) => {
    calls++;
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('Synthetic abort')), { once: true }));
  } });
  assert.deepEqual(result, watches);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
});

test('bounded worker pool preserves input order', async () => {
  const result = await mapLimit([3, 2, 1], 2, async value => value * 2);
  assert.deepEqual(result, [6, 4, 2]);
});

test('stage timings report both success and failure without input data', async () => {
  const events = []; let tick = 0;
  const options = { now: () => tick += 5, onTiming: value => events.push(value) };
  assert.equal(await measureStage('synthetic-stage', async () => 1, options), 1);
  await assert.rejects(measureStage('synthetic-stage', async () => { throw new Error('Synthetic failure'); }, options));
  assert.deepEqual(events.map(event => [event.durationMs, event.status]), [[5, 'ok'], [5, 'error']]);
});

test('server import does not bind a port', () => assert.equal(server, null));

test('automation source has one browser startup path, direct Node ownership, and no tolerated crash code', async () => {
  const source = await readFile(new URL('../automation/run-scanner.ps1', import.meta.url), 'utf8');
  assert.equal((source.match(/Start-Process -FilePath \$chromeShortcut/g) || []).length, 1);
  assert.doesNotMatch(source, /Program Files.*chrome\.exe|npm\.cmd|-1073740791|Start-Sleep -Seconds 8/);
  assert.match(source, /Get-Command node\.exe/);
  assert.match(source, /taskkill\.exe \/PID \$scanner.Id \/T \/F/);
  assert.match(source, /WindowStyle Hidden/);
});
