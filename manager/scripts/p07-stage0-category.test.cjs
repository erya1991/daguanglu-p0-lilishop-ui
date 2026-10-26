'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '../src/App.vue');
const script = fs.readFileSync(file, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

function component({stage0 = false, cached = null, success = true} = {}) {
  const requests = [];
  const reads = [];
  const writes = [];
  const result = [{id: 'synthetic-category', name: 'Synthetic category'}];
  const source = script.replace(/import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2\s*;?/g,
    (_, names, quote, dependency) => `const {${names}} = require(${JSON.stringify(dependency)});`)
    .replace('export default', 'module.exports =');
  const sandbox = {module: {exports: {}}, localStorage: {
    getItem(key) { reads.push(key); return cached; },
    setItem(key, value) { writes.push({key, value}); }
  }, require(dependency) {
    if (dependency === '@/libs/manager-access') return {stage0ManagerEnabled: stage0};
    if (dependency === '@/api/goods.js') return {getCategoryTree(parent) {
      requests.push(parent);
      return Promise.resolve({success, result});
    }};
    throw new Error('Unexpected test dependency');
  }};
  vm.runInNewContext(source, sandbox, {filename: file});
  return {app: sandbox.module.exports, requests, reads, writes, result};
}

test('Stage0 updates never request or cache categories on home or W01 routes', async () => {
  const fixture = component({stage0: true});
  for (const route of ['/login', '/home', '/p07-it/users', '/p07-it/roles', '/p07-it/menus']) {
    for (let update = 0; update < 3; update++) fixture.app.updated.call({$route: {path: route}});
  }
  await Promise.resolve();
  assert.deepEqual(fixture.requests, []);
  assert.deepEqual(fixture.reads, []);
  assert.deepEqual(fixture.writes, []);
});

test('Stage0 does not overwrite an existing category cache', async () => {
  const fixture = component({stage0: true, cached: '["existing-category"]'});
  fixture.app.updated.call({$route: {path: '/home'}});
  await Promise.resolve();
  assert.deepEqual(fixture.requests, []);
  assert.deepEqual(fixture.writes, []);
});

test('Non-Stage0 uncached page keeps the original category request and successful cache write', async () => {
  const fixture = component();
  fixture.app.updated.call({$route: {path: '/home'}});
  await Promise.resolve();
  assert.deepEqual(fixture.requests, [0]);
  assert.deepEqual(fixture.writes, [{key: 'category', value: JSON.stringify(fixture.result)}]);
});

test('Non-Stage0 cached page does not request categories again', async () => {
  const fixture = component({cached: '["existing-category"]'});
  fixture.app.updated.call({$route: {path: '/home'}});
  await Promise.resolve();
  assert.deepEqual(fixture.requests, []);
  assert.deepEqual(fixture.writes, []);
});

test('Non-Stage0 login page keeps the original no-request behavior', async () => {
  const fixture = component();
  fixture.app.updated.call({$route: {path: '/login'}});
  await Promise.resolve();
  assert.deepEqual(fixture.requests, []);
  assert.deepEqual(fixture.writes, []);
});

test('Non-Stage0 unsuccessful category response remains uncached', async () => {
  const fixture = component({success: false});
  fixture.app.updated.call({$route: {path: '/home'}});
  await Promise.resolve();
  assert.deepEqual(fixture.requests, [0]);
  assert.deepEqual(fixture.writes, []);
});
