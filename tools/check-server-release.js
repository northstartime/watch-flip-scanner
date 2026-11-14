// Offline only: no server import, network, credential loading, or inventory reads.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('server-release.json'));
const allowed = new Set([...manifest.runtimeFiles, ...manifest.reviewFiles]);
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const fail = message => { throw new Error(message); };

try {
  if (manifest.entrypoint !== 'src/server.js' || pkg.scripts.start !== 'node src/server.js' || pkg.scripts.server !== 'node src/server.js') fail('Server entrypoint mismatch.');
  for (const name of new Set([...Object.keys(pkg.dependencies), ...Object.keys(lock.packages[''].dependencies)])) {
    if (pkg.dependencies[name] !== lock.packages[''].dependencies[name]) fail('Dependency manifest mismatch.');
  }
  for (const file of allowed) {
    if (!fs.statSync(path.join(root, file)).isFile()) fail('A release file is missing.');
    if (/\.(?:js|json)$/.test(file)) {
      const content = read(file);
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b/.test(content)) fail('Potential credential detected; inspect privately.');
      const synthetic = new Set(['scan-request-fixture', 'server-release-fixture']);
      for (const match of content.matchAll(/(?:UPLOAD_KEY|api[_-]?key|password|secret)\s*[:=]\s*['"]([^'"\s]{12,})['"]/gi)) {
        if (!(file.startsWith('tests/') && synthetic.has(match[1]))) fail('Potential embedded credential detected; inspect privately.');
      }
    }
  }
  // Every relative runtime import must be explicitly included in this release.
  for (const file of manifest.runtimeFiles.filter(file => file.endsWith('.js'))) {
    const imports = read(file).matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g);
    for (const [, specifier] of imports) {
      if (!specifier.startsWith('.')) continue;
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (!allowed.has(dependency)) fail('Runtime import missing from release allowlist.');
    }
  }
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const staged = git(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
  if (staged.some(file => !allowed.has(file))) fail('Staged files outside the server release allowlist; nothing changed.');
  console.log(`PASS: runtime files present, imports included, server entrypoints and dependency ranges agree; staged files: ${staged.length}.`);
  console.log('WARNING: tracked inventory is not protected by .gitignore. Stage explicit allowlisted paths only, then rerun this check before committing.');
  console.log('This check does not stage, commit, scan, upload, or verify live configuration.');
} catch {
  console.error('FAIL: server release check failed. Review entrypoints, manifests, file presence, credential patterns, and staged allowlist privately.');
  process.exitCode = 1;
}
