'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const buildFullPath = require('axios/lib/core/buildFullPath');

const source = fs.readFileSync(path.join(__dirname, '../src/components/verify/verify.js'), 'utf8');
function load(base) {
  const calls = [];
  const scope = {
    commonApiPath: route => 'LEGACY' + route,
    getRequestWithNoToken: url => calls.push({method:'GET', url}),
    postRequestWithNoToken: (url, params) => calls.push({method:'POST', url, params})
  };
  if (base !== undefined) scope.BASE = base;
  vm.runInNewContext(source.replace(/import[^;]+;/, '').replaceAll('export const ', 'const ') + '\nglobalThis.api = {getVerifyImg, postVerifyImg};', scope);
  return {...scope.api, calls};
}

test('Stage1 challenge and verification use the same Manager path exactly once', () => {
  const api = load({stage1Enabled:true});
  const params = {verificationEnums:'LOGIN', xPos:0};
  api.getVerifyImg('LOGIN'); api.postVerifyImg(params);
  assert.deepEqual(api.calls.map(call => call.method), ['GET','POST']);
  for (const call of api.calls) {
    assert.equal(call.url, '/common/slider/LOGIN');
    assert.equal(buildFullPath('/api/manager', call.url), '/api/manager/common/slider/LOGIN');
  }
  assert.equal(api.calls[1].params, params);
});

test('Stage2 keeps the previous common API mapping even when Stage1 is also enabled', () => {
  for (const base of [{stage1Enabled:true,stage2Enabled:true}, {stage1Enabled:false,stage2Enabled:true}]) {
    const api = load(base);
    api.getVerifyImg('LOGIN'); api.postVerifyImg({verificationEnums:'LOGIN',xPos:0});
    assert.deepEqual(api.calls.map(call => call.url), ['LEGACY/slider/LOGIN','LEGACY/slider/LOGIN']);
  }
});

test('legacy production and development continue to use commonApiPath', () => {
  for (const base of [undefined, {}, {stage1Enabled:false}]) {
    const api = load(base);
    api.getVerifyImg('LOGIN'); api.postVerifyImg({verificationEnums:'LOGIN',xPos:0});
    assert.deepEqual(api.calls.map(call => call.url), ['LEGACY/slider/LOGIN','LEGACY/slider/LOGIN']);
  }
});

