'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const express=require('express'),history=require('connect-history-api-fallback'),template=require('lodash/template');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const icon=fs.readFileSync(path.join(root,'public/logo.ico'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const render=base=>template(source)({BASE_URL:base,htmlWebpackPlugin:{options:{cdn:{css:[],js:[]}}}});
function favicon(html){const tag=/<link\b[^>]*\brel=["']icon["'][^>]*>/i.exec(html);assert.ok(tag,'Actual HTML needs an icon link');return /\bhref=["']([^"']+)["']/i.exec(tag[0])[1];}
let assets,server,origin,html;
test.before(async()=>{
 if(process.env.P07_STATIC_ROOT){assets=path.resolve(process.env.P07_STATIC_ROOT);html=fs.readFileSync(path.join(assets,'index.html'),'utf8');}
 else{const fixtures=path.join(root,'dist/p07-static-v3/fixtures');fs.mkdirSync(fixtures,{recursive:true});assets=fs.mkdtempSync(path.join(fixtures,'actual-template-'));html=render('/');fs.writeFileSync(path.join(assets,'index.html'),html);fs.copyFileSync(path.join(root,'public/logo.ico'),path.join(assets,'logo.ico'));}
 const app=express();app.use(express.static(assets));app.use(history({index:'/index.html'}));app.use(express.static(assets));app.use((_req,res)=>res.status(404).end());
 server=http.createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
});
test.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
function get(url,accept='*/*'){return new Promise((resolve,reject)=>{const req=http.get(url,{headers:{Accept:accept}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,type:res.headers['content-type']||'',body:Buffer.concat(chunks)}));});req.on('error',reject);req.setTimeout(5000,()=>req.destroy());});}
async function checkPage(page){const doc=await get(origin+page,'text/html');assert.equal(doc.status,200);const href=favicon(doc.body.toString('utf8')),resolved=new URL(href,origin+page);assert.equal(resolved.origin,origin);assert.equal(resolved.pathname,'/logo.ico');const image=await get(resolved);assert.equal(image.status,200);assert.match(image.type,/^image\/(?:x-icon|vnd\.microsoft\.icon)/);assert.equal(sha(image.body),sha(icon));assert.deepEqual([...image.body.subarray(0,4)],[0,0,1,0]);assert.notEqual(image.body.subarray(0,15).toString().toLowerCase(),'<!doctype html>');return {href,sha256:sha(image.body)};}
test('public/logo.ico is a real existing ICO file',()=>{assert.ok(icon.length>4);assert.deepEqual([...icon.subarray(0,4)],[0,0,1,0]);});
test('actual HTML contains a root-absolute favicon URL',()=>{assert.equal(favicon(html),'/logo.ico');});
test('the delivered favicon bytes equal the source resource',()=>{assert.equal(sha(fs.readFileSync(path.join(assets,'logo.ico'))),sha(icon));});
test('root document resolves and really serves the favicon',async()=>{await checkPage('/');});
test('Users cold document resolves and really serves the same favicon',async()=>{await checkPage('/p07-it/users');});
test('Roles cold document resolves and really serves the same favicon',async()=>{await checkPage('/p07-it/roles');});
test('Menus cold document resolves and really serves the same favicon',async()=>{await checkPage('/p07-it/menus');});
test('refresh repeats the same root URL and actual icon bytes',async()=>{for(const p of ['/p07-it/users','/p07-it/roles','/p07-it/menus'])assert.deepEqual(await checkPage(p),await checkPage(p));});
test('missing icon paths cannot be disguised as SPA HTML success',async()=>{const r=await get(origin+'/not-an-existing-icon.ico');assert.equal(r.status,404);});
test('development HTML introduces no external stylesheet or script',()=>{for(const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi)){assert.equal(new URL(match[1],origin+'/').origin,origin);}});
test('Vue CLI default root BASE_URL produces the intended root icon',()=>{const defaults=require('@vue/cli-service/lib/options').defaults();assert.equal(defaults.publicPath,'/');assert.equal(favicon(render(defaults.publicPath)),'/logo.ico');});
test('non-Stage0 prefixed deployments retain their BASE_URL prefix',()=>{for(const p of ['/manager/','/legacy-console/']){const href=favicon(render(p));assert.equal(href,p+'logo.ico');assert.equal(new URL(href,'http://127.0.0.1'+p+'sys/users').pathname,p+'logo.ico');}});
