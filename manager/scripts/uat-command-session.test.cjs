'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const axios=require('axios');const core=require('../src/libs/manager-session-core.cjs');
function fixture({readDenied=false,writeUnknown=false,switched=false}={}) {
 let pair={accessToken:'expired',refreshToken:'refresh'},refreshes=0,writes=0;const calls=[];
 const session=core.createManagerSession({readTokens:()=>pair,writeTokens:v=>{pair={...v}},clearTokens:()=>{pair={}}});
 const scope={axios:{create:options=>{const service=axios.create(options);service.defaults.adapter=async config=>{
   calls.push({method:config.method,url:config.url,token:config.headers.accessToken});
   if(config.url==='/passport/user/info') {
    if(switched){session.beginLogin();session.acceptLogin(session.snapshot().generation,{accessToken:'other',refreshToken:'other-refresh'});}
    if(config.headers.accessToken==='expired'||readDenied){const e=new Error('Rejected');e.config=config;e.response={status:403,config,data:{code:403,success:false,message:readDenied?'DENIED':'SESSION_AUTH_INVALID'}};throw e;}
    return {status:200,config,data:{code:200,success:true,result:{id:'1'}}};
   }
   writes++;if(writeUnknown)throw Error('Transport unknown');return {status:200,config,data:{success:true,result:'accepted'}};
 };return service;}},getStore:k=>pair[k],setStore:()=>{},router:{history:{current:{name:'home'}},push:()=>{}},Message:{error:()=>{}},handleRefreshToken:async()=>{refreshes++;return {success:true,result:{accessToken:'fresh',refreshToken:'new-refresh'}}},managerSession:session,...core,uuidv4:()=> 'fixture',localDevelopment:{enabled:false},commonUrl:'',managerUrl:'/api/manager',commonApiPath:v=>v,uploadFile:'',BASE:{stage0ManagerSessionEnabled:true,p0IntegrationEnabled:true},URLSearchParams,FormData};
 let source=fs.readFileSync(path.join(__dirname,'../src/libs/axios.js'),'utf8').replace(/^import[^;]+;\s*/gm,'').replace(/^export \{[^}]+\};?\s*/gm,'').replace(/export const /g,'const ');
 vm.runInNewContext(source+'\nthis.api={postRequestWithNoForm,importRequest};',scope);
 return {api:scope.api,calls,stats:()=>({refreshes,writes})};
}
test('expired access refreshes through read before one command',async()=>{const f=fixture();await f.api.postRequestWithNoForm('/p0/s1/example',{operationId:'same'});assert.deepEqual(f.stats(),{refreshes:1,writes:1});assert.deepEqual(f.calls.map(c=>c.method),['get','get','post']);assert.equal(f.calls.at(-1).token,'fresh');});
test('concurrent commands share the existing refresh flight',async()=>{const f=fixture();await Promise.all([f.api.postRequestWithNoForm('/one',{}),f.api.importRequest('/upload',new FormData())]);assert.deepEqual(f.stats(),{refreshes:1,writes:2});});
test('revoked authority blocks command without refresh or dispatch',async()=>{const f=fixture({readDenied:true});await assert.rejects(f.api.postRequestWithNoForm('/one',{}));assert.deepEqual(f.stats(),{refreshes:0,writes:0});});
test('account switch during preflight blocks the original command',async()=>{const f=fixture({switched:true});await assert.rejects(f.api.postRequestWithNoForm('/one',{}));assert.equal(f.stats().writes,0);});
test('unknown command result is never automatically retried',async()=>{const f=fixture({writeUnknown:true});await assert.rejects(f.api.postRequestWithNoForm('/one',{}));assert.deepEqual(f.stats(),{refreshes:1,writes:1});});
