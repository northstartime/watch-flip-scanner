import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { inspectFeedValidation, testMarker } from './test-controlled-upload.js';
import { withTimeout } from '../src/runtimeUtils.js';

export function diagnoseFeed(rows) {
  return { count: Array.isArray(rows) ? rows.length : null, testCardPresent: Array.isArray(rows) && rows.some(row => row?.id === testMarker.id), validation: inspectFeedValidation(rows) };
}
class FeedInspectionError extends Error {
  constructor(category, status) {
    super('Feed inspection failed.');
    this.category = category;
    if (Number.isInteger(status) && status >= 100 && status <= 599) this.status = status;
  }
}
export function formatFeedFailure(error) {
  // Never serialize arbitrary exception messages, causes, stacks, URLs or bodies.
  if (!(error instanceof FeedInspectionError)) return { ok: false, category: 'INSPECTION_ERROR' };
  return { ok: false, category: error.category, ...(error.status == null ? {} : { status: error.status }) };
}
export async function diagnosePublishedFeed({ fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  try {
    return await withTimeout(async () => {
      let response;
      try {
        response = await fetchImpl('https://watch-flip-scanner.onrender.com/api/opportunities', {
          method: 'GET', cache: 'no-store', redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' },
        });
      } catch { throw new FeedInspectionError('NETWORK_ERROR'); }
      if (!response.ok) {
        // Do not read or print an HTTP error body. Cancellation is best-effort.
        try { void response.body?.cancel().catch(() => {}); } catch { /* Keep HTTP status. */ }
        throw new FeedInspectionError('HTTP_ERROR', response.status);
      }
      let rows;
      try { rows = await response.json(); }
      catch (error) {
        // A failed body download is a network error; malformed completed JSON is distinct.
        throw new FeedInspectionError(error instanceof SyntaxError ? 'INVALID_JSON' : 'NETWORK_ERROR');
      }
      return diagnoseFeed(rows);
    }, timeoutMs, { onTimeout: () => controller.abort(), label: 'Feed inspection' });
  } catch (error) {
    if (error.code === 'TIMEOUT') throw new FeedInspectionError('TIMEOUT');
    if (error instanceof FeedInspectionError) throw error;
    throw new FeedInspectionError('INSPECTION_ERROR');
  } finally { controller.abort(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (!args.length || args.join(' ') === '--local') {
      console.log(JSON.stringify(diagnoseFeed(JSON.parse(await fs.readFile(new URL('../src/data/opportunities.json', import.meta.url), 'utf8')))));
    } else if (args.join(' ') === '--live-read') {
      console.log(JSON.stringify(await diagnosePublishedFeed()));
    } else { throw new FeedInspectionError('INVALID_ARGUMENTS'); }
  } catch (error) {
    const local = !process.argv.slice(2).length || process.argv.slice(2).join(' ') === '--local';
    console.error(JSON.stringify(formatFeedFailure(local && !(error instanceof FeedInspectionError)
      ? new FeedInspectionError(error instanceof SyntaxError ? 'INVALID_JSON' : 'LOCAL_READ_ERROR') : error)));
    process.exitCode = 1;
  }
}
