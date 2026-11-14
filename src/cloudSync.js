import { normalizeUploadKey } from './uploadAuth.js';
import { withTimeout } from './runtimeUtils.js';
import { validateRows, preparePreservingPayload, verifyPreservingReadback } from './inventoryIntegrity.js';

export function cloudEndpoint(baseValue) {
  if (!baseValue?.trim()) return null;
  try {
    const url = new URL(baseValue.trim());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error();
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith('/api/opportunities') ? path : `${path}/api/opportunities`;
    return url.href;
  } catch { throw new Error('Invalid cloud upload URL; use an HTTPS base URL without embedded credentials, query, or fragment.'); }
}

export async function uploadOpportunities(opportunities, {
  env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 20000,
  log = message => console.log(message),
} = {}) {
  const endpoint = cloudEndpoint(env.NORTH_STAR_CLOUD_URL);
  if (!endpoint) { log('Cloud upload skipped: URL is not configured.'); return { skipped: true }; }
  if (!Array.isArray(opportunities)) throw new Error('Upload body must be an opportunities array.');
  const key = normalizeUploadKey(env.NORTH_STAR_UPLOAD_KEY);
  if (!key) throw new Error('An upload key is required when the cloud URL is configured.');
  let serialized;
  try { serialized = JSON.stringify(opportunities); }
  catch { throw new Error('Upload body cannot be serialized.'); }
  if (Buffer.byteLength(serialized) > 25 * 1024 * 1024) throw new Error('Upload body exceeds the server limit.');
  // Freeze caller data across awaits; validate what JSON will actually transmit.
  const additions = JSON.parse(serialized);
  try { validateRows(additions, 'additions'); }
  catch { const error = new Error('Upload additions are invalid or contain duplicate IDs.'); error.code = 'UPLOAD_ADDITIONS_INVALID'; error.postAttempted = false; throw error; }
  let postAttempted = false;
  const validVersion = value => typeof value === 'string' && /^"[a-f0-9]{64}"$/.test(value);
  async function request(url, options) {
    const controller = new AbortController();
    try { return await withTimeout(async () => {
      const response = await fetchImpl(url, {
        ...options, redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', Authorization: `Bearer ${key}`, ...options.headers },
      });
      if (!response.ok) {
        // Never echo a remote response body: it may contain credentials or HTML.
        try { void response.body?.cancel().catch(() => {}); } catch { /* Ignore cancellation failures. */ }
        const status = Number(response.status);
        const error = new Error(status === 401
          ? 'Cloud upload failed (HTTP 401): authorization rejected. Check runtime key source, matching server configuration, and header forwarding during approved integration testing.'
          : `Cloud upload failed (HTTP ${Number.isInteger(status) ? status : 'unknown'}).`);
        error.status = status;
        error.code = 'UPLOAD_HTTP_ERROR';
        throw error;
      }
      let result;
      try { result = await response.json(); }
      catch { const error = new Error('Cloud upload returned invalid JSON.'); error.code = 'UPLOAD_RESPONSE_ERROR'; throw error; }
      if (!result || result.ok !== true || !validVersion(result.version) || response.headers?.get('etag') !== result.version) {
        const error = new Error('Cloud upload returned an invalid acknowledgement.');
        error.code = 'UPLOAD_RESPONSE_ERROR';
        throw error;
      }
      return result;
    }, timeoutMs, { onTimeout: () => controller.abort(), label: 'Cloud upload' });
    } finally { controller.abort(); }
  }
  async function readInventory() {
    const result = await request(`${endpoint}/inventory`, { method: 'GET' });
    if (result.complete !== true) throw new Error('Incomplete inventory');
    validateRows(result.opportunities, 'baseline', true);
    return result;
  }
  try {
    const baseline = await readInventory();
    // Existing IDs are immutable, including numeric/string equivalents.
    const existingIds = new Set(baseline.opportunities.map(row => String(row.id)));
    if (!additions.some(row => !existingIds.has(String(row.id)))) {
      return { ok: true, count: baseline.opportunities.length, added: 0, skippedExistingIds: additions.length, posts: 0 };
    }
    const payload = preparePreservingPayload(baseline.opportunities, additions);
    postAttempted = true;
    const acknowledgement = await request(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': baseline.version },
      body: JSON.stringify(payload.merged),
    });
    if (acknowledgement.count !== payload.merged.length) {
      const error = new Error('Cloud upload returned an invalid acknowledgement.'); error.code = 'UPLOAD_RESPONSE_ERROR'; throw error;
    }
    const after = await readInventory();
    if (after.version !== acknowledgement.version) throw new Error('Read-back version changed');
    verifyPreservingReadback(payload.merged, after.opportunities);
    log(`Cloud inventory verified: ${after.opportunities.length} records; ${payload.added} added.`);
    return { ok: true, count: after.opportunities.length, added: payload.added, skippedExistingIds: payload.skippedExistingIds, posts: 1 };
  } catch (error) {
    const known = ['TIMEOUT', 'UPLOAD_HTTP_ERROR', 'UPLOAD_RESPONSE_ERROR'].includes(error.code);
    let message = 'Cloud upload failed: transport error, invalid inventory, or failed read-back.';
    if (error.code === 'TIMEOUT') message = 'Cloud upload timed out.';
    if (error.code === 'UPLOAD_RESPONSE_ERROR') message = error.message === 'Cloud upload returned invalid JSON.'
      ? 'Cloud upload returned invalid JSON.' : 'Cloud upload returned an invalid acknowledgement.';
    if (error.code === 'UPLOAD_HTTP_ERROR') message = error.status === 401
      ? 'Cloud upload failed (HTTP 401): authorization rejected.'
      : `Cloud upload failed (HTTP ${Number.isInteger(error.status) ? error.status : 'unknown'}).`;
    const safe = new Error(message);
    safe.code = known ? error.code : 'UPLOAD_VERIFICATION_ERROR';
    if (Number.isInteger(error.status)) safe.status = error.status;
    safe.postAttempted = postAttempted;
    // After any attempted POST, failure can be uncertain. Never retry or roll back.
    if (postAttempted) safe.message += ' POST was attempted; do not retry automatically.';
    throw safe;
  }
}
