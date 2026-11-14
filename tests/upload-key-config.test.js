import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveUploadKey } from '../src/uploadAuth.js';
import { loadRuntimeEnvironment } from '../src/runtimeUtils.js';

const runtime = { NORTH_STAR_UPLOAD_KEY: ' synthetic-runtime ' };
const file = { NORTH_STAR_UPLOAD_KEY: 'synthetic-file' };

test('conflicting sources fail closed without selecting, mutating, or disclosing either key', () => {
  const input = { runtime: { ...runtime }, file: { ...file } };
  assert.throws(() => resolveUploadKey(input), error => /sources conflict/.test(error.message)
    && !error.message.includes('synthetic-runtime') && !error.message.includes('synthetic-file'));
  assert.deepEqual(input, { runtime, file });
});

test('explicit source selects an existing key without claiming cloud validity', () => {
  assert.equal(resolveUploadKey({ runtime: { ...runtime, NORTH_STAR_UPLOAD_KEY_SOURCE: 'process' }, file }), 'synthetic-runtime');
  assert.equal(resolveUploadKey({ runtime: { ...runtime, NORTH_STAR_UPLOAD_KEY_SOURCE: 'dotenv' }, file }), 'synthetic-file');
  assert.equal(resolveUploadKey({ runtime, file: { ...file, NORTH_STAR_UPLOAD_KEY_SOURCE: 'dotenv' } }), 'synthetic-file');
});

test('single or matching normalized key sources remain compatible', () => {
  assert.equal(resolveUploadKey({ runtime }), 'synthetic-runtime');
  assert.equal(resolveUploadKey({ file }), 'synthetic-file');
  assert.equal(resolveUploadKey({ runtime, file: { NORTH_STAR_UPLOAD_KEY: 'synthetic-runtime\r\n' } }), 'synthetic-runtime');
  assert.equal(resolveUploadKey(), null);
});

test('explicit missing source never silently falls back', () => {
  assert.throws(() => resolveUploadKey({ runtime: { NORTH_STAR_UPLOAD_KEY_SOURCE: 'dotenv', ...runtime } }), /not configured/);
  assert.throws(() => resolveUploadKey({ runtime: { NORTH_STAR_UPLOAD_KEY_SOURCE: 'process' }, file }), /not configured/);
  assert.throws(() => resolveUploadKey({ runtime: { NORTH_STAR_UPLOAD_KEY_SOURCE: 'synthetic-invalid' }, file }), error => /must be process or dotenv/.test(error.message) && !error.message.includes('synthetic-invalid'));
});

test('malformed credentials are rejected without values in diagnostics', () => {
  for (const key of ['   ', 'synthetic\r\ninvalid']) {
    assert.throws(() => resolveUploadKey({ runtime: { NORTH_STAR_UPLOAD_KEY: key }, file }), /configuration is malformed/);
  }
});

test('CLI loader validates before mutation, honors selected source, and preserves unrelated precedence', async () => {
  const testsRoot = path.resolve('tests');
  const directory = fs.mkdtempSync(path.join(testsRoot, '.auth-config-test-'));
  const envFile = path.join(directory, 'synthetic.env');
  try {
    fs.writeFileSync(envFile, 'NORTH_STAR_UPLOAD_KEY=synthetic-file\nSYNTHETIC_SETTING=file\n');
    const env = { ...runtime, SYNTHETIC_SETTING: 'runtime' };
    await assert.rejects(loadRuntimeEnvironment({ env, envFile }), /sources conflict/);
    assert.deepEqual(env, { ...runtime, SYNTHETIC_SETTING: 'runtime' });
    env.NORTH_STAR_UPLOAD_KEY_SOURCE = 'dotenv';
    await loadRuntimeEnvironment({ env, envFile });
    assert.equal(env.NORTH_STAR_UPLOAD_KEY, 'synthetic-file');
    assert.equal(env.SYNTHETIC_SETTING, 'runtime');
    const fileOnly = {};
    await loadRuntimeEnvironment({ env: fileOnly, envFile });
    assert.equal(fileOnly.NORTH_STAR_UPLOAD_KEY, 'synthetic-file');
    assert.equal(fileOnly.SYNTHETIC_SETTING, 'file');
    const noFile = { ...runtime };
    await loadRuntimeEnvironment({ env: noFile, envFile: path.join(directory, 'missing.env') });
    assert.equal(noFile.NORTH_STAR_UPLOAD_KEY, 'synthetic-runtime');
  } finally {
    // Delete only these two explicit, workspace-scoped fixture paths.
    assert.equal(path.dirname(directory), testsRoot);
    fs.unlinkSync(envFile);
    fs.rmdirSync(directory);
  }
});

test('automation preflight uses common resolver before browser access and removes User-scope fallback', () => {
  const source = fs.readFileSync(new URL('../automation/run-scanner.ps1', import.meta.url), 'utf8');
  assert.ok(source.indexOf('& node tools/check-upload-config.js') < source.indexOf('$chromeReady = $false'));
  assert.match(source, /if \(\$LASTEXITCODE -ne 0\)/);
  assert.doesNotMatch(source, /GetEnvironmentVariable/);
  const preflight = fs.readFileSync(new URL('../tools/check-upload-config.js', import.meta.url), 'utf8');
  assert.match(preflight, /await loadRuntimeEnvironment\(\)/);
  assert.doesNotMatch(preflight, /uploadOpportunities|fetch\(/);
});
