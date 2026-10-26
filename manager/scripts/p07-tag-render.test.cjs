'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Vue = require('vue');
const compiler = require('vue-template-compiler');
const accessCore = require('../src/libs/manager-access-core.cjs');

const root = path.resolve(__dirname, '..');
const componentPath = 'src/views/main-parts/tags-page-opened.vue';
const descriptor = compiler.parseComponent(fs.readFileSync(path.join(root, componentPath), 'utf8'));
const oldColor = "item.children?(item.children[0].name==currentPageName?'primary':'default'):(item.name==currentPageName?'primary':'default')";
const originalTemplate = descriptor.template.content.replace(/:color="[^"]*"/, `:color="${oldColor}"`);
const template = process.env.P07_TAG_TEMPLATE_BASELINE === '1' ? originalTemplate : descriptor.template.content;
const home = () => ({name: 'home_index', title: 'Home', path: '/home'});
const users = children => ({name: 'p07-users', title: 'Users', path: '/p07-it/users', ...(children === undefined ? {} : {children})});

function load(relative, dependencies, globals = {}) {
  let source = fs.readFileSync(path.join(root, relative), 'utf8').replace(/import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?/g,
    (_, binding, quote, name) => `const ${binding.trim()} = require(${JSON.stringify(name)});`);
  source = source.replace('export default', 'module.exports =');
  const context = {module: {exports: {}}, ...globals, require(name) {
    if (!(name in dependencies)) throw new Error(`Unexpected offline dependency ${name}`);
    return dependencies[name];
  }};
  vm.runInNewContext(source, context, {filename: path.join(root, relative)});
  return context.module.exports;
}

function fixture(t, {tags = [home(), users([])], active = 'p07-users', stage0 = true, sourceTemplate = template} = {}) {
  const errors = [];
  const warnings = [];
  const previousError = Vue.config.errorHandler;
  const previousWarning = Vue.config.warnHandler;
  Vue.config.errorHandler = (error, component, info) => errors.push({name: error.name, info, component: component.$options.name});
  Vue.config.warnHandler = message => warnings.push(message);
  const storage = {};
  const routeState = Vue.observable({current: {name: active}});
  const router = {push(target) {routeState.current = {...target};}, replaceStage0Routes() {}};
  const dependencies = {
    '@/api/index': {getCurrentPermissionList() {throw new Error('Offline test must not request an API');}},
    './lazyLoading.js': () => ({render: h => h('div')}),
    'js-cookie': {get() {}},
    '@/config/local-development.cjs': {enabled: false},
    './manager-session': {managerSession: {}},
    './manager-access': {managerAccess: {}, stage0ManagerEnabled: stage0}
  };
  const util = load('src/libs/util.js', dependencies, {window: {}, localStorage: storage});
  const app = load('src/store/modules/app.js', {
    '@/router/router': {otherRouter: {name: 'otherRouter', children: [home()]}},
    '@/router/index': {router}, '@/libs/util': util, vue: Vue,
    '@/libs/manager-access': {stage0ManagerEnabled: stage0}
  }, {localStorage: storage});
  const state = Vue.observable(app.state);
  state.pageOpenedList = tags;
  // Available menu routes and opened tags are separate arrays in the app.
  // Closing a tag must not delete the route used to reopen it.
  state.tagsList = structuredClone(tags);
  const store = {state: {app: state}, commit(name, payload) {
    assert.equal(typeof app.mutations[name], 'function', `Unexpected mutation ${name}`);
    app.mutations[name](state, payload);
  }};
  const source = descriptor.script.content.replace('export default', 'module.exports =');
  const context = {module: {exports: {}}, localStorage: storage};
  vm.runInNewContext(source, context, {filename: path.join(root, componentPath)});
  const compiled = compiler.compileToFunctions(sourceTemplate);
  const Tag = {name: 'Tag', props: ['name', 'color', 'closable', 'type'], render(h) {return h('span', this.$slots.default);}};
  const options = {...context.module.exports, ...compiled, components: {Tag},
    beforeCreate() {
      Object.defineProperty(this, '$route', {get: () => routeState.current});
      this.$store = store; this.$router = router; this.$t = value => value;
    }};
  const instance = new (Vue.extend(options))({propsData: {pageTagsList: state.pageOpenedList}});
  // This renders the actual SFC template into Vue VNodes. It intentionally does
  // not mount a browser DOM or claim the scroll/layout lifecycle was verified.
  function render() {
    instance.pageTagsList = state.pageOpenedList;
    return instance._render();
  }
  function tagNodes() {
    const found = [];
    const seen = new Set();
    function visit(node) {
      if (!node || seen.has(node)) return;
      seen.add(node);
      if (node.componentOptions && node.componentOptions.Ctor.options.name === 'Tag') found.push(node);
      for (const child of node.children || []) visit(child);
      for (const child of node.componentOptions?.children || []) visit(child);
    }
    visit(render());
    return found;
  }
  t.after(() => {instance.$destroy(); Vue.config.errorHandler = previousError; Vue.config.warnHandler = previousWarning;});
  return {instance, state, store, util, errors, warnings, render, tagNodes,
    async route(name) {routeState.current = {name}; await Vue.nextTick();},
    open(name, query) {util.openNewPage({$store: store}, name, {}, query);},
    props(name) {const tag = tagNodes().find(node => node.key === name); assert.ok(tag, `Missing tag ${name}`); return tag.componentOptions.propsData;},
    assertClean() {assert.deepEqual(errors, [], 'Actual Vue template render must not emit an error'); assert.deepEqual(warnings, [], 'Actual template must not emit a Vue warning');}
  };
}

