// Same-origin manual request UI for desktop and iPhone Safari. No upload key.
export function scannerClient() {
  const el=id=>document.getElementById(id);
  let rows=[],queue='research',requesting=false;
  const field=(parent,label,value)=>{const p=document.createElement('p');p.textContent=`${label}: ${value}`;parent.append(p);};
  function listingUrl(value){try{const u=new URL(value);return u.protocol==='https:' && /^(?:www\.|m\.)?facebook\.com$/i.test(u.hostname) && /^\/groups\/[^/]+\/(?:posts|permalink)\/\d+\/?$/.test(u.pathname)?u.href:null;}catch{return null;}}
  function imageUrl(value){if(typeof value!=='string')return null;if(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value))return value;try{const u=new URL(value);return u.protocol==='https:' && /(?:^|\.)fbcdn\.net$/i.test(u.hostname)?u.href:null;}catch{return null;}}
  const money=value=>typeof value==='number'&&Number.isFinite(value)?`$${value.toLocaleString('en-US')}`:'Not extracted';
  function render(){
    const selected=rows.filter(r=>(r.queue??'research')===queue)
      .sort((a,b)=>Number(Boolean(b.preliminaryScreening?.target))-Number(Boolean(a.preliminaryScreening?.target)));
    el('list').replaceChildren();el('status').textContent=`${selected.length} ${queue==='research'?'sale listings for research':'verified opportunities'}`;
    for(const row of selected){
      const card=document.createElement('article');card.className='card';
      const title=document.createElement('h2');title.textContent=[row.brand,row.model,row.reference].filter(Boolean).join(' ')||row.title;card.append(title);
      field(card,'Asking price',money(row.price));field(card,'Group',row.groupName??row.groupId??'Not recorded');
      const preliminary=row.preliminaryScreening;
      if(preliminary){
        field(card,'Preliminary target screening',preliminary.signal.replaceAll('_',' '));
        if(preliminary.maximumAllIn!==null)field(card,'Preliminary all-in ceiling (not market value)',money(preliminary.maximumAllIn));
        if(preliminary.budgetRemainingBeforeCosts!==null)field(card,'Budget remaining before unknown costs (not profit)',money(preliminary.budgetRemainingBeforeCosts));
        field(card,'Screening basis',preliminary.note);
      }
      if(row.manualCompResearch){
        for(const name of ['market','wholesale','retail']){
          const bucket=row.manualCompResearch[name];
          field(card,`${name} estimate from reviewed sold comps`,bucket.value===null?`Insufficient data (${bucket.verifiedSoldCount} reviewed sales)`:money(bucket.value));
          for(const comp of bucket.comps){
            const link=document.createElement('a');
            try{const u=new URL(comp.url);if(u.protocol!=='https:'||u.username||u.password)continue;link.href=u.href;}catch{continue;}
            link.target='_blank';link.rel='noopener noreferrer';link.textContent=`${comp.source}: ${money(comp.amount)} sold ${new Date(comp.eventAt).toLocaleDateString()}`;card.append(link);
          }
        }
      }
      if(queue==='research'){
        field(card,'Financial assessment','Not scored — acquisition costs and resale exit need verification');
        if(row.estimatedMarketValue!=null)field(card,'Unverified static reference estimate',money(row.estimatedMarketValue));
      }else{field(card,'Verified market value',money(row.marketValue));field(card,'Score',`${row.score}/100`);}
      if(row.capturedAt)field(card,'Captured',new Date(row.capturedAt).toLocaleString());
      if(row.reasons?.length)field(card,'Review notes',row.reasons.join('; '));
      const src=imageUrl(row.image);if(src){const image=document.createElement('img');image.src=src;image.alt='Photo associated with this watch';image.loading='lazy';card.append(image);}
      const href=listingUrl(row.url);if(href){const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open original Facebook post';card.append(link);}
      el('list').append(card);
    }
  }
  async function load(){
    try{const r=await fetch('/api/opportunities',{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw Error();const data=await r.json();if(!Array.isArray(data))throw Error();rows=data;render();}
    catch{el('status').textContent='Could not reload results. Existing results have been retained.';}
  }
  async function requestScan(){
    if(requesting)return;requesting=true;el('scan').disabled=true;
    el('requestStatus').textContent='Sending one scan request…';
    try{
      const r=await fetch('/api/scan-request',{method:'POST',headers:{Accept:'application/json'}});
      const data=await r.json();if(!r.ok||data.ok!==true||!Number.isFinite(Date.parse(data.requestedAt)))throw Error();
      el('requestStatus').textContent=`Request accepted at ${new Date(data.requestedAt).toLocaleTimeString()}. This is not completion confirmation. Allow the AWS scan to finish, then reload results.`;
      setTimeout(()=>{requesting=false;el('scan').disabled=false;},30000);
    }catch{el('requestStatus').textContent='Request outcome is uncertain. No retry was sent. Check AWS before requesting again.';}
  }
  el('scan').addEventListener('click',requestScan);
  el('reload').addEventListener('click',load);
  for(const name of ['research','opportunities'])el(name).addEventListener('click',()=>{queue=name;render();});
  load();
}
export function scannerPage(){return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>North Star Scanner</title><style>body{font:16px system-ui;margin:0;background:#f4f6f8;color:#172536}main{max-width:780px;margin:auto;padding:20px}button{font:inherit;padding:12px 16px;margin:4px;border-radius:8px;cursor:pointer}button:disabled{opacity:.5}.card{background:white;border-radius:12px;padding:18px;margin:16px 0;overflow-wrap:anywhere}h2{font-size:20px}img{max-width:100%;max-height:360px;object-fit:contain}#requestStatus{line-height:1.5}</style></head><body><main><h1>North Star Scanner</h1><button id="scan">Request Facebook scan</button><button id="reload">Reload results</button><p id="requestStatus">Request scan starts collection. Reload results only reads published data.</p><nav><button id="research">Research queue</button><button id="opportunities">Verified opportunities</button></nav><p id="status">Loading sale listings…</p><section id="list"></section></main><script>(${scannerClient.toString()})();</script></body></html>`;}