const accessCore = require('../src/libs/manager-access-core.cjs');
const stage1Core = require('../src/libs/stage1-access-core.cjs');
const loginScript = fs.readFileSync(path.join(__dirname, '../src/views/login.vue'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const stage1Profile = () => ({
  id:'102139446782066688', username:'synthetic-stage1-admin', isSuper:false,
  sessionProtocol:'STAGE0_SESSION',
  stage1:{permissions:['admission.review','store.read','store.supervise','agreement.read','agreement.write',
    'rule.read','rule.write','channel.configure','channel.onboard','channel.receiver','catalog.configure',
    'goods.read','goods.review','goods.supervise','fulfillment.inspect'],
    authVersion:'a'.repeat(64),environment:'TEST',mode:'MOCK'}
});

async function runAfterLogin(profile, {stage1=true,stage2=false,menuReady=true,currentSession=true} = {}) {
  const source = {accessToken:'synthetic-access',refreshToken:'synthetic-refresh',generation:1};
  const observed = {expired:0,cookies:[],routes:[],errors:[],menuLoads:0};
  const rows = Object.entries(stage1Core.pages).map(([key,[action,frontRoute]]) => ({
    id:'s1-'+key,name:'s1-'+key,path:'/s1/'+key,permission:'s1.'+action,frontRoute,children:[]
  }));
  const policy = accessCore.createManagerAccess({
    fetchInfo:async()=>({success:true,result:profile}),
    fetchMenus:async()=>({success:menuReady,result:stage1?rows:[]}),
    snapshot:()=>source,sameSession:s=>currentSession&&s===source,stage1Enabled:stage1
  });
  const scope = {
    module:{exports:{}},BASE:{stage0ManagerSessionEnabled:true,stage1Enabled:stage1,stage2Enabled:stage2},
    stage0ManagerEnabled:true,stage1ManagerEnabled:stage1,
    normalizeInfo:accessCore.normalizeInfo,
    managerSession:{sameSession:s=>currentSession&&s===source,expire:()=>observed.expired++},
    managerAccess:policy,userInfo:async()=>({success:true,result:profile}),
    Cookies:{set:(key,value)=>observed.cookies.push({key,value})},
    Header:{},Footer:{},LangSwitch:{},verify:{},
    util:{initRouter:async()=>{observed.menuLoads++;return policy.refresh();}}
  };
  vm.runInNewContext(loginScript.replace(/^import .*;\s*$/gm,'').replace('export default','module.exports ='),scope);
  const component = {loading:true,$Message:{error:value=>observed.errors.push(value)},
    $store:{commit:()=>{}},$router:{push:value=>observed.routes.push(value)}};
  await scope.module.exports.methods.afterLogin.call(component,source);
  await Promise.resolve(); await Promise.resolve();
  return {observed,policy};
}

test('actual Stage1 afterLogin accepts its native profile without requiring Stage0 role fields', async () => {
  const {observed,policy} = await runAfterLogin(stage1Profile());
  assert.equal(observed.expired,0);
  assert.deepEqual(observed.errors,[]);
  assert.equal(observed.cookies.length,1);
  assert.equal(observed.menuLoads,1);
  assert.equal(policy.state.menus[0].children[0].children.length,13);
  assert.equal(observed.routes.length,1);
  assert.equal(observed.routes[0].name,'home_index');
  assert.equal(policy.canRoute({name:'home_index'}),true);
});

test('actual Stage1 afterLogin rejects malformed identity or permissions before menu loading', async () => {
  const valid = stage1Profile();
  for (const bad of [
    {...valid,sessionProtocol:'LEGACY_JWT'}, {...valid,stage1:undefined}, {...valid,isSuper:true},
    {...valid,id:123}, {...valid,stage1:{...valid.stage1,authVersion:undefined}},
    {...valid,stage1:{...valid.stage1,permissions:['*']}}
  ]) {
    const {observed} = await runAfterLogin(bad);
    assert.equal(observed.expired,1);
    assert.equal(observed.menuLoads,0);
    assert.equal(observed.cookies.length,0);
    assert.equal(observed.routes.length,0);
    assert.deepEqual(observed.errors,['Manager协议或角色配置未就绪']);
  }
});

test('actual Stage1 afterLogin still refuses home when authoritative menu loading fails', async () => {
  const {observed,policy} = await runAfterLogin(stage1Profile(),{menuReady:false});
  assert.equal(observed.expired,1);
  assert.equal(observed.routes.length,0);
  assert.equal(policy.state.ready,false);
  assert.deepEqual(observed.errors,['当前权限读取失败，请重新登录']);
});

test('late afterLogin response cannot affect a replacement session', async () => {
  const {observed} = await runAfterLogin(stage1Profile(),{currentSession:false});
  assert.equal(observed.expired,0);
  assert.equal(observed.cookies.length,0);
  assert.equal(observed.menuLoads,0);
  assert.equal(observed.routes.length,0);
});

test('Stage0 keeps accepting its original role profile', async () => {
  const profile = {id:'101',username:'synthetic-stage0-manager',isSuper:false,sessionProtocol:'STAGE0_SESSION',
    stage0:{role:'A',capabilities:['SELF_READ','MENU_SELF_READ','PREP_READ'],manageableUserIds:[],roleAIds:[],readMenuIds:[],maintenanceMenuIds:[]}};
  const {observed} = await runAfterLogin(profile,{stage1:false});
  assert.equal(observed.expired,0);
  assert.deepEqual(observed.errors,[]);
  assert.equal(observed.routes[0].name,'home_index');
});

test('Stage2 retains its previous login-profile branch', async () => {
  const {observed} = await runAfterLogin(stage1Profile(),{stage2:true});
  assert.equal(observed.expired,1);
  assert.equal(observed.cookies.length,0);
  assert.equal(observed.menuLoads,0);
  assert.deepEqual(observed.errors,['Manager协议或角色配置未就绪']);
});
