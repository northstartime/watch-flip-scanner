import { fileURLToPath } from 'node:url';
import { cloudEndpoint } from '../src/cloudSync.js';
import { normalizeUploadKey } from '../src/uploadAuth.js';
import { withTimeout } from '../src/runtimeUtils.js';
import { validateRows, preparePreservingPayload, verifyPreservingReadback } from '../src/inventoryIntegrity.js';
export { inspectFeedValidation, inspectPreservedFeedValidation, preparePreservingPayload, verifyPreservingReadback } from '../src/inventoryIntegrity.js';

export const testMarker = Object.freeze({ id: 'northstar-controlled-upload-check', title: 'North Star delivery test - manual review', brand: null, seller: 'Unknown seller', price: null, marketValue: null, projectedProfit: null, roi: null, score: 0, decision: 'REVIEW', source: 'Delivery test', url: '', image: null, requiresManualReview: true });
const validVersion = value => typeof value === 'string' && /^"[a-f0-9]{64}"$/.test(value);
export async function runControlledUpload({ live = false, quietWindowConfirmed = false, env = {}, additions = [testMarker], fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  if (!live) return { mode: 'offline-plan', posts: 0, scans: 0, requiresVersionedInventoryApi: true };
  if (!quietWindowConfirmed) throw new Error('QUIET_WINDOW_REQUIRED');
  validateRows(additions, 'additions');
  if (!additions.length) throw new Error('EMPTY_ADDITIONS');
  const endpoint = cloudEndpoint(env.NORTH_STAR_CLOUD_URL);
  const key = normalizeUploadKey(env.NORTH_STAR_UPLOAD_KEY);
  if (!endpoint || !key) throw new Error('UPLOAD_CONFIGURATION_REQUIRED');
  let postAttempted = false;
  const start = performance.now();
  async function request(url, options = {}) {
    const controller = new AbortController();
    try {
      return await withTimeout(async () => {
        const response = await fetchImpl(url, { ...options, redirect: 'error', cache: 'no-store', signal: controller.signal,
          headers: { Accept: 'application/json', Authorization: `Bearer ${key}`, ...options.headers } });
        if (!response.ok) {
          try { void response.body?.cancel().catch(() => {}); } catch { /* Do not read error bodies. */ }
          const error = new Error('INVENTORY_HTTP_ERROR');
          if (Number.isInteger(response.status)) error.status = response.status;
          throw error;
        }
        let data;
        try { data = await response.json(); } catch { throw new Error('INVENTORY_RESPONSE_INVALID'); }
        const etag = response.headers?.get('etag');
        if (!data || data.ok !== true || !validVersion(data.version) || etag !== data.version) throw new Error('INVENTORY_RESPONSE_INVALID');
        return data;
      }, timeoutMs, { onTimeout: () => controller.abort(), label: 'Inventory request' });
    } finally { controller.abort(); }
  }
  async function readInventory(stage) {
    const data = await request(`${endpoint}/inventory`, { method: 'GET' });
    if (data.complete !== true || !Array.isArray(data.opportunities)) throw new Error('FULL_INVENTORY_API_REQUIRED');
    validateRows(data.opportunities, stage, true);
    return data;
  }
  try {
    const baseline = await readInventory('baseline');
    const payload = preparePreservingPayload(baseline.opportunities, additions);
    postAttempted = true;
    const acknowledgement = await request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': baseline.version }, body: JSON.stringify(payload.merged) });
    if (acknowledgement.count !== payload.merged.length) throw new Error('INVENTORY_RESPONSE_INVALID');
    const after = await readInventory('readback');
    if (after.version !== acknowledgement.version) throw new Error('READBACK_VERSION_MISMATCH');
    verifyPreservingReadback(payload.merged, after.opportunities);
    return { ok: true, posts: 1, existingPreserved: payload.existingPreserved, added: payload.added, skippedExistingIds: payload.skippedExistingIds, verifiedCount: after.opportunities.length, runtimeMs: Math.round(performance.now() - start) };
  } catch (error) {
    const safe = new Error(postAttempted ? 'Upload verification did not complete. Do not retry automatically.' : 'Upload stopped before POST.');
    const codes = ['INVENTORY_HTTP_ERROR', 'INVENTORY_RESPONSE_INVALID', 'FULL_INVENTORY_API_REQUIRED', 'FEED_SHAPE_INVALID', 'FEED_ROW_INVALID', 'FEED_DUPLICATE_ID', 'EMPTY_ADDITIONS', 'NO_NEW_LISTINGS', 'PAYLOAD_TOO_LARGE', 'READBACK_MISMATCH', 'READBACK_VERSION_MISMATCH'];
    safe.code = error.code === 'TIMEOUT' ? 'TIMEOUT' : codes.includes(error.message) ? error.message : 'INVENTORY_TRANSPORT_ERROR';
    if (Number.isInteger(error.status)) safe.status = error.status;
    safe.postAttempted = postAttempted;
    if (error.validation) safe.validation = error.validation;
    throw safe;
  }
}

// Real credentials must enter through the separate hidden-input wrapper.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.length || args.join(' ') === '--plan') console.log(JSON.stringify(await runControlledUpload()));
  else { console.error('Use the secure controlled-upload entry point after live-test approval.'); process.exitCode = 1; }
}
