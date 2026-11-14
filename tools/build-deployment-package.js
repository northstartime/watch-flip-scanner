// Local-only explicit source bundle. Does not stage, contact hosts, or read runtime data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root,'deployment-release.json')));
const allowed = new Set(manifest.files);
export function validateReleasePath(file) {
  if (typeof file !== 'string' || file.includes('\\') || file.includes(':') || path.posix.normalize(file) !== file || file.startsWith('/') || file.split('/').includes('..') || /(?:^|\/)(?:\.env(?:\..*)?|credentials|node_modules|data|output|logs|browser-profile)(?:\/|$)|opportunities|scan-request\.json|last-scan-request|\.(?:pem|key)$/i.test(file)) throw Error('Unsafe release path');
}
export function validateContents(content) {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b/.test(content)) throw Error('Potential credential; review privately');
}
export function buildPackage() {
  const buffers = new Map();
  for (const file of manifest.files) {
    validateReleasePath(file);
    const absolute = path.join(root,file);
    if (!fs.lstatSync(absolute).isFile() || fs.lstatSync(absolute).isSymbolicLink()) throw Error('Nonregular release file');
    const bytes = fs.readFileSync(absolute); validateContents(bytes.toString('utf8')); buffers.set(file,bytes);
    if (file.endsWith('.js')) {
      for (const [,specifier] of bytes.toString().matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) {
        if (!specifier.startsWith('.')) continue;
        const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier));
        if (!allowed.has(dependency)) throw Error('Missing relative dependency');
      }
    }
  }
  const pkg = JSON.parse(buffers.get('package.json'));
  const lock = JSON.parse(buffers.get('package-lock.json'));
  if (JSON.stringify(pkg.dependencies) !== JSON.stringify(lock.packages[''].dependencies)) throw Error('Dependency mismatch');
  const parent = path.join(root,'deployment-packages'); fs.mkdirSync(parent,{recursive:true});
  const output = fs.mkdtempSync(path.join(parent,'scanner-'));
  const hashes = {};
  for (const [file,bytes] of buffers) {
    const destination = path.join(output,file); fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.writeFileSync(destination,bytes,{flag:'wx'});
    if (!fs.readFileSync(destination).equals(bytes)) throw Error('Copy verification failed');
    hashes[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  fs.writeFileSync(path.join(output,'SHA256SUMS.json'),JSON.stringify(hashes,null,2),{flag:'wx'});
  return output;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(buildPackage()); }
  catch { console.error('STOP: package validation failed; inspect allowlist and dependencies locally.'); process.exitCode=1; }
}
