'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const Vue = require('vue');
const NativeVueRouter = require('vue-router');
const accessCore = require('../src/libs/manager-access-core.cjs');
const sessionCore = require('../src/libs/manager-session-core.cjs');
const managerRoot = path.resolve(__dirname, '..');
const baseline = process.env.P07_ROUTE_SOURCE_BASELINE;
if (baseline && !/^[a-f0-9]{40}$/.test(baseline)) throw new Error('Invalid baseline');

function read(relative) {
  return baseline ? execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'show', `${baseline}:manager/${relative}`],
    {cwd: managerRoot, encoding: 'utf8'}) : fs.readFileSync(path.join(managerRoot, relative), 'utf8');
}
function load(relative, dependencies, globals = {}, named = false) {
  let source = read(relative).replace(/import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?/g,
    (_, binding, quote, name) => `const ${binding.trim()} = require(${JSON.stringify(name)});`);
  source = source.replace(/export const router\s*=/, 'const router =');
  source = named ? `${source}\nmodule.exports = {router};` : source.replace('export default', 'module.exports =');
  const context = {module: {exports: {}}, ...globals, require(name) {
    if (!(name in dependencies)) throw new Error(`Unexpected test dependency ${name}`);
    return dependencies[name];
  }};
  vm.runInNewContext(source, context, {filename: path.join(managerRoot, relative)});
  return context.module.exports;
}
const component = {render(h) { return h('div'); }};
const fixtureMenus = [{id: 'nav', name: 'fixture-nav', title: 'Fixture navigation', level: 0, frontRoute: 'Main', children: [
  {id: 'console', name: 'p07-console', path: '/p07-it', title: 'Fixture console', frontRoute: 'Main', children: [
    {id: 'goods', name: 'manager-goods', path: '/manager-goods', title: 'Goods', frontRoute: 'goods/goods-info/goods', permission: '/manager/goods/goods/list'},
    {id: 'users', name: 'p07-users', path: '/p07-it/users', title: 'Users', frontRoute: 'sys/user-manage/userManage'},
    {id: 'roles', name: 'p07-roles', path: '/p07-it/roles', title: 'Roles', frontRoute: 'sys/role-manage/roleManage'},
    {id: 'menus', name: 'p07-menus', path: '/p07-it/menus', title: 'Menus', frontRoute: 'sys/menu-manage/menu'}
  ]}
]}];
function authoritativeInfo(role) {
  return {id: `synthetic-${role}`, isSuper: false, sessionProtocol: 'STAGE0_SESSION', stage0: {
    role, capabilities: role === 'B' ? ['SELF_READ', 'MENU_SELF_READ', 'PREP_READ', 'USER_READ', 'ROLE_READ', 'MENU_READ', 'USER_STATUS_WRITE'] : ['SELF_READ', 'MENU_SELF_READ', 'PREP_READ'],
    manageableUserIds: role === 'B' ? ['synthetic-target'] : [], roleAIds: role === 'B' ? ['role-a'] : [],
    readMenuIds: ['nav', 'console', 'goods'], maintenanceMenuIds: role === 'B' ? ['users', 'roles', 'menus'] : []
  }};
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}
function fixture({role = 'B', authenticated = true, stage0 = true, prep = false} = {}) {
  let activeRole = role;
  let cookie = authenticated ? `synthetic-${role}` : undefined;
  let tokens = authenticated ? {accessToken: `access-${role}`, refreshToken: `refresh-${role}`} : {};
  let infoCalls = 0;
  let menusCalls = 0;
  let menuCallsLegacy = 0;
  let failure = false;
  let pendingInfo = null;
  const session = sessionCore.createManagerSession({readTokens: () => tokens, writeTokens: next => {tokens = next;}, clearTokens: () => {tokens = {};}});
  const access = accessCore.createManagerAccess({snapshot: session.snapshot, sameSession: session.sameSession,
    fetchInfo: async () => {infoCalls++; const captured = activeRole; if (pendingInfo) {const hold = pendingInfo; pendingInfo = null; return hold.promise;} return {success: !failure, result: authoritativeInfo(captured)};},
    fetchMenus: async () => {menusCalls++; return {success: !failure, result: structuredClone(fixtureMenus)};}
  });
  const storage = {getItem(key) {return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null;}, setItem(key, value) {this[key] = String(value);}, removeItem(key) {delete this[key];}};
  const window = {document: {title: ''}, localStorage: storage, scrollTo() {}};
  const Cookies = {get: () => cookie};
  const shared = {window, localStorage: storage, BASE: {stage0ManagerSessionEnabled: stage0}};
  const managerAccessModule = {managerAccess: access, stage0ManagerEnabled: stage0};
  const api = {getCurrentPermissionList: async () => {menuCallsLegacy++; return {success: true, result: structuredClone(fixtureMenus)};}};
  const util = load('src/libs/util.js', {'@/api/index': api, './lazyLoading.js': () => component, 'js-cookie': Cookies,
    '@/config/local-development.cjs': {enabled: prep, localMenus: rows => rows}, './manager-session': {managerSession: session}, './manager-access': managerAccessModule}, shared);
  class FixtureRouter extends NativeVueRouter {}
  const otherRouter = {path: '/', name: 'otherRouter', component, children: [{path: '/home', name: 'home_index', component, meta: {title: 'Home'}}]};
  const routers = [{path: '/login', name: 'login', component, meta: {title: 'Login'}}, otherRouter,
    {path: '/403', name: 'error-403', component, meta: {title: 'Forbidden'}}];
  let router;
  const routerProxy = {addRoutes(routes) {return router.addRoutes(routes);}, replaceStage0Routes(routes) {return router.replaceStage0Routes(routes);}};
  const appModule = load('src/store/modules/app.js', {'@/router/router': {otherRouter}, '@/router/index': {router: routerProxy}, '@/libs/util': util,
    vue: Vue, '@/libs/manager-access': managerAccessModule}, shared);
  const state = appModule.state;
  const commits = [];
  const store = {state: {app: state}, commit(name, payload) {commits.push(name); assert.equal(typeof appModule.mutations[name], 'function', `unknown mutation ${name}`); appModule.mutations[name](state, payload);}};
  router = load('src/router/index.js', {vue: Vue, 'view-design': {LoadingBar: {start() {}, finish() {}}}, '../libs/util': util,
    'vue-router': FixtureRouter, 'js-cookie': Cookies, './router': {routers}, '@/libs/manager-access': managerAccessModule,
    '@/libs/manager-session': {managerSession: session}, '../libs/manager-session': {managerSession: session}}, shared, true).router;
  const app = {$store: store, $nextTick: callback => Vue.nextTick(callback)};
  Object.defineProperty(app, '$route', {get() {return router.currentRoute;}});
  router.app = app;
  const navigationErrors = [];
  router.onError(error => { navigationErrors.push(error); });
  let guardEntries = 0;
  const originalGuard = router.beforeHooks[0];
  router.beforeHooks[0] = (to, from, next) => {guardEntries++; if (guardEntries > 40) throw new Error('Navigation loop'); return originalGuard(to, from, next);};
  async function drain() {for (let index = 0; index < 70; index++) await Promise.resolve();}
  return {router, util, app, access, session, state, commits,
    async navigate(location) {await router.push(location); await drain(); assert.equal(navigationErrors.length, 0, 'navigation callbacks must not throw'); return router.currentRoute;}, drain,
    stats: () => ({infoCalls, menusCalls, menuCallsLegacy, guardEntries}),
    failPermissions() {failure = true;}, holdNextInfo() {pendingInfo = deferred(); return pendingInfo;},
    switchAccount(nextRole, {staleCookie = false, withTokens = true} = {}) {
      session.invalidate(); access.clear(); activeRole = nextRole; cookie = staleCookie ? `stale-${nextRole}` : (withTokens ? `synthetic-${nextRole}` : undefined);
      if (withTokens) {const attempt = session.beginLogin(); session.acceptLogin(attempt, {accessToken: `new-access-${nextRole}`, refreshToken: `new-refresh-${nextRole}`});}
    }
  };
}

