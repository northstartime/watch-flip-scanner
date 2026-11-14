export async function withTimeout(operation, timeoutMs, { onTimeout = () => {}, label = 'Operation' } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Timeout must be positive.');
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { onTimeout(); } catch { /* Preserve the timeout result. */ }
      const error = new Error(`${label} timed out.`);
      error.code = 'TIMEOUT';
      reject(error);
    }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(operation), expired]); }
  finally { clearTimeout(timer); }
}

export async function mapLimit(items, limit, operation) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Concurrency must be a positive integer.');
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await operation(items[index], index);
    }
  }));
  return results;
}

export async function measureStage(name, operation, { now = () => performance.now(), onTiming = event => console.log(`[timing] ${event.stage}: ${event.durationMs}ms ${event.status}`) } = {}) {
  const start = now();
  let status = 'ok';
  try { return await operation(); }
  catch (error) { status = 'error'; throw error; }
  finally { onTiming({ stage: name, durationMs: Math.max(0, Math.round(now() - start)), status }); }
}

// Called only by CLI entry points. Resolve upload-key conflicts before any mutation.
export async function loadRuntimeEnvironment({ env = process.env, envFile = '.env' } = {}) {
  const [{ default: dotenv }, { readFile }, { resolveUploadKey }] = await Promise.all([
    import('dotenv'), import('node:fs/promises'), import('./uploadAuth.js'),
  ]);
  let file = {};
  try { file = dotenv.parse(await readFile(envFile)); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Could not read runtime environment configuration.');
  }
  const key = resolveUploadKey({ runtime: env, file });
  dotenv.populate(env, file, { override: false });
  if (key) env.NORTH_STAR_UPLOAD_KEY = key;
}
