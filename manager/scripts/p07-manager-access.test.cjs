'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const access = require('../src/libs/manager-access-core.cjs');
const sessionCore = require('../src/libs/manager-session-core.cjs');

function info(role = 'B') {
  return {id: 'operator', username: 'synthetic-manager', isSuper: false, sessionProtocol: access.PROTOCOL,
    stage0: {role, capabilities: role === 'A' ? ['SELF_READ', 'MENU_SELF_READ', 'PREP_READ'] :
      ['SELF_READ', 'MENU_SELF_READ', 'PREP_READ', 'USER_READ', 'ROLE_READ', 'USER_ROLE_READ',
        'ROLE_MENU_READ', 'MENU_READ', 'USER_STATUS_WRITE', 'USER_ROLE_WRITE', 'ROLE_MENU_WRITE'],
      manageableUserIds: role === 'B' ? ['target'] : [], roleAIds: ['role-a'], readMenuIds: ['read-goods'],
      maintenanceMenuIds: role === 'B' ? ['users', 'roles', 'menus'] : []}};
}
const menus = [
  {id: 'read-goods', name: 'manager-goods', permission: '/manager/goods/goods/list', frontRoute: 'goods/goods-info/goods'},
  {id: 'users', name: 'user-manage', frontRoute: 'sys/user-manage/userManage'},
  {id: 'roles', name: 'role-manage', frontRoute: 'sys/role-manage/roleManage'},
  {id: 'menus', name: 'menu-manage', frontRoute: 'sys/menu-manage/menu'},
  {id: 'unknown', name: 'unknown-write', frontRoute: 'sys/arbitrary-write'}
];
function gate() {
  let tokens = {accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh'};
  const session = sessionCore.createManagerSession({readTokens: () => tokens,
    writeTokens: next => { tokens = next; }, clearTokens: () => { tokens = {}; }});
  return {session, tokens: () => tokens};
}
function policy(value = info(), rows = menus) {
  const {session} = gate();
  return access.createManagerAccess({snapshot: session.snapshot, sameSession: session.sameSession,
    fetchInfo: async () => ({success: true, result: value}), fetchMenus: async () => ({success: true, result: rows})});
}
test('A and B require server protocol, non-super identity and complete scope fields', () => {
  assert.equal(access.normalizeInfo(info('A')).stage0.role, 'A');
  assert.equal(access.normalizeInfo(info()).stage0.role, 'B');
  for (const bad of [{...info(), sessionProtocol: undefined}, {...info(), isSuper: true},
    {...info(), isSuper: undefined}, {...info(), isSuper: null}, {...info(), isSuper: 'false'},
    {...info(), stage0: {...info().stage0, role: 'SUPER'}}, {...info(), stage0: {...info().stage0, capabilities: ['*']}},
    {...info(), stage0: {...info().stage0, manageableUserIds: undefined}}]) assert.equal(access.normalizeInfo(bad), null);
});
test('A cannot obtain B maintenance even if a local role flag or capability is forged', () => {
  const a = info('A'); a.stage0.capabilities.push('USER_STATUS_WRITE', 'USER_READ'); a.stage0.manageableUserIds = ['target'];
  assert.equal(access.has(a, 'USER_READ'), false);
  assert.equal(access.canManageUser(a, 'target', 'USER_STATUS_WRITE'), false);
});
test('B may manage only configured other ordinary targets and A roles', () => {
  assert.equal(access.canManageUser(info(), 'target', 'USER_STATUS_WRITE'), true);
  assert.equal(access.canManageUser(info(), 'operator', 'USER_STATUS_WRITE'), false);
  assert.equal(access.canManageUser(info(), 'unknown', 'USER_ROLE_WRITE'), false);
  assert.equal(access.canManageRole(info(), 'role-a'), true);
  assert.equal(access.canManageRole(info(), 'role-b'), false);
});
test('A menus retain only granted PREP list entries', () => {
  assert.deepEqual(access.filterMenus(menus, info('A')).map(row => row.name), ['manager-goods']);
});
test('unknown menu IDs or unknown frontend components do not become routes', () => {
  const b = info(); b.stage0.maintenanceMenuIds.push('unknown');
  assert.equal(access.filterMenus(menus, b).some(row => row.name === 'unknown-write'), false);
  assert.equal(access.canRoute(b, access.filterMenus(menus, b), {name: 'unknown-write'}), false);
});
test('B menus and direct routes derive from server scope; A direct maintenance routes reject', () => {
  const b = info(); const bm = access.filterMenus(menus, b); const a = info('A');
  assert.equal(access.canRoute(b, bm, {name: 'user-manage'}), true);
  assert.equal(access.canRoute(a, access.filterMenus(menus, a), {name: 'user-manage'}), false);
  assert.equal(access.canRoute(a, access.filterMenus(menus, a), {name: 'manager-goods'}), true);
  assert.equal(access.canRoute(a, [], {name: 'order-list'}), false);
});
test('failed authoritative refresh clears previously usable permissions', async () => {
  let success = true; const {session} = gate();
  const p = access.createManagerAccess({snapshot: session.snapshot, sameSession: session.sameSession,
    fetchInfo: async () => ({success, result: info()}), fetchMenus: async () => ({success: true, result: menus})});
  assert.equal(await p.refresh(), true); assert.equal(p.has('USER_STATUS_WRITE'), true);
  success = false; assert.equal(await p.refresh(), false); assert.equal(p.has('USER_STATUS_WRITE'), false);
});
test('missing menu response or protocol mismatch remains denied', async () => {
  for (const p of [policy({...info(), sessionProtocol: undefined}), policy(info(), null)]) {
    assert.equal(await p.refresh(), false); assert.equal(p.state.ready, false); assert.equal(p.canRoute({name: 'user-manage'}), false);
  }
});
test('logout while permission query is pending cannot restore old authority', async () => {
  let finish; const wait = new Promise(resolve => { finish = resolve; }); const {session} = gate();
  const p = access.createManagerAccess({snapshot: session.snapshot, sameSession: session.sameSession,
    fetchInfo: () => wait, fetchMenus: async () => ({success: true, result: menus})});
  const request = p.refresh(); session.invalidate(); p.clear(); finish({success: true, result: info()});
  assert.equal(await request, false); assert.equal(p.state.ready, false);
});
test('Stage0 only refreshes explicit SESSION_AUTH_INVALID, not permission rejection', () => {
  assert.equal(sessionCore.failureKind(403, {success: false, code: 403, message: 'SESSION_AUTH_INVALID'}, true), 'expired');
  assert.equal(sessionCore.failureKind(403, {success: false, code: 403, message: 'SESSION_REJECTED'}, true), 'forbidden');
  assert.equal(sessionCore.failureKind(403, {success: false, code: 403, message: '登录已失效，请重新登录'}, true), 'forbidden');
  assert.equal(sessionCore.credentialEndpoint('/passport/user/refresh'), true);
});
test('mode-specific Session gate rejects legacy fallback and mixed protocol refresh', async () => {
  let tokens = {};
  const p = sessionCore.createManagerSession({readTokens: () => tokens, writeTokens: next => { tokens = next; },
    clearTokens: () => { tokens = {}; }, acceptsProtocol: value => value.sessionProtocol === access.PROTOCOL});
  const attempt = p.beginLogin();
  assert.equal(p.acceptLogin(attempt, {accessToken: 'synthetic-legacy', refreshToken: 'synthetic-legacy-r'}), false);
  assert.equal(p.acceptLogin(attempt, {accessToken: 'synthetic-stage0', refreshToken: 'synthetic-stage0-r', sessionProtocol: access.PROTOCOL}), true);
  assert.equal(await p.recover(p.snapshot(), () => ({success: true, result: {accessToken: 'synthetic-legacy', refreshToken: 'synthetic-legacy-r'}})), false);
  assert.equal(tokens.accessToken, undefined);
});

function withoutImports(source) { return source.replace(/^import[\s\S]*?;\r?\n/gm, ''); }
function apiFixture(enabled) {
  const calls = []; const {session} = gate();
  const functions = {};
  for (const method of ['getRequest', 'postRequest', 'putRequest', 'deleteRequest', 'importRequest',
    'getRequestWithNoToken', 'putRequestWithNoForm', 'postRequestWithNoTokenData', 'postRequestWithNoForm']) {
    functions[method] = (...args) => { calls.push({method, args}); return Promise.resolve({success: true}); };
  }
  const file = path.resolve(__dirname, '../src/api/index.js');
  const source = withoutImports(fs.readFileSync(file, 'utf8')).replace(/export const /g, 'const ');
  const context = {module: {exports: {}}, BASE: {stage0ManagerSessionEnabled: enabled}, managerSession: session,
    managerUrl: '', commonUrl: '', commonApiPath: value => value, encodeURIComponent, ...functions};
  vm.runInNewContext(source + '\nmodule.exports={login,logout,handleRefreshToken,stage0SetUserRoles,stage0SetRoleMenus,stage0SetUserStatus};', context);
  return {calls, api: context.module.exports, session};
}
test('actual new-mode login adds explicit protocol opt-in and POST refresh puts token in JSON body', async () => {
  const f = apiFixture(true);
  await f.api.login('synthetic-form'); await f.api.handleRefreshToken('synthetic-refresh');
  assert.equal(f.calls[0].args[2]['X-Manager-Session-Protocol'], access.PROTOCOL);
  assert.equal(f.calls[1].method, 'postRequestWithNoForm');
  assert.equal(f.calls[1].args[0], '/passport/user/refresh');
  assert.equal(f.calls[1].args[1].refreshToken, 'synthetic-refresh');
  assert.equal(f.calls.some(call => call.args[0].includes('synthetic-refresh')), false);
});
test('actual disabled mode preserves PREP native login and GET refresh', async () => {
  const f = apiFixture(false); await f.api.login('synthetic-form'); await f.api.handleRefreshToken('synthetic-refresh');
  assert.equal(f.calls[0].args[2], undefined); assert.equal(f.calls[1].method, 'getRequestWithNoToken');
});
test('three actual write adapters send only approved narrow payloads', async () => {
  const f = apiFixture(true);
  await f.api.stage0SetUserStatus('target', false);
  await f.api.stage0SetUserRoles('target', ['role-a']);
  await f.api.stage0SetRoleMenus('role-a', ['read-goods']);
  assert.equal(f.calls[0].args[0], '/passport/user/enable/target?status=false');
  assert.equal(f.calls[0].args[1], undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1].args[1])), {roleIds: ['role-a']});
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[2].args[1])), {menuIds: ['read-goods']});
});
test('actual logout invalidates locally before dispatching old Access', async () => {
  const f = apiFixture(true); await f.api.logout();
  assert.equal(f.session.snapshot().accessToken, undefined);
  assert.equal(f.calls[0].args[2].accessToken, 'synthetic-access');
});

