import { mapLimit, withTimeout } from './runtimeUtils.js';

export async function embedModaImages(watches, { fetchImpl = globalThis.fetch, timeoutMs = 8000, maxBytes = 2 * 1024 * 1024, concurrency = 2, batchTimeoutMs = 30000, log = message => console.log(message) } = {}) {
  const cache = new Map();
  const controllers = new Set();
  let batchExpired = false;
  const download = async image => {
    if (batchExpired) return null;
    let url;
    try {
      url = new URL(image);
      if (url.protocol !== 'https:' || url.username || url.password || !(url.hostname === 'fbcdn.net' || url.hostname.endsWith('.fbcdn.net'))) return null;
    } catch { return null; }
    const controller = new AbortController();
    controllers.add(controller);
    let reader;
    try {
      return await withTimeout(async () => {
        const response = await fetchImpl(url.href, { signal: controller.signal, redirect: 'error' });
        const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (!response.ok || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) throw new Error('Invalid image response');
        const length = Number(response.headers.get('content-length'));
        if (length > maxBytes) throw new Error('Image exceeds size limit');
        reader = response.body?.getReader();
        if (!reader) throw new Error('Image response is not streamable');
        const chunks = [];
        let bytes = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) throw new Error('Image exceeds size limit');
          chunks.push(Buffer.from(value));
        }
        return `data:${type};base64,${Buffer.concat(chunks).toString('base64')}`;
      }, timeoutMs, { onTimeout: () => controller.abort(), label: 'Listing image download' });
    } catch {
      log('Listing image could not be embedded within its size/time limits.');
      return null;
    } finally {
      controller.abort();
      controllers.delete(controller);
      reader?.cancel().catch(() => {});
    }
  };
  try { return await withTimeout(() => mapLimit(watches, concurrency, async watch => {
    if (batchExpired) return watch;
    if (watch.source !== 'Moda' || !watch.image || watch.image.startsWith('data:')) return watch;
    if (!cache.has(watch.image)) cache.set(watch.image, download(watch.image));
    const image = await cache.get(watch.image);
    return image ? { ...watch, image } : watch;
  }), batchTimeoutMs, { label: 'Image embedding batch', onTimeout: () => {
    batchExpired = true;
    for (const controller of controllers) controller.abort();
  } });
  } catch (error) {
    if (error.code !== 'TIMEOUT') throw error;
    log('Image embedding batch timed out; retaining original images.');
    return watches;
  }
}
