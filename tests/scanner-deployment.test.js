import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scannerOutputDirectory } from '../src/scannerConfig.js';
import { main } from '../src/daily.js';
import { uploadOpportunities } from '../src/cloudSync.js';
import { offlineInventoryServer } from './helpers/offline-inventory-server.js';
import { validateReleasePath } from '../tools/build-deployment-package.js';

globalThis.fetch = () => { throw Error('Network forbidden'); };
function fixture(t) {
  const root = fs.mkdtempSync(path.resolve('tests/.scanner-deployment-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  return root;
}
test('scanner refuses inherited server storage before collection and rejects redirected output', async t => {
  const root = fixture(t);
  await assert.rejects(main({config:{root, env:{NORTH_STAR_DATA_DIR:'/var/data'}}, collect:()=>assert.fail('No collection')}), /server data directory/);
  fs.mkdirSync(path.join(root,'automation'));
  const target = path.join(root,'elsewhere'); fs.mkdirSync(target);
  fs.symlinkSync(target,path.join(root,'automation/output'),'junction');
  assert.throws(()=>scannerOutputDirectory({root,env:{}}), /redirected/);
});
test('daily synthetic collection publishes Facebook while preserving six legacy records and request bytes', async t => {
  const root = fixture(t), server = await offlineInventoryServer(t);
  const legacy = Array.from({length:6},(_,i)=>({id:`legacy-${i}`,source:'eBay',capturedAt:'2026-11-10T22:00:49.498Z',url:`https://synthetic.invalid/${i}`}));
  fs.writeFileSync(server.file,JSON.stringify(legacy));
  fs.mkdirSync(path.join(root,'src/data'),{recursive:true});
  const inventory = path.join(root,'src/data/opportunities.json');
  const request = path.join(root,'src/data/scan-request.json');
  fs.writeFileSync(inventory,JSON.stringify(legacy));
  fs.writeFileSync(request,JSON.stringify({requestedAt:'2026-11-10T22:00:49.498Z'}));
  const before = [inventory,request].map(p=>fs.readFileSync(p));
  const priorKey = process.env.NORTH_STAR_UPLOAD_KEY;
  process.env.NORTH_STAR_UPLOAD_KEY = 'synthetic-deployment';
  t.after(()=>{ if(priorKey === undefined) delete process.env.NORTH_STAR_UPLOAD_KEY; else process.env.NORTH_STAR_UPLOAD_KEY = priorKey; });
  await main({config:{root,env:{}},collect:async()=>[{id:'facebook-fixture',source:'Moda',title:'Rolex 124270 for sale, price on request',url:'https://www.facebook.com/groups/Watchtrading/posts/123/',price:null}],embed:async rows=>rows,
    upload:rows=>uploadOpportunities(rows,{env:{NORTH_STAR_CLOUD_URL:'https://synthetic.invalid',NORTH_STAR_UPLOAD_KEY:'synthetic-deployment'},fetchImpl:server.fetchImpl,log(){}})});
  assert.deepEqual(JSON.parse(fs.readFileSync(server.file)).slice(0,6),legacy);
  assert.equal(JSON.parse(fs.readFileSync(server.file)).length,7);
  [inventory,request].forEach((p,i)=>assert.deepEqual(fs.readFileSync(p),before[i]));
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'automation/output/opportunities.json')))[0].source,'Moda');
});
test('legacy V1 executable refuses before collectors, dotenv, or network', () => {
  const result = spawnSync(process.execPath,['src/v1.js'],{encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH},timeout:10000});
  assert.equal(result.status,1);
  assert.match(result.stderr,/Legacy V1 is disabled/);
  assert.doesNotMatch(result.stdout,/starting|found/);
});
test('child uses inherited synthetic process key and resolves dotenv from its working directory without leaking values', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root,'.env'),'NORTH_STAR_UPLOAD_KEY=synthetic-file\n');
  const moduleURL = new URL('../src/runtimeUtils.js',import.meta.url).href;
  const code = `import {loadRuntimeEnvironment} from ${JSON.stringify(moduleURL)}; try {await loadRuntimeEnvironment(); console.log(process.env.NORTH_STAR_UPLOAD_KEY === 'synthetic-process' ? 'PROCESS_OK' : 'OTHER');} catch {console.log('CONFLICT');process.exitCode=1;}`;
  const env = {SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,NORTH_STAR_UPLOAD_KEY:'synthetic-process'};
  const run = e=>spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:root,env:e,encoding:'utf8',timeout:10000});
  const conflict = run(env); assert.equal(conflict.status,1); assert.equal(conflict.stdout.trim(),'CONFLICT');
  const selected = run({...env,NORTH_STAR_UPLOAD_KEY_SOURCE:'process'});
  assert.equal(selected.status,0);assert.equal(selected.stdout.trim(),'PROCESS_OK');assert.equal(selected.stderr,'');
});
test('release bundle refuses inventory, request state, credentials, traversal, and output paths', () => {
  for (const file of ['.env','.env.production','src/data/opportunities.json','scan-request.json','automation/last-scan-request.txt','../secret','/secret','automation/output/report.txt','private.key'])
    assert.throws(()=>validateReleasePath(file));
  assert.doesNotThrow(()=>validateReleasePath('automation/run-scanner.ps1'));
});
test('direct daily CLI fails configuration before collection for missing key, unsafe URL, or server storage', t => {
  const root = fixture(t);
  const base = {SystemRoot:process.env.SystemRoot,PATH:process.env.PATH};
  for (const settings of [
    {NORTH_STAR_CLOUD_URL:'https://synthetic.invalid'},
    {NORTH_STAR_UPLOAD_KEY:'synthetic-key',NORTH_STAR_CLOUD_URL:'http://synthetic.invalid'},
    {NORTH_STAR_UPLOAD_KEY:'synthetic-key',NORTH_STAR_CLOUD_URL:'https://synthetic.invalid',NORTH_STAR_DATA_DIR:'/var/data'}
  ]) {
    const result = spawnSync(process.execPath,[fileURLToPath(new URL('../src/daily.js',import.meta.url))],{cwd:root,env:{...base,...settings},encoding:'utf8',timeout:10000});
    assert.equal(result.status,1); assert.equal(result.stdout,'');
    assert.equal(result.stderr.trim(),'Scanner configuration failed. No scan was started.');
  }
});
test('actual PowerShell runner derives root and passes inherited environment to daily, with all live operations mocked', t => {
  const root = path.join(fixture(t),'repository with spaces');
  fs.mkdirSync(path.join(root,'automation'),{recursive:true});
  fs.copyFileSync(new URL('../automation/run-scanner.ps1',import.meta.url),path.join(root,'automation/run-scanner.ps1'));
  const harness = path.join(root,'verify.ps1');
  fs.writeFileSync(harness, `
$ErrorActionPreference = 'Stop'
function node { $global:LASTEXITCODE = 0 }
function Start-Transcript {}
function Stop-Transcript {}
function Invoke-WebRequest { }
function Start-Process {
  param($FilePath,$ArgumentList,$WorkingDirectory,[switch]$PassThru,[switch]$NoNewWindow)
  if ($ArgumentList -ne 'src/daily.js') { throw 'WRONG_ENTRYPOINT' }
  if ($WorkingDirectory -ne $PSScriptRoot) { throw 'WRONG_DIRECTORY' }
  if ($env:NORTH_STAR_UPLOAD_KEY -ne 'synthetic-inherited') { throw 'WRONG_INHERITANCE' }
  $result = [pscustomobject]@{ExitCode=0;Id=99999}
  $result | Add-Member ScriptMethod WaitForExit {param($timeout) return $true}
  $result | Add-Member ScriptMethod Refresh {}
  return $result
}
$tokens=$null; $errors=$null
[void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'automation/run-scanner.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'PARSE_FAILED' }
& (Join-Path $PSScriptRoot 'automation/run-scanner.ps1')
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Output 'RUNNER_VERIFIED'
`);
  const result = spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',harness],{
    encoding:'utf8',timeout:20000,env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,USERPROFILE:root,NORTH_STAR_UPLOAD_KEY:'synthetic-inherited'}});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/RUNNER_VERIFIED/);
  assert.doesNotMatch(result.stdout+result.stderr,/synthetic-inherited/);
});
