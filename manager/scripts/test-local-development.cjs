 'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const configFile = path.resolve(__dirname, '../src/config/local-development.cjs');
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS ' + name); }
const original = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';
const local = require(configFile);
test('development local only', () => assert.equal(local.enabled, true));
test('fixed loopback target', () => assert.equal(local.target, 'http://127.0.0.1:18887'));
for (const url of ['/passport/user/login', '/goods/goods/list', '/api/manager/common/slider/LOGIN']) {
 test('allow Manager ' + url, () => assert.equal(local.allowedRequest({url, baseURL:local.managerPrefix}), true));
}
for (const url of ['https://admin-api.pickmall.cn/manager/passport/user/info', '//example.com/x', '/api/buyer/x', '/api/common/resource/fileDirectory', '/../buyer/x', '/%2f/buyer/x', '/foo\\bar', '/%2e%2e/buyer/x', '/%252f/buyer/x']) {
 test('reject unapproved target ' + url, () => assert.equal(local.allowedRequest({url, baseURL:local.managerPrefix}), false));
}
test('reject changed base', () => assert.equal(local.allowedRequest({url:'/foo',baseURL:'https://example.com'}),false));
test('empty role has no menu', () => assert.deepEqual(local.localMenus([]), []));
test('unknown permissions cannot add menu', () => assert.deepEqual(local.localMenus([{permission:'*'}]), []));
const goods={id:'s1',permission:'/manager/goods/goods/list',children:[]};
const store={id:'s2',permission:'/manager/store/store',children:[]};
test('only granted goods appears', () => assert.deepEqual(local.localMenus([goods])[0].children[0].children.map(x=>x.name),['manager-goods']));
test('both existing pages mapped', () => assert.deepEqual(local.localMenus([goods,store])[0].children[0].children.map(x=>x.name),['manager-goods','shop']));
test('source permission retained', () => assert.equal(local.localMenus([goods])[0].children[0].children[0].permission,goods.permission));
test('does not mutate server tree', () => {local.localMenus([goods]);assert.deepEqual(goods,{id:'s1',permission:'/manager/goods/goods/list',children:[]});});
process.env.NODE_ENV='production';delete require.cache[configFile];
test('production local mode off', () => assert.equal(require(configFile).enabled,false));
test('local entry rejects inherited production mode before tools run', () => {
 const {spawnSync} = require('node:child_process');
 const result = spawnSync(process.execPath, [path.resolve(__dirname, 'serve-local.cjs')], {
  env: {SystemRoot: process.env.SystemRoot, NODE_ENV: 'production'}, encoding: 'utf8'
 });
 assert.equal(result.status, 1);
 assert.match(result.stderr, /NODE_ENV must be development or unset/);
});
if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=original;
console.log(count + '/' + count + ' PASS');
