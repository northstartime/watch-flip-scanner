import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
export async function offlineInventoryServer(t) {
  const root=path.resolve('tests');
  const directory=fs.mkdtempSync(path.join(root,'.inventory-route-'));
  const before=process.env.NORTH_STAR_DATA_DIR;
  process.env.NORTH_STAR_DATA_DIR=directory;
  let imported;
  try {imported=await import(`../../src/server.js?offline-inventory=${path.basename(directory)}`);}
  finally {if(before===undefined)delete process.env.NORTH_STAR_DATA_DIR;else process.env.NORTH_STAR_DATA_DIR=before;}
  assert.equal(imported.server,null);
  const routes=(imported.app._router||imported.app.router).stack.filter(layer=>layer.route).map(layer=>layer.route);
  t.after(()=>{assert.equal(path.dirname(directory),root);assert.ok(path.basename(directory).startsWith('.inventory-route-'));fs.rmSync(directory,{recursive:true});});
  async function fetchImpl(url,options={}) {
    const headers=new Headers(options.headers);
    const pathname=new URL(url).pathname;
    const route=routes.find(candidate=>candidate.path===pathname&&candidate.methods[(options.method||'GET').toLowerCase()]);
    if(!route)return {ok:false,status:404,headers:new Headers(),json:async()=>({error:'Not found'})};
    let status=200,body;
    const responseHeaders=new Headers();
    const req={body:options.body?JSON.parse(options.body):undefined,get:name=>headers.get(name)??undefined};
    const res={status(code){status=code;return this;},set(name,value){responseHeaders.set(name,value);return this;},json(value){body=JSON.parse(JSON.stringify(value));return this;}};
    let index=0;
    const next=()=>{const layer=route.stack[index++];if(layer)return layer.handle(req,res,next);};
    await next();
    return {ok:status>=200&&status<300,status,headers:responseHeaders,json:async()=>structuredClone(body)};
  }
  async function parsedRequest(body, headers = {}) {
    return new Promise((resolve, reject) => {
      const socket = new Duplex({read(){},write(chunk, encoding, callback){callback();}});
      const req = new IncomingMessage(socket);
      req.method = 'POST'; req.url = '/api/opportunities';
      req.headers = {'content-type':'application/json','content-length':String(Buffer.byteLength(body)),...headers};
      const res = new ServerResponse(req);
      res.end = function(chunk) {
        try { resolve({status:res.statusCode,body:JSON.parse(chunk.toString())}); }
        catch(error){reject(error);}
        finally {socket.destroy();}
        return res;
      };
      imported.app.handle(req,res,error=>reject(error||new Error('No route')));
      req.push(Buffer.from(body)); req.push(null);
    });
  }
  return {fetchImpl,parsedRequest,file:path.join(directory,'opportunities.json')};
}
