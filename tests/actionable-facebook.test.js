import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {setImmediate as tick} from 'node:timers/promises';
import {classifySale,splitSalePost,eligibleSaleRecord} from '../src/saleListing.js';
import {parseAskingPrice,deduplicateListings,toMobileOpportunity} from '../src/listingIntegrity.js';
import {getModaListings} from '../src/markets/moda.js';
import {evaluateWatch} from '../src/businessScore.js';
import {readOwnedFacebookPost} from '../src/collectors/facebookPostOwnership.js';
import {scannerClient,scannerPage} from '../src/scannerPage.js';
import {diagnoseCapturedText} from '../tools/inspect-captured-prices.js';
import {main} from '../src/daily.js';
import {element,message,permalink,post} from './helpers/syntheticDom.js';
globalThis.fetch=()=>{throw Error('Network forbidden in repair tests');};
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/captured-five-sales.json',import.meta.url),'utf8'));
async function collected(){return getModaListings(async group=>rows.filter(r=>new URL(r.url).pathname.split('/')[2].toLowerCase()===group.toLowerCase()),{log(){}});}

test('actual five posts become eight individual sale records; social post is excluded',async()=>{
 const watches=await collected();assert.equal(watches.length,8);assert.ok(watches.every(w=>w.saleStatus==='sale'));
 assert.ok(!watches.some(w=>w.parentPostId==='2119495975383925'));
 assert.deepEqual(watches.map(w=>w.reference),['126000','418.CX.1114.RX.MXM20','116618LB','126500LN','126710GRNR','116500LN','126610LN','126610LV']);
 assert.ok(watches.every(w=>eligibleSaleRecord(w)));
 assert.equal(deduplicateListings([...watches,...watches]).length,8);
});
test('actual Hublot ask is18000; other missing saved prices remain unresolved',async()=>{
 const watches=await collected();const h=watches.find(w=>w.brand==='Hublot');
 assert.equal(h.buyPrice,18000);assert.equal(h.reference,'418.CX.1114.RX.MXM20');assert.equal(h.model,'Big Bang Unico Sang Bleu II');
 assert.ok(watches.filter(w=>w!==h).every(w=>w.buyPrice===null));
 for(const w of watches){assert.equal(evaluateWatch(w).score,0);assert.equal(evaluateWatch(w).profit,null);}
});
test('captured Rolex references supply identity without fabricating valuations',async()=>{
 const watches=await collected();assert.equal(watches[0].brand,'Rolex');assert.equal(watches[0].model,'Oyster Perpetual 36');
 assert.equal(watches.find(w=>w.reference==='116618LB').model,'Submariner');
 assert.equal(watches.find(w=>w.reference==='116500LN').model,'Daytona');
 const row=toMobileOpportunity({watch:watches[0],...evaluateWatch(watches[0])});
 assert.equal(row.marketValue,null);assert.equal(row.estimatedMarketValue,7800);assert.equal(row.queue,'research');assert.equal(row.valuationStatus,'unverified');
});
for(const text of ['Fresh reference check on myself; please vouch for me','WTB Rolex 126000 $7000','ISO Tudor BB58','Looking to buy Rolex 124270','Price check Rolex 126000','SOLD Rolex 126000 $8000'])test(`non-sale exclusion: ${text}`,()=>assert.equal(classifySale(text).kind,'non_sale'));
test('sale mentioning references is not rejected',()=>assert.equal(classifySale('Rolex 126000\nPrice $8000\nWire first, plenty of references').kind,'sale'));
test('multi-watch prices and photos are bound to each reference, never album order',()=>{
 const parent={id:'moda-123',url:'https://www.facebook.com/groups/Watchtrading/posts/123/',listingText:'116500LN Daytona\nPrice $25000\n126000 Oyster Perpetual\nPrice $7000',image:'wrong-album-photo',photos:[
  {postId:'123',alt:'126000 photo',src:'op-photo'}, {postId:'123',alt:'116500LN photo',src:'daytona-photo'},
  {postId:'999',alt:'116500LN photo',src:'foreign-photo'}]};
 const parts=splitSalePost(parent).listings;assert.equal(parts.length,2);
 assert.deepEqual(parts.map(p=>p.price),[25000,7000]);assert.deepEqual(parts.map(p=>p.image),['daytona-photo','op-photo']);
 const unresolved=splitSalePost({...parent,photos:[]}).listings;assert.ok(unresolved.every(p=>p.image===null));
 assert.ok(parts.every(p=>p.url===parent.url));
});
test('ambiguous multi-watch boundaries and foreign post identities never publish',()=>{
 assert.equal(splitSalePost({id:'moda-123',url:'https://www.facebook.com/groups/Watchtrading/posts/123/',listingText:'For sale Rolex116500LN and126000, price on request'}).listings.length,0);
 assert.equal(splitSalePost({...rows[0],id:'moda-999'}).reason,'post_identity_conflict');
 assert.equal(splitSalePost({...rows[0],id:rows[0].id+'9'}).reason,'post_identity_conflict');
});
for(const [text,expected] of [
 ['Market comps $24000\nPRICE $18000\n$24000 COMPS | $18000 BUY | $6000 BELOW MARKET',18000],
 ['MSRP $24000\nAsking $18000\nSave $6000',18000],
 ['Price:\n18000',18000],['Asking 𝟏𝟖𝟎𝟎𝟎 USD',18000],['Asking $18,000\nAsking $19,000',null],
 ['Price:\n18\n000',null],['Asking 8\u202f500',8500],
])test(`amount roles/normalization: ${text}`,()=>assert.equal(parseAskingPrice(text).amount,expected));
test('group attribution follows validated group permalink; cross-group collector results are rejected',async()=>{
 const watches=await collected();assert.ok(watches.every(w=>w.groupName==='Watch Trader Community' && w.groupId==='watchtradercommunity'));
 const wrong=await getModaListings(async()=>[rows[0]],{groups:['Watchtrading'],log(){}});assert.equal(wrong.length,0);
});
test('expansion clicks only the uniquely owned message, then the next snapshot contains digits',()=>{
 const m=message('Rolex126000 Price:');const button=element('button',{},'See more');m.children.push(button);button.parentElement=m;
 button.click=()=>{m.ownText='Rolex126000 Price: $8000';m.children=[];};
 const root=element('body',{},element('div',{role:'article'},permalink('123','Watchtrading'),m));
 const first=readOwnedFacebookPost(root,{groupId:'Watchtrading',postId:'123',expand:true});assert.equal(first.diagnostics.expansionAttempted,true);
 const after=readOwnedFacebookPost(root,{groupId:'Watchtrading',postId:'123'});assert.match(after.text,/8000/);
});
test('DOM-only digits are diagnosed but never silently promoted into an asking price',()=>{
 const m=message('Rolex126000\nPrice:');Object.defineProperty(m,'textContent',{get:()=> 'Rolex126000\nPrice: $8000'});
 const root=element('body',{},element('div',{role:'article'},permalink('123','Watchtrading'),m));
 const result=readOwnedFacebookPost(root,{groupId:'Watchtrading',postId:'123'});
 assert.equal(result.diagnostics.domHasAdditionalDigits,true);assert.equal(parseAskingPrice(result.text).amount,null);
});
test('targeted price diagnostic distinguishes expansion, DOM loss, and still-missing text',()=>{
 assert.equal(diagnoseCapturedText({text:'Price:',diagnostics:{textStatus:'truncated'}},{text:'Price: $8000',diagnostics:{textStatus:'complete'}}),'post_expansion_recovered_asking_price');
 assert.equal(diagnoseCapturedText({text:'Price:'},{text:'Price:',diagnostics:{textStatus:'complete',domHasAdditionalDigits:true}}),'rendered_text_omits_dom_digits_requires_owned_node_inspection');
 assert.equal(diagnoseCapturedText({text:'Price:'},{text:'Price:',diagnosticText:{domText:'Price: $8000'},diagnostics:{textStatus:'complete'}}),'dom_extraction_omitted_asking_price');
 assert.equal(diagnoseCapturedText({text:'Price:'},{text:'Price:',diagnostics:{textStatus:'complete'}}),'no_numeric_asking_price_in_expanded_rendered_text');
});
test('daily mock publishes only sale components; never pads the public feed with social posts',async()=>{
 const watches=await collected();const directory=fs.mkdtempSync(path.resolve('tests/.actionable-'));
 const log=console.log,error=console.error,exit=process.exitCode;let output;
 try{console.log=()=>{};console.error=()=>{};await main({collect:async()=>watches,embed:async r=>r,upload:async r=>{output=r;},config:{root:directory,env:{}}});
 assert.equal(output.length,8);assert.ok(output.every(r=>r.queue==='research'&&r.saleStatus==='sale'));}
 finally{console.log=log;console.error=error;process.exitCode=exit;fs.rmSync(directory,{recursive:true,force:true});}
});
function clientFixture(fail=false){
 const nodes=new Map(),calls=[];let timer;
 const node=()=>({disabled:false,children:[],handlers:{},append(n){this.children.push(n);},replaceChildren(){this.children=[];},addEventListener(name,fn){this.handlers[name]=fn;}});
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node};
 const fetch=async(url,options={})=>{calls.push({url,options});return {ok:!fail||options.method!=='POST',json:async()=>options.method==='POST'?{ok:!fail,requestedAt:new Date().toISOString()}:[]};};
 const context=vm.createContext({document,fetch,URL,Date,Number,setTimeout:fn=>{timer=fn;}});
 vm.runInContext(`(${scannerClient.toString()})()`,context);
 return {nodes,calls,get timer(){return timer}};
}
for(const device of ['PC browser','iPhone Safari'])test(`${device}: explicit manual button sends one POST; reload never scans`,async()=>{
 const c=clientFixture();await tick();assert.ok(c.calls.every(c=>c.options.method!=='POST'));
 await c.nodes.get('scan').handlers.click();await c.nodes.get('scan').handlers.click();
 assert.equal(c.calls.filter(c=>c.options.method==='POST').length,1);
 await c.nodes.get('reload').handlers.click();assert.equal(c.calls.filter(c=>c.options.method==='POST').length,1);
 assert.match(c.nodes.get('requestStatus').textContent,/not completion confirmation/);
});
test('uncertain manual POST never retries automatically or reenables duplicate requests',async()=>{
 const c=clientFixture(true);await tick();await c.nodes.get('scan').handlers.click();
 assert.equal(c.calls.filter(c=>c.options.method==='POST').length,1);assert.equal(c.nodes.get('scan').disabled,true);assert.equal(c.timer,undefined);
});
test('shared page exposes manual request and a distinct research queue without an upload secret',()=>{
 const page=scannerPage();assert.match(page,/Request Facebook scan/);assert.match(page,/Research queue/);assert.ok(!page.includes('NORTH_STAR_UPLOAD_KEY'));
});
