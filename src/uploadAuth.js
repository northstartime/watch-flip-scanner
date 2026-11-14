import { createHash, timingSafeEqual } from 'node:crypto';

export function normalizeUploadKey(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return key && !/[\r\n]/.test(key) ? key : null;
}

export function createUploadAuthorization({ getConfiguredKey = () => process.env.NORTH_STAR_UPLOAD_KEY } = {}) {
  return (req, res, next) => {
    const configured = normalizeUploadKey(getConfiguredKey());
    if (!configured) return res.status(503).json({ error: 'Cloud uploads are not configured.' });
    const authorization = req.get('authorization');
    // A malformed Authorization header must not fall back to another credential.
    const supplied = authorization != null
      ? normalizeUploadKey(String(authorization).match(/^Bearer[ \t]+(.+)$/i)?.[1])
      : normalizeUploadKey(req.get('x-api-key'));
    const digest = key => createHash('sha256').update(key).digest();
    if (!supplied || !timingSafeEqual(digest(supplied), digest(configured))) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    next();
  };
}

// Resolve provenance before mutating the runtime environment. Never log values.
export function resolveUploadKey({ runtime = {}, file = {} } = {}) {
  const source = runtime.NORTH_STAR_UPLOAD_KEY_SOURCE ?? file.NORTH_STAR_UPLOAD_KEY_SOURCE;
  if (source != null && !['process', 'dotenv'].includes(source)) {
    throw new Error('NORTH_STAR_UPLOAD_KEY_SOURCE must be process or dotenv.');
  }
  const read = value => {
    if (value == null || value === '') return null;
    const key = normalizeUploadKey(value);
    if (!key) throw new Error('Upload key configuration is malformed.');
    return key;
  };
  const processKey = read(runtime.NORTH_STAR_UPLOAD_KEY);
  const fileKey = read(file.NORTH_STAR_UPLOAD_KEY);
  if (source) {
    const selected = source === 'process' ? processKey : fileKey;
    if (!selected) throw new Error('The selected upload key source is not configured.');
    return selected;
  }
  if (processKey && fileKey && processKey !== fileKey) {
    throw new Error('Upload key sources conflict. Verify the intended existing source, then explicitly select process or dotenv with NORTH_STAR_UPLOAD_KEY_SOURCE. No credential was selected.');
  }
  return processKey || fileKey;
}
