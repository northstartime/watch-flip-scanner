import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { offlineInventoryServer } from './helpers/offline-inventory-server.js';

globalThis.fetch = () => { throw new Error('Live network forbidden'); };
const endpoint = 'https://synthetic.invalid/api/scan-request';
const headers = { Authorization: 'Bearer scan-request-fixture' };

async function fixture(t) {
  const previous = process.env.NORTH_STAR_UPLOAD_KEY;
  process.env.NORTH_STAR_UPLOAD_KEY = 'scan-request-fixture';
  t.after(() => { if (previous === undefined) delete process.env.NORTH_STAR_UPLOAD_KEY; else process.env.NORTH_STAR_UPLOAD_KEY = previous; });
  const server = await offlineInventoryServer(t);
  return { ...server, scanFile: path.join(path.dirname(server.file), 'scan-request.json') };
}

test('missing scan request returns null only to authenticated GET and creates no files', async t => {
  const server = await fixture(t);
  assert.equal(fs.existsSync(server.scanFile), false);
  for (const auth of [undefined, 'Bearer wrong-fixture', 'Basic invalid']) {
    const result = await server.fetchImpl(endpoint, { headers: auth ? { Authorization: auth } : {} });
    assert.equal(result.status, 401);
    assert.deepEqual(await result.json(), { error: 'Unauthorized.' });
  }
  const result = await server.fetchImpl(endpoint, { headers });
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { requestedAt: null });
  assert.equal(result.headers.get('cache-control'), 'no-store, private');
  assert.deepEqual(fs.readdirSync(path.dirname(server.file)), []);
  delete process.env.NORTH_STAR_UPLOAD_KEY;
  assert.equal((await server.fetchImpl(endpoint, { headers })).status, 503);
  assert.equal(fs.existsSync(server.scanFile), false);
});

test('GET returns stored JSON unchanged and repeated polling never acknowledges or rewrites it', async t => {
  const server = await fixture(t);
  const saved = { requestedAt: '2026-11-10T00:00:00.000Z', extra: { keep: true } };
  const bytes = JSON.stringify(saved, null, 2);
  fs.writeFileSync(server.scanFile, bytes);
  const mtime = fs.statSync(server.scanFile).mtimeMs;
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(await (await server.fetchImpl(endpoint, { headers })).json(), saved);
    assert.equal(fs.readFileSync(server.scanFile, 'utf8'), bytes);
    assert.equal(fs.statSync(server.scanFile).mtimeMs, mtime);
  }
});

test('POST remains unauthenticated, uses one timestamp, and writes only configured fixture directory', async t => {
  const server = await fixture(t);
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 10, 1) });
  const inventory = '[{"id":"legacy-fixture","keep":true}]';
  fs.writeFileSync(server.file, inventory);
  delete process.env.NORTH_STAR_UPLOAD_KEY;
  const result = await server.fetchImpl(endpoint, { method: 'POST' });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  const response = await result.json();
  assert.deepEqual(response, { ok: true, requestedAt: '2026-11-10T01:00:00.000Z' });
  assert.deepEqual(JSON.parse(fs.readFileSync(server.scanFile)), { requestedAt: response.requestedAt });
  assert.equal(fs.readFileSync(server.file, 'utf8'), inventory);
  assert.deepEqual(fs.readdirSync(path.dirname(server.file)).sort(), ['opportunities.json', 'scan-request.json']);
  process.env.NORTH_STAR_UPLOAD_KEY = 'scan-request-fixture';
  t.mock.timers.tick(10000);
  assert.deepEqual(await (await server.fetchImpl(endpoint, { headers })).json(), { requestedAt: response.requestedAt });
  const second = await (await server.fetchImpl(endpoint, { method: 'POST' })).json();
  assert.equal(second.requestedAt, '2026-11-10T01:00:10.000Z');
  assert.notEqual(second.requestedAt, response.requestedAt);
  assert.deepEqual(JSON.parse(fs.readFileSync(server.scanFile)), { requestedAt: second.requestedAt });
  assert.deepEqual(await (await server.fetchImpl(endpoint, { headers })).json(), { requestedAt: second.requestedAt });
});

test('invalid stored JSON fails safely without overwriting or clearing the request', async t => {
  const server = await fixture(t);
  fs.writeFileSync(server.scanFile, 'private-fixture-invalid-json');
  const result = await server.fetchImpl(endpoint, { headers });
  assert.equal(result.status, 500);
  assert.deepEqual(await result.json(), { error: 'SCAN_REQUEST_READ_FAILED' });
  assert.equal(fs.readFileSync(server.scanFile, 'utf8'), 'private-fixture-invalid-json');
});

test('failed POST returns a fixed error and cleans its temporary file', async t => {
  const server = await fixture(t);
  // A directory at the destination forces atomic replacement to fail portably.
  fs.mkdirSync(server.scanFile);
  const result = await server.fetchImpl(endpoint, { method: 'POST' });
  assert.equal(result.status, 500);
  assert.deepEqual(await result.json(), { error: 'SCAN_REQUEST_WRITE_FAILED' });
  assert.ok(fs.statSync(server.scanFile).isDirectory());
  assert.deepEqual(fs.readdirSync(path.dirname(server.file)), ['scan-request.json']);
});
