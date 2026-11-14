import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudEndpoint } from './cloudSync.js';
import { normalizeUploadKey } from './uploadAuth.js';

export function validateScannerConfiguration({ env = process.env, root } = {}) {
  scannerOutputDirectory({env, ...(root ? {root} : {})});
  if (!cloudEndpoint(env.NORTH_STAR_CLOUD_URL)) throw new Error('Cloud upload URL is not configured.');
  if (!normalizeUploadKey(env.NORTH_STAR_UPLOAD_KEY)) throw new Error('Upload key is not configured.');
}

// Fixed, separate scanner output; never use server inventory as a scan snapshot.
export function scannerOutputDirectory({ env = process.env, root = fileURLToPath(new URL('../', import.meta.url)) } = {}) {
  if (env.NORTH_STAR_DATA_DIR?.trim()) throw new Error('Scanner must not inherit a server data directory.');
  const output = path.join(root, 'automation', 'output');
  // Reject redirected ancestors before collection. Missing output is created only by a scan.
  for (const target of [root, path.join(root, 'automation'), output]) {
    try {
      if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Scanner output must not be redirected.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return output;
}
