'use strict';
// Real SFC + installed Vue + ViewUI DOM rendering, with explicit offline API fixtures.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('C:/Users/65410/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const compiler = require('vue-template-compiler');
const root = path.resolve(__dirname, '..');
const sourcePath = 'src/views/sys/Stage0ManagerAccess.vue';
const descriptor = compiler.parseComponent(fs.readFileSync(path.join(root, sourcePath), 'utf8'));
const projection = '.map(({id, title, permission}) => ({id, title, permission}))';
const originalScript = descriptor.script.content.replace(projection, '');
const script = process.env.P07_MENUS_BASELINE === '1' ? originalScript : descriptor.script.content;
const core = fs.readFileSync(path.join(root, 'src/libs/manager-access-core.cjs'), 'utf8');
const stage1Core = fs.readFileSync(path.join(root, 'src/libs/stage1-access-core.cjs'), 'utf8');
const ids = ['920007000301', '920007000302', '920007000303', '920007000304', '910000010001', '910000010002', '910000010005'];
let browser;
before(async () => {
  browser = await chromium.launch({executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--disable-background-networking', '--disable-sync', '--no-first-run']});
});
after(async () => { if (browser) await browser.close(); });

async function fixture(t, options = {}) {
  const context = await browser.newContext({serviceWorkers: 'block'});
  const attempted = [];
  await context.route('**/*', route => { attempted.push(route.request().method()); return route.abort(); });
  t.after(async () => { await context.close(); assert.deepEqual(attempted, [], 'Offline fixtures must not make HTTP requests'); });
  const page = await context.newPage();
  await page.setContent('<div id="test"></div>');
  await page.addScriptTag({path: path.join(root, 'node_modules/vue/dist/vue.js')});
  await page.addScriptTag({path: path.join(root, 'node_modules/view-design/dist/iview.js')});
  const componentScript = (options.original ? originalScript : script)
    .replace(/import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?/g,
      (_, binding, quote, name) => `const ${binding.trim()} = window.__deps[${JSON.stringify(name)}];`)
    .replace('export default', 'module.exports =');
  await page.evaluate(async ({componentScript, template, core, stage1Core, options, ids}) => {
    const events = [], calls = [], messages = [];
    Vue.config.productionTip = false; Vue.config.devtools = false;
    Vue.config.errorHandler = (error, vm, info) => {
      // Inputs here are synthetic; store only the fixed structural TypeError.
      const property = /reading '([A-Za-z_][A-Za-z0-9_]{0,40})'/.exec(error.message)?.[1] || null;
      const frame = /iview\.js:(\d+):(\d+)/.exec(String(error.stack));
      events.push({name: error.name, property, component: vm.$options.name, info,
        source: frame ? {path: 'node_modules/view-design/dist/iview.js', line: +frame[1], column: +frame[2]} : null});
    };
    Vue.config.warnHandler = (message, vm) => events.push({warning: true, component: vm?.$options.name || null});
    const stage1Module = {exports: {}}; new Function('module', stage1Core)(stage1Module);
    const module = {exports: {}}; new Function('module', 'require', core)(module, name => {
      if (name !== './stage1-access-core.cjs') throw Error('Unexpected browser fixture dependency');
      return stage1Module.exports;
    }); const access = module.exports;
    const leaf = (id, title, permission, children) => ({id, title, permission, ...(children === undefined ? {} : {children})});
    // Same seven-node topology as the read-only PREP seed check: two directory
    // nodes, two nested API nodes and three independent legacy read leaves.
    let tree = [leaf(ids[0], 'Root', null, [leaf(ids[1], 'Group', null, [
      leaf(ids[2], 'Goods', '/manager/goods/goods/list', []),
      leaf(ids[3], 'Stores', '/manager/store/store', null)
    ])]), leaf(ids[4], 'Read one', '/manager/goods/goods/sku/list', []),
    leaf(ids[5], 'Read two', '/manager/goods/goods/goodsNumber', null),
    leaf(ids[6], 'Read five', '/manager/store/store/all')];
    if (options.flat) tree = ids.map((id, index) => leaf(id, 'Flat ' + index, index > 3 ? '/manager/read/' + index : null,
      options.children === 'null' ? null : options.children === 'empty' ? [] : undefined));
    if (options.extra) tree[0].children.push(leaf('outside-scope', 'Unapproved', '/manager/write', []));
    if (options.malformed === 'root') tree = {};
    if (options.malformed === 'null-node') tree = [null];
    if (options.malformed === 'children') tree[0].children = {};
    const role = options.role || 'B';
    const info = {id: 'operator', username: 'synthetic-manager', isSuper: false, sessionProtocol: access.PROTOCOL,
      stage0: {role, capabilities: role === 'A' ? ['SELF_READ', 'MENU_SELF_READ', 'PREP_READ'] :
        ['SELF_READ', 'MENU_SELF_READ', 'PREP_READ', 'USER_READ', 'ROLE_READ', 'USER_ROLE_READ', 'ROLE_MENU_READ',
          'MENU_READ', 'USER_STATUS_WRITE', 'USER_ROLE_WRITE', 'ROLE_MENU_WRITE'],
      manageableUserIds: role === 'B' ? ['target'] : [], roleAIds: ['role-a'], readMenuIds: ids, maintenanceMenuIds: []}};
    let active = true, epoch = 1;
    const managerAccess = {state: Vue.observable({info: access.normalizeInfo(info)}),
      has: capability => access.has(managerAccess.state.info, capability),
      canManageRole: id => access.canManageRole(managerAccess.state.info, id),
      canManageUser: (id, capability) => access.canManageUser(managerAccess.state.info, id, capability),
      canRoute: () => active, clear() { active = false; this.state.info = null; }};
    const response = result => ({success: true, result});
    const api = {
      getAllPermissionList: async () => { calls.push({method: 'tree'}); if (options.late) epoch++; return response(tree); },
      getUserListData: async () => response({records: [{id: 'target', username: 'target', nickName: 'Target', status: true}, {id: 'outside'}], total: 2}),
      getRoleList: async () => response({records: [{id: 'role-a', name: 'Role A', description: 'Read only'}, {id: 'role-b', name: 'Role B'}], total: 2}),
      selectRoleMenu: async () => response(ids.map(id => ({roleId: 'role-a', menuId: id, isSuper: false}))),
      stage0SetRoleMenus: async (id, menuIds) => { calls.push({method: 'saveMenus', roleId: id, menuIds}); return response(null); }
    };
    window.__deps = {'@/libs/manager-access': {managerAccess},
      '@/libs/manager-session': {managerSession: {snapshot: () => epoch, sameSession: value => value === epoch}},
      '@/libs/util': {initRouter: async () => true}, '@/api/index': api};
    const mod = {exports: {}}; new Function('module', componentScript)(mod);
    const vm = new (Vue.extend({...mod.exports, ...Vue.compile(template), beforeCreate() {
      this.$Message = {error: () => messages.push('READ_FAILED'), success: () => messages.push('SUCCESS')};
      this.$route = {name: 'offline'}; this.$router = {replace() {}};
    }}))({propsData: {kind: options.kind || 'menus'}});
    vm.$mount('#test');
    window.__menusFixture = {vm, events, calls, messages, tree};
    await Vue.nextTick(); await new Promise(resolve => setTimeout(resolve, 40)); await Vue.nextTick();
  }, {componentScript, template: descriptor.template.content, core, stage1Core, options, ids});
  async function snapshot() {
    return page.evaluate(() => {
      const f = window.__menusFixture, vm = f.vm;
      const table = vm.$children.flatMap(card => card.$children).find(child => child.$options.name === 'Table');
      return {events: f.events, calls: f.calls, messages: f.messages, allowed: vm.allowed, loading: vm.loading,
        rows: vm.rows.map(row => ({...row})), rowIds: vm.rows.map(row => row.id),
        renderedRows: document.querySelectorAll('.ivu-table-body tr').length,
        text: document.querySelector('.search').textContent, table: table?.$options.name || null,
        modals: vm.$children.filter(child => child.$options.name === 'Modal').length,
        treeComponent: vm.$refs.approvedTree?.$options.name || null,
        menuModal: vm.menuModal, menuGrantIds: vm.menuGrantIds, menuStructureIds: vm.menuStructureIds,
        preservedStructureIds: vm.preservedStructureIds, checked: vm.$refs.approvedTree?.getCheckedNodes().map(row => row.id)};
    });
  }
  return {page, snapshot, async clean() { const result = await snapshot(); assert.deepEqual(result.events, []); return result; }};
}

test('original actual Menus SFC and ViewUI Table reproduce null._isChecked at TableBody render', async t => {
  const f = await fixture(t, {original: true}); const s = await f.snapshot();
  assert.equal(s.rows.length, 7); assert.equal(s.modals, 2);
  assert.ok(s.events.some(e => e.name === 'TypeError' && e.property === '_isChecked' && e.component === 'TableBody' && e.info === 'render'));
  assert.equal(s.renderedRows, 0);
});
test('B actual Menus branch renders exactly seven approved rows with real ViewUI Table', async t => {
  const f = await fixture(t); const s = await f.clean();
  assert.equal(s.allowed, true); assert.equal(s.table, 'Table'); assert.equal(s.renderedRows, 7);
  assert.deepEqual([...s.rowIds].sort(), [...ids].sort());
  for (const row of s.rows) assert.deepEqual(Object.keys(row).sort(), ['id', 'permission', 'title']);
});
test('root, grouping and API leaf titles/nullable permissions render without duplicate descendants', async t => {
  const f = await fixture(t); const s = await f.clean();
  for (const title of ['Root', 'Group', 'Goods', 'Stores', 'Read one', 'Read two', 'Read five']) assert.ok(s.text.includes(title));
  assert.equal(new Set(s.rowIds).size, 7); assert.equal(s.renderedRows, 7);
});
for (const children of ['absent', 'null', 'empty']) test(`actual Table handles ${children} children in flat source records`, async t => {
  const f = await fixture(t, {flat: true, children}); const s = await f.clean(); assert.equal(s.renderedRows, 7);
});
test('unapproved descendants are filtered and cannot render through retained children', async t => {
  const f = await fixture(t, {extra: true}); const s = await f.clean();
  assert.equal(s.renderedRows, 7); assert.ok(!s.text.includes('Unapproved')); assert.ok(!s.rowIds.includes('outside-scope'));
});
test('A cannot render Menus or obtain its tree through actual mounted load', async t => {
  const f = await fixture(t, {role: 'A'}); const s = await f.clean();
  assert.equal(s.allowed, false); assert.equal(s.renderedRows, 0); assert.deepEqual(s.calls, []);
});
for (const kind of ['users', 'roles']) test(`actual ${kind} branch retains its scoped row and actions`, async t => {
  const f = await fixture(t, {kind}); const s = await f.clean();
  assert.equal(s.renderedRows, 1); assert.deepEqual(s.rowIds, [kind === 'users' ? 'target' : 'role-a']);
  assert.ok(s.text.includes(kind === 'users' ? '禁用' : '菜单权限'));
});
test('repeated menu refresh and Users/Roles/Menus switches keep seven distinct rendered rows', async t => {
  const f = await fixture(t);
  await f.page.evaluate(async () => { const v = window.__menusFixture.vm; for (const kind of ['users', 'roles', 'menus', 'menus']) { v.kind = kind; await v.load(false); await Vue.nextTick(); } });
  const s = await f.clean(); assert.equal(s.renderedRows, 7); assert.equal(new Set(s.rowIds).size, 7);
});
test('W3 actual Modal/Tree keeps full hierarchy and existing structural relationships', async t => {
  const f = await fixture(t, {kind: 'roles'});
  await f.page.evaluate(async () => { await window.__menusFixture.vm.openMenus({id: 'role-a'}); await Vue.nextTick(); });
  const s = await f.clean(); assert.equal(s.treeComponent, 'Tree'); assert.equal(s.menuModal, true);
  assert.deepEqual([...s.menuGrantIds].sort(), ids.slice(2).sort());
  assert.deepEqual([...s.preservedStructureIds].sort(), ids.slice(0, 2).sort());
  const structure = await f.page.evaluate(() => { const f = window.__menusFixture; return {original: f.tree[0].children.length, dialog: f.vm.menuNodes[0].children.length}; });
  assert.deepEqual(structure, {original: 1, dialog: 1});
});
test('W3 save keeps API-leaf-only payload and preserved structures (offline API fixture only)', async t => {
  const f = await fixture(t, {kind: 'roles'});
  await f.page.evaluate(async () => { const v = window.__menusFixture.vm; await v.openMenus({id: 'role-a'}); await Vue.nextTick(); await v.saveMenus(); await Vue.nextTick(); });
  const s = await f.clean(); const write = s.calls.find(row => row.method === 'saveMenus');
  assert.equal(write.roleId, 'role-a'); assert.deepEqual([...write.menuIds].sort(), ids.slice(2).sort());
  assert.ok(write.menuIds.every(id => !ids.slice(0, 2).includes(id)));
});
for (const malformed of ['root', 'null-node', 'children']) test(`malformed ${malformed} data fails closed with no Table rendering error`, async t => {
  const f = await fixture(t, {malformed}); const s = await f.clean();
  assert.equal(s.allowed, false); assert.equal(s.rows.length, 0); assert.equal(s.renderedRows, 0); assert.ok(s.messages.includes('READ_FAILED'));
});
test('a stale Session response cannot populate menu rows', async t => {
  const f = await fixture(t, {late: true}); const s = await f.clean(); assert.equal(s.rows.length, 0); assert.equal(s.renderedRows, 0);
});