for (const [suffix, name] of [['users', 'p07-users'], ['roles', 'p07-roles'], ['menus', 'p07-menus']]) {
  test(`B cold-start ${suffix} is registered, rematched and authorized`, async () => {
    const f = fixture(); assert.equal(f.router.match(`/p07-it/${suffix}`).matched.length, 0);
    const route = await f.navigate(`/p07-it/${suffix}`);
    assert.equal(route.name, name); assert.equal(route.meta.stage0MenuId, suffix);
    assert.ok(f.access.canRoute(route)); assert.ok(f.stats().guardEntries <= 3);
  });
  test(`A cold-start ${suffix} remains forbidden`, async () => {
    const f = fixture({role: 'A'}); assert.equal((await f.navigate(`/p07-it/${suffix}`)).name, 'error-403');
    assert.equal(f.access.has('USER_STATUS_WRITE'), false);
    assert.equal(f.router.match(`/p07-it/${suffix}`).matched.length, 0);
  });
}
test('cold rematch preserves the original query and hash', async () => {
  const route = await fixture().navigate('/p07-it/users?page=2#target');
  assert.equal(route.fullPath, '/p07-it/users?page=2#target');
});
test('anonymous cold deep links require login without fetching or registering permissions', async () => {
  const f = fixture({authenticated: false}); assert.equal((await f.navigate('/p07-it/users')).name, 'login');
  assert.equal(f.stats().infoCalls, 0); assert.equal(f.state.routers.length, 1);
});
test('a remaining user cookie without a valid Session is not authenticated', async () => {
  const f = fixture(); f.switchAccount('A', {staleCookie: true, withTokens: false});
  assert.equal((await f.navigate('/p07-it/users')).name, 'login'); assert.equal(f.access.state.ready, false);
});
test('unknown URLs stay forbidden after approved routes initialize', async () => {
  const f = fixture(); assert.equal((await f.navigate('/unapproved/write-anything')).name, 'error-403');
  assert.equal(f.router.match('/unapproved/write-anything').matched.length, 0);
});
test('refreshing registered pages does not duplicate routes, tags or rematch indefinitely', async () => {
  const f = fixture(); await f.navigate('/p07-it/users');
  const count = f.state.routers.length; const tags = f.state.tagsList.length;
  for (let repeat = 0; repeat < 5; repeat++) {await f.util.initRouter(f.app); await f.navigate(repeat % 2 ? '/p07-it/users' : '/p07-it/roles');}
  assert.equal(f.state.routers.length, count); assert.equal(f.state.tagsList.length, tags);
  assert.equal(new Set(f.state.routers.map(row => row.name)).size, f.state.routers.length);
  assert.ok(f.stats().guardEntries <= 9);
});
test('ordinary menu clicks still use the registered named routes', async () => {
  const f = fixture(); await f.navigate('/home');
  assert.equal((await f.navigate({name: 'p07-users'})).name, 'p07-users');
  assert.equal((await f.navigate({name: 'p07-roles'})).name, 'p07-roles');
});
test('registered leaf routes with empty children open valid breadcrumb tags without callback errors', async () => {
  const f = fixture(); await f.navigate('/p07-it/users');
  const leaf = f.state.tagsList.find(item => item.name === 'p07-users');
  assert.ok(leaf); assert.equal(leaf.children.length, 0);
  assert.ok(f.state.pageOpenedList.some(item => item && item.name === 'p07-users'));
  assert.ok(f.state.pageOpenedList.every(item => item && typeof item.name === 'string'));
});
test('a later concurrent cold navigation cannot be overwritten by the older waiting target', async () => {
  const f = fixture(); const hold = f.holdNextInfo();
  const older = f.navigate('/p07-it/users');
  await Promise.resolve();
  const newer = f.navigate('/p07-it/roles');
  hold.resolve({success: true, result: authoritativeInfo('B')});
  await Promise.all([older, newer]);
  assert.equal(f.router.currentRoute.name, 'p07-roles');
  assert.equal(f.router.currentRoute.fullPath, '/p07-it/roles');
  assert.ok(f.stats().guardEntries <= 4);
});
test('switching B to A removes old B matcher entries and authorization', async () => {
  const f = fixture(); await f.navigate('/p07-it/users'); f.switchAccount('A');
  assert.equal((await f.navigate('/p07-it/roles')).name, 'error-403');
  assert.equal(f.router.match('/p07-it/users').matched.length, 0);
  assert.equal(f.router.match('/p07-it/roles').matched.length, 0);
  assert.equal(f.access.state.info.stage0.role, 'A');
});
test('permission-read failure cannot keep old B routes or authorize the target', async () => {
  const f = fixture(); await f.navigate('/p07-it/users'); f.failPermissions();
  assert.equal((await f.navigate('/p07-it/roles')).name, 'error-403');
  assert.equal(f.access.state.ready, false); assert.equal(f.router.match('/p07-it/users').matched.length, 0);
});
test('concurrent initialization of one Session shares the authoritative permission flight', async () => {
  const f = fixture(); const hold = f.holdNextInfo(); const one = f.util.initRouter(f.app); const two = f.util.initRouter(f.app);
  hold.resolve({success: true, result: authoritativeInfo('B')});
  assert.deepEqual(await Promise.all([one, two]), [true, true]); assert.equal(f.stats().infoCalls, 1); assert.equal(f.stats().menusCalls, 1);
  assert.equal(new Set(f.state.routers.map(row => row.name)).size, f.state.routers.length);
});
test('an old B response completing after A login cannot restore B routes', async () => {
  const f = fixture(); const hold = f.holdNextInfo(); const old = f.util.initRouter(f.app); f.switchAccount('A');
  const current = f.util.initRouter(f.app); hold.resolve({success: true, result: authoritativeInfo('B')});
  assert.equal(await old, false); assert.equal(await current, true);
  assert.equal(f.access.state.info.stage0.role, 'A'); assert.equal(f.router.match('/p07-it/users').matched.length, 0);
});
test('non-Stage0 PREP mode keeps its original local-menu initialization', async () => {
  const f = fixture({stage0: false, prep: true}); await f.util.initRouter(f.app);
  assert.equal(f.stats().menuCallsLegacy, 1); assert.equal(f.stats().infoCalls, 0);
  assert.ok(f.commits.includes('updateMenulist')); assert.ok(f.commits.includes('setNavList'));
  assert.equal(f.commits.includes('replaceStage0AppRouter'), false);
});