async function runActualGuard(p, route) {
  let guard; const decisions = [];
  class Router {
    constructor() { this.history = {}; this.app = {}; }
    match() { return {meta: {}, matched: [{path: '/fixture', name: route.name, meta: {}}], ...route}; }
    push() { return Promise.resolve(); }
    beforeEach(fn) { guard = fn; }
    afterEach() {}
  }
  const file = path.resolve(__dirname, '../src/router/index.js');
  const source = withoutImports(fs.readFileSync(file, 'utf8')).replace('export const router', 'const router');
  const context = {Vue: {use() {}}, VueRouter: Router, ViewUI: {LoadingBar: {start() {}, finish() {}}},
    Util: {title() {}, initRouter: () => p.refresh(), toDefaultPage: (_a, _b, _c, next) => next()}, Cookies: {get: () => 'synthetic-cookie'},
    managerSession: {snapshot: () => ({generation: 0}), sameSession: () => true},
    routers: [], managerAccess: p, stage0ManagerEnabled: true, window: {scrollTo() {}}};
  vm.runInNewContext(source, context, {filename: file});
  await guard({meta: {}, fullPath: '/fixture', matched: [{path: '/fixture', name: route.name, meta: {}}], ...route}, {}, value => decisions.push(value));
  return decisions;
}
test('actual router guard rejects A deep-link to maintenance before page mount', async () => {
  const decisions = await runActualGuard(policy(info('A')), {name: 'user-manage'});
  assert.equal(decisions[0].name, 'error-403');
});
test('actual router guard permits only server-approved B route and rejects unknown direct URL', async () => {
  assert.equal((await runActualGuard(policy(), {name: 'user-manage'}))[0], undefined);
  assert.equal((await runActualGuard(policy(), {name: 'order-list'}))[0].name, 'error-403');
});
test('actual router guard fails closed on authority read failure', async () => {
  assert.equal((await runActualGuard(policy(null), {name: 'user-manage'}))[0].name, 'error-403');
});
test('controlled pages skip legacy mounted calls and expose only the scoped maintenance component', () => {
  for (const file of ['user-manage/userManage.vue', 'role-manage/roleManage.vue', 'menu-manage/menu.vue']) {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/views/sys', file), 'utf8');
    assert.match(source, /Stage0ManagerAccess v-if="stage0Mode"/);
    assert.match(source, /mounted\(\)\s*\{\s*if \(this\.stage0Mode\) return;/);
  }
  const panel = fs.readFileSync(path.resolve(__dirname, '../src/views/sys/Stage0ManagerAccess.vue'), 'utf8');
  assert.doesNotMatch(panel, /\b(addUser|resetPassword|deleteUser|editOtherUser|addRole|deleteRole|editPermission|addPermission|deletePermission)\b/);
});

async function panelFixture(role = 'B', kind = 'users', options = {}) {
  const {session} = gate(); const calls = []; const warnings = []; let confirmed; let scopeReads = 0;
  const p = access.createManagerAccess({snapshot: session.snapshot, sameSession: session.sameSession,
    fetchInfo: async () => { scopeReads++; return {success: true, result: options.info || info(role)}; },
    fetchMenus: async () => ({success: true, result: menus})});
  await p.refresh();
  const replies = {
    getUserListData: {records: [{id: 'target', username: 'synthetic-target', status: true}, {id: 'outside', status: true}], total: 2},
    getRoleList: {records: [{id: 'role-a', name: 'synthetic-A'}, {id: 'role-b', name: 'synthetic-B'}], total: 2},
    getAllPermissionList: [{id: 'read-goods', title: 'synthetic-read', permission: '/manager/goods/goods/list'},
      {id: 'users', title: 'synthetic-maintenance', permission: '/manager/passport/user/getByCondition'}],
    stage0UserRoles: [{userId: 'target', roleId: 'role-a'}],
    selectRoleMenu: [{roleId: 'role-a', menuId: 'read-goods', isSuper: false}],
    ...(options.replies || {})
  };
  const functions = {};
  for (const name of ['getUserListData', 'getRoleList', 'getAllPermissionList', 'selectRoleMenu',
    'stage0UserRoles', 'stage0SetUserRoles', 'stage0SetRoleMenus', 'stage0SetUserStatus']) {
    functions[name] = (...args) => {
      calls.push({name, args});
      if (options.onCall) options.onCall(name, args);
      return Promise.resolve({success: true, result: replies[name] || null});
    };
  }
  const file = path.resolve(__dirname, '../src/views/sys/Stage0ManagerAccess.vue');
  const script = fs.readFileSync(file, 'utf8').split('<script>')[1].split('</script>')[0];
  const context = {module: {exports: {}}, managerAccess: p, managerSession: session, Set, Error,
    util: {initRouter: () => p.refresh()}, ...functions};
  vm.runInNewContext(withoutImports(script).replace('export default', 'module.exports ='), context, {filename: file});
  const definition = context.module.exports;
  const instance = {kind, ...definition.data(), $route: {name: {users: 'user-manage', roles: 'role-manage', menus: 'menu-manage'}[kind]},
    $Message: {error: value => warnings.push(value), success() {}}, $router: {replace() {}},
    $Modal: {confirm: value => { confirmed = value; }}, $refs: {approvedTree: {getCheckedNodes: () => [{id: 'read-goods'}]}}};
  for (const [name, fn] of Object.entries(definition.methods)) instance[name] = fn.bind(instance);
  for (const [name, fn] of Object.entries(definition.computed)) Object.defineProperty(instance, name, {get: fn.bind(instance)});
  return {instance, p, calls, warnings, confirm: () => confirmed, scopeReads: () => scopeReads};
}
test('actual scoped panel does not query management lists for A', async () => {
  const f = await panelFixture('A'); await f.instance.load(true);
  assert.equal(f.calls.length, 0); assert.equal(f.instance.rows.length, 0); assert.equal(f.instance.allowed, false);
});
test('actual B user list discards any response row outside the approved target set', async () => {
  const f = await panelFixture(); await f.instance.load(true);
  assert.deepEqual(Array.from(f.instance.rows, row => row.id), ['target']);
});
test('actual status button cannot target self and a permitted write refreshes authoritative context', async () => {
  const f = await panelFixture();
  f.instance.setStatus({id: 'operator', status: true}); assert.equal(f.confirm(), undefined);
  f.instance.setStatus({id: 'target', status: true});
  const before = f.scopeReads(); await f.confirm().onOk();
  const writes = f.calls.filter(call => call.name === 'stage0SetUserStatus');
  assert.equal(writes.length, 1); assert.equal(writes[0].args[0], 'target'); assert.equal(writes[0].args[1], false);
  assert.equal(f.scopeReads() > before, true);
});
test('actual role assignment uses userId relationship query and rejects a B role selection', async () => {
  const f = await panelFixture(); await f.instance.openRoles({id: 'target'});
  assert.equal(f.calls[0].name, 'stage0UserRoles'); assert.equal(f.calls[0].args[0], 'target');
  assert.deepEqual(Array.from(f.instance.roleOptions, row => row.id), ['role-a']);
  f.instance.selectedRoleIds = ['role-b']; await f.instance.saveRoles();
  assert.equal(f.calls.some(call => call.name === 'stage0SetUserRoles'), false);
  f.instance.selectedRoleIds = ['role-a']; await f.instance.saveRoles();
  assert.equal(f.calls.filter(call => call.name === 'stage0SetUserRoles').length, 1);
});
test('actual A-role menu maintenance rejects a write-node checkbox and permits only read IDs', async () => {
  const f = await panelFixture('B', 'roles'); await f.instance.openMenus({id: 'role-a'});
  assert.equal(f.instance.menuModal, true);
  f.instance.$refs.approvedTree.getCheckedNodes = () => [{id: 'users'}];
  await f.instance.saveMenus(); assert.equal(f.calls.some(call => call.name === 'stage0SetRoleMenus'), false);
  f.instance.$refs.approvedTree.getCheckedNodes = () => [{id: 'read-goods'}];
  await f.instance.saveMenus(); assert.equal(f.calls.filter(call => call.name === 'stage0SetRoleMenus').length, 1);
});
test('actual scoped buttons expose no maintenance actions for self or outside targets', async () => {
  const f = await panelFixture();
  const action = f.instance.columns.find(column => column.title === '操作');
  const h = (name, options, children) => ({name, options, children});
  assert.equal(action.render(h, {row: {id: 'operator', status: true}}).options[0], '只读');
  assert.equal(action.render(h, {row: {id: 'outside', status: true}}).options[0], '只读');
  assert.equal(action.render(h, {row: {id: 'target', status: true}}).options.length, 2);
});

// Use the installed ViewUI Tree's actual cascade and getCheckedNodes methods,
// with only Vue's reactive setter/emitter replaced. No browser or DOM is needed.
function viewUiTreeModel(data) {
  const file = path.resolve(__dirname, '../node_modules/view-design/src/components/tree/tree.vue');
  const script = fs.readFileSync(file, 'utf8').split('<script>')[1].split('</script>')[0]
    .replace(/^\s*import[\s\S]*?;\r?\n/gm, '').replace('export default', 'module.exports =');
  const context = {module: {exports: {}}, TreeNode: {}, Dropdown: {}, DropdownMenu: {}, Emitter: {}, Locale: {}};
  vm.runInNewContext(script, context, {filename: file});
  const instance = {stateTree: data, childrenKey: 'children', checkStrictly: false,
    $set: (item, key, value) => { item[key] = value; }, $emit() {}};
  for (const [name, fn] of Object.entries(context.module.exports.methods)) instance[name] = fn.bind(instance);
  instance.flatState = instance.compileFlatState(); instance.rebuildTree();
  return instance;
}
function parentTreeOptions(includeExistingStructure) {
  const scope = info(); scope.stage0.readMenuIds.push('structure-root', 'read-extra');
  return {info: scope, replies: {
    getAllPermissionList: [{id: 'structure-root', title: 'synthetic-directory', permission: '', children: [
      {id: 'read-goods', title: 'synthetic-goods-read', permission: '/manager/goods/goods/list'},
      {id: 'read-extra', title: 'synthetic-store-read', permission: '/manager/store/store'}]}],
    selectRoleMenu: [...(includeExistingStructure ? [{roleId: 'role-a', menuId: 'structure-root', isSuper: false}] : []),
      {roleId: 'role-a', menuId: 'read-goods', isSuper: false}]
  }};
}
test('actual ViewUI parent-child cascade submits only approved API leaves and explicitly retains existing structure contract', async () => {
  const f = await panelFixture('B', 'roles', parentTreeOptions(true));
  await f.instance.openMenus({id: 'role-a'});
  assert.equal(f.instance.menuModal, true);
  assert.equal(f.instance.menuNodes[0].disableCheckbox, true);
  assert.equal(f.instance.menuNodes[0].checked, false, 'existing directory must not cascade-select new API grants on mount');
  assert.deepEqual(Array.from(f.instance.preservedStructureIds), ['structure-root']);
  const tree = viewUiTreeModel(f.instance.menuNodes);
  const extra = tree.flatState.find(entry => entry.node.id === 'read-extra');
  tree.handleCheck({checked: true, nodeKey: extra.nodeKey});
  assert.deepEqual(Array.from(tree.getCheckedNodes(), node => node.id), ['structure-root', 'read-goods', 'read-extra']);
  f.instance.$refs.approvedTree = tree;
  await f.instance.saveMenus();
  const write = f.calls.find(call => call.name === 'stage0SetRoleMenus');
  assert.deepEqual(Array.from(write.args[1]), ['read-goods', 'read-extra']);
  assert.deepEqual(Array.from(f.instance.preservedStructureIds), ['structure-root']);
  const template = fs.readFileSync(path.resolve(__dirname, '../src/views/sys/Stage0ManagerAccess.vue'), 'utf8');
  assert.match(template, /已有目录关系由服务端保留/);
});
test('cascade cannot create a new structural grant when no old directory relationship exists', async () => {
  const f = await panelFixture('B', 'roles', parentTreeOptions(false));
  await f.instance.openMenus({id: 'role-a'});
  assert.equal(f.instance.preservedStructureIds.length, 0);
  const tree = viewUiTreeModel(f.instance.menuNodes);
  tree.handleCheck({checked: true, nodeKey: tree.flatState.find(entry => entry.node.id === 'read-extra').nodeKey});
  f.instance.$refs.approvedTree = tree;
  await f.instance.saveMenus();
  const write = f.calls.find(call => call.name === 'stage0SetRoleMenus');
  assert.equal(Array.from(write.args[1]).includes('structure-root'), false);
});
test('missing current menu relationship in the authoritative tree rejects editing instead of silently dropping it', async () => {
  const options = parentTreeOptions(true);
  options.info.stage0.readMenuIds.push('missing-existing');
  options.replies.selectRoleMenu.push({roleId: 'role-a', menuId: 'missing-existing', isSuper: false});
  const f = await panelFixture('B', 'roles', options);
  await f.instance.openMenus({id: 'role-a'});
  assert.equal(f.instance.menuModal, false);
  assert.equal(f.calls.some(call => call.name === 'stage0SetRoleMenus'), false);
});