test('the original actual template fails on children=[] with a Vue render TypeError', t => {
  const f = fixture(t, {sourceTemplate: originalTemplate});
  f.render();
  assert.deepEqual(f.errors, [{name: 'TypeError', info: 'render', component: 'tagsPageOpened'}]);
});

test('actual template accepts a tag with children undefined', t => {
  const f = fixture(t, {tags: [users(undefined)]});
  assert.equal(f.props('p07-users').color, 'primary'); f.assertClean();
});

test('actual template accepts a tag with children null', t => {
  const f = fixture(t, {tags: [users(null)]});
  assert.equal(f.props('p07-users').color, 'primary'); f.assertClean();
});

test('actual Users template tag with children=[] renders as the current page', t => {
  const f = fixture(t);
  assert.equal(f.props('p07-users').color, 'primary'); f.assertClean();
});

test('a nonempty parent keeps its original first-child highlight behavior', t => {
  const f = fixture(t, {tags: [{name: 'parent', title: 'Parent', children: [users([])]}]});
  assert.equal(f.props('parent').color, 'primary'); f.assertClean();
});

test('home_index remains nonclosable and highlights only when current', async t => {
  const f = fixture(t);
  assert.equal(f.props('home_index').closable, false);
  assert.equal(f.props('home_index').color, 'default');
  await f.route('home_index');
  assert.equal(f.props('home_index').color, 'primary'); f.assertClean();
});

test('Users maintenance tag keeps its real name, title and closable state', t => {
  const f = fixture(t);
  const node = f.tagNodes().find(item => item.key === 'p07-users');
  assert.equal(node.componentOptions.propsData.name, 'p07-users');
  assert.equal(node.componentOptions.propsData.closable, true);
  assert.equal(node.componentOptions.children[0].text, 'Users'); f.assertClean();
});

test('route changes update actual tag render colors without losing another tag', async t => {
  const f = fixture(t);
  assert.equal(f.props('p07-users').color, 'primary');
  await f.route('home_index');
  assert.equal(f.props('p07-users').color, 'default');
  assert.equal(f.props('home_index').color, 'primary');
  await f.route('p07-users');
  assert.equal(f.props('p07-users').color, 'primary');
  assert.equal(f.tagNodes().length, 2); f.assertClean();
});

test('real closePage mutations and util reentry restore a valid empty-child tag', async t => {
  const f = fixture(t);
  f.instance.closePage(null, 'p07-users');
  await Vue.nextTick();
  assert.deepEqual(Array.from(f.state.pageOpenedList, item => item.name), ['home_index']);
  assert.equal(f.props('home_index').color, 'primary');
  f.open('p07-users'); await f.route('p07-users');
  assert.equal(f.props('p07-users').color, 'primary');
  assert.equal(f.tagNodes().length, 2); f.assertClean();
});

test('real A/B menu filtering and app-route replacement drop old maintenance tags', async t => {
  const f = fixture(t);
  const menus = [{id: 'users', name: 'p07-users', path: '/p07-it/users', title: 'Users', frontRoute: 'sys/user-manage/userManage', children: []}];
  const info = role => ({id: `synthetic-${role}`, isSuper: false, sessionProtocol: 'STAGE0_SESSION', stage0: {
    role, capabilities: ['SELF_READ', 'MENU_SELF_READ', ...(role === 'B' ? ['USER_READ'] : [])],
    manageableUserIds: [], roleAIds: [], readMenuIds: [], maintenanceMenuIds: role === 'B' ? ['users'] : []
  }});
  for (const role of ['B', 'A', 'B']) {
    const authority = accessCore.normalizeInfo(info(role));
    const allowed = accessCore.filterMenus(menus, authority);
    f.store.commit('replaceStage0AppRouter', allowed);
    f.store.commit('setTagsList', [home(), ...allowed]);
    f.open('p07-users'); await f.route(role === 'B' ? 'p07-users' : 'home_index');
    assert.equal(f.state.pageOpenedList.some(item => item.name === 'p07-users'), role === 'B');
    assert.equal(accessCore.canRoute(authority, allowed, {name: 'p07-users'}), role === 'B');
    assert.equal(f.tagNodes().length, role === 'B' ? 2 : 1); f.assertClean();
  }
});

test('repeated real openNewPage calls update one tag without duplicate VNode keys', t => {
  const f = fixture(t, {tags: [home()]});
  f.state.tagsList = [home(), users([])];
  for (let index = 0; index < 4; index++) f.open('p07-users', {revision: index});
  const nodes = f.tagNodes();
  assert.equal(nodes.length, 2);
  assert.equal(new Set(nodes.map(node => node.key)).size, nodes.length);
  assert.equal(f.state.pageOpenedList.find(item => item.name === 'p07-users').query.revision, 3); f.assertClean();
});

test('real util openNewPage supports empty, null and absent children in both navigation modes', t => {
  for (const stage0 of [true, false]) {
    const f = fixture(t, {tags: [home()], stage0});
    for (const children of [undefined, null, []]) {
      f.store.commit('removeTag', 'p07-users');
      f.state.tagsList = [home(), users(children)];
      f.open('p07-users');
      assert.ok(f.state.pageOpenedList.some(item => item.name === 'p07-users'));
      f.props('p07-users'); f.assertClean();
    }
    f.store.commit('removeTag', 'p07-users');
    f.state.tagsList = [home(), {name: 'parent', children: [users([])]}];
    f.open('p07-users');
    assert.ok(f.state.pageOpenedList.some(item => item.name === 'p07-users'));
    f.props('p07-users'); f.assertClean();
  }
});
