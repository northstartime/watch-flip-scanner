import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInventoryStore } from '../src/inventoryStore.js';
import { testMarker } from './helpers/server-marker.js';
const root=path.resolve('tests');
const six=Array.from({length:6},(_,i)=>({id:`legacy-${i}`,source:i%2?'eBay':'Moda',title:'Legacy fixture',extra:{keep:true}}));
function fixture(t,rows=six){
  const dir=fs.mkdtempSync(path.join(root,'.inventory-api-'));
  const file=path.join(dir,'opportunities.json');
  fs.writeFileSync(file,JSON.stringify(rows,null,2));
  t.after(()=>{assert.equal(path.dirname(dir),root);assert.ok(path.basename(dir).startsWith('.inventory-api-'));fs.rmSync(dir,{recursive:true});});
  return {file,dir,store:createInventoryStore(file)};
}
test('commit preserves all six legacy rows, hidden eBay and missing fields; version survives restart',t=>{
  const f=fixture(t), before=f.store.snapshot();
  const result=f.store.commit([...before.rows,testMarker],before.version);
  const after=createInventoryStore(f.file).snapshot();
  assert.notEqual(result.version,before.version);
  assert.equal(after.version,result.version);
  assert.deepEqual(after.rows.slice(0,6),six);
  for(const row of after.rows.slice(0,6))assert.equal(Object.hasOwn(row,'projectedProfit'),false);
  assert.deepEqual(after.rows[6],testMarker);
});
test('missing, weak, wildcard, multiple and stale versions cannot modify storage',t=>{
  const f=fixture(t), bytes=fs.readFileSync(f.file), snapshot=f.store.snapshot();
  for(const version of [undefined,'*','W/'+snapshot.version,snapshot.version+','+snapshot.version,'invalid']){
    assert.throws(()=>f.store.commit([...six,testMarker],version),error=>[400,428].includes(error.status));
    assert.deepEqual(fs.readFileSync(f.file),bytes);
  }
  f.store.commit([...six,testMarker],snapshot.version);
  const after=fs.readFileSync(f.file);
  assert.throws(()=>f.store.commit([...six,{...testMarker,id:'second'}],snapshot.version),error=>error.status===412);
  assert.deepEqual(fs.readFileSync(f.file),after);
});
test('server rejects removal, rewriting and reordering of any stored legacy row',t=>{
  const f=fixture(t), version=f.store.snapshot().version, before=fs.readFileSync(f.file);
  const changed=structuredClone(six);changed[0].extra.keep=false;
  for(const rows of [six.slice(0,5),[...six].reverse(),changed]){
    assert.throws(()=>f.store.commit(rows,version),error=>error.code==='INVENTORY_PRESERVATION_REQUIRED');
    assert.deepEqual(fs.readFileSync(f.file),before);
  }
});
test('new fields remain mandatory and numeric strings are rejected server-side',t=>{
  const f=fixture(t),version=f.store.snapshot().version;
  for(const field of ['id','title','price','marketValue','projectedProfit','score','decision','source','url','image']){
    const row={...testMarker};delete row[field];
    assert.throws(()=>f.store.commit([...six,row],version),error=>error.code==='FEED_ROW_INVALID');
  }
  assert.throws(()=>f.store.commit([...six,{...testMarker,price:'1000'}],version),error=>error.code==='FEED_ROW_INVALID');
  assert.deepEqual(f.store.snapshot().rows,six);
});
test('duplicates in new or legacy rows, including numeric/string equivalents, abort unchanged',t=>{
  const f=fixture(t), version=f.store.snapshot().version;
  for(const rows of [[...six,testMarker,testMarker],[...six,{...testMarker,id:six[0].id}],[...six,{...testMarker,id:123},{...testMarker,id:'123'}]]){
    assert.throws(()=>f.store.commit(rows,version),error=>error.code==='FEED_DUPLICATE_ID');
  }
  const duplicate=structuredClone(six);duplicate[5].id=duplicate[0].id;
  fs.writeFileSync(f.file,JSON.stringify(duplicate));
  assert.throws(()=>f.store.commit([...duplicate,testMarker],f.store.snapshot().version),error=>error.code==='FEED_DUPLICATE_ID');
  assert.deepEqual(f.store.snapshot().rows,duplicate);
});
test('occupied lock fails closed and is never automatically removed',t=>{
  const f=fixture(t),version=f.store.snapshot().version;
  fs.writeFileSync(f.file+'.lock','');
  assert.throws(()=>f.store.commit([...six,testMarker],version),error=>error.code==='INVENTORY_BUSY');
  assert.equal(fs.existsSync(f.file+'.lock'),true);
  assert.deepEqual(f.store.snapshot().rows,six);
});
test('failed rename leaves original inventory intact and cleans owned temporary file/lock',t=>{
  const f=fixture(t),before=fs.readFileSync(f.file);
  const io={...fs,renameSync(){throw new Error('synthetic rename failure');}};
  const store=createInventoryStore(f.file,{fsImpl:io});
  assert.throws(()=>store.commit([...six,testMarker],store.snapshot().version));
  assert.deepEqual(fs.readFileSync(f.file),before);
  assert.deepEqual(fs.readdirSync(f.dir),['opportunities.json']);
});
test('two processes sharing a baseline cannot lose each other\'s changes',async t=>{
  const f=fixture(t),version=f.store.snapshot().version;
  const moduleUrl=new URL('../src/inventoryStore.js',import.meta.url).href;
  const code=`import {createInventoryStore} from ${JSON.stringify(moduleUrl)}; const store=createInventoryStore(process.argv[1]); console.log('READY'); process.stdin.once('data',()=>{try{const current=store.snapshot(); const row=JSON.parse(process.argv[4]); store.commit([...current.rows,row],process.argv[2]); console.log(JSON.stringify({ok:true}));}catch(e){console.log(JSON.stringify({ok:false,status:e.status}));} process.stdin.destroy();});`;
  const workers=['writer-a','writer-b'].map(id=>{
    const child=spawn(process.execPath,['--input-type=module','-e',code,f.file,version,id,JSON.stringify({...testMarker,id})],{stdio:['pipe','pipe','pipe']});
    let output='';let readyResolve;
    const ready=new Promise(resolve=>{readyResolve=resolve;});
    child.stdout.on('data',chunk=>{output+=chunk; if(output.includes('READY\n'))readyResolve();});
    let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',status=>{try{assert.equal(status,0);assert.equal(stderr,'');resolve(JSON.parse(output.trim().split('\n').at(-1)));}catch(e){reject(e);}});});
    return {child,ready,done};
  });
  t.after(()=>{for(const worker of workers)worker.child.kill();});
  await Promise.all(workers.map(w=>w.ready));
  for(const worker of workers)worker.child.stdin.end('go');
  const result=await Promise.all(workers.map(w=>w.done));
  assert.equal(result.filter(x=>x.ok).length,1);
  assert.ok([409,412].includes(result.find(x=>!x.ok).status));
  const final=f.store.snapshot().rows;
  assert.equal(final.length,7);
  assert.deepEqual(final.slice(0,6),six);
});

test('oversized count/body and invalid stored shape never partially write',t=>{
  const f=fixture(t),version=f.store.snapshot().version,before=fs.readFileSync(f.file);
  const tooMany=Array.from({length:5001},(_,i)=>({...testMarker,id:`fixture-${i}`}));
  assert.throws(()=>f.store.commit(tooMany,version),e=>e.status===413);
  const large={...testMarker,image:'x'.repeat(25*1024*1024)};
  assert.throws(()=>f.store.commit([...six,large],version),e=>e.status===413);
  assert.deepEqual(fs.readFileSync(f.file),before);
  fs.writeFileSync(f.file,'{}');
  assert.throws(()=>f.store.snapshot(),e=>e.code==='STORED_INVENTORY_INVALID');
  assert.equal(fs.readFileSync(f.file,'utf8'),'{}');
});
