'use strict';
const PROTOCOL = 'STAGE0_SESSION';
const stage1 = require('./stage1-access-core.cjs');
const capabilities = new Set(['SELF_READ', 'MENU_SELF_READ', 'PREP_READ', 'USER_READ', 'ROLE_READ',
  'USER_ROLE_READ', 'ROLE_MENU_READ', 'MENU_READ', 'USER_STATUS_WRITE', 'USER_ROLE_WRITE', 'ROLE_MENU_WRITE']);
const pages = {
  'sys/user-manage/userManage': 'USER_READ',
  'sys/role-manage/roleManage': 'ROLE_READ',
  'sys/menu-manage/menu': 'MENU_READ',
  'goods/goods-info/goods': 'PREP_READ',
  'seller/shop/shopList': 'PREP_READ'
};
const prepPages = {
  '/manager/goods/goods/list': ['goods/goods-info/goods', 'manager-goods', '/manager-goods'],
  '/manager/store/store': ['seller/shop/shopList', 'shop', '/shop']
};
function ids(value) {
  return Array.isArray(value) && value.every(id => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id));
}
function normalizeInfo(result, stage1Enabled = false) {
  if (stage1Enabled) return stage1.normalize(result);
  const scope = result && result.stage0;
  if (!result || result.sessionProtocol !== PROTOCOL || !scope || !['A', 'B'].includes(scope.role) ||
      result.isSuper !== false || typeof result.id !== 'string' || !result.id ||
      !Array.isArray(scope.capabilities) || !scope.capabilities.every(cap => capabilities.has(cap)) ||
      !['manageableUserIds', 'roleAIds', 'readMenuIds', 'maintenanceMenuIds'].every(key => ids(scope[key]))) return null;
  return {...result, stage0: {...scope, capabilities: [...scope.capabilities],
    manageableUserIds: [...scope.manageableUserIds], roleAIds: [...scope.roleAIds],
    readMenuIds: [...scope.readMenuIds], maintenanceMenuIds: [...scope.maintenanceMenuIds]}};
}
function has(info, capability) {
  if (info && info.stage1) return stage1.has(info, capability);
  return Boolean(info && info.stage0 && info.stage0.capabilities.includes(capability) &&
    (['SELF_READ', 'MENU_SELF_READ', 'PREP_READ'].includes(capability) || info.stage0.role === 'B'));
}
function canManageUser(info, id, capability) {
  return Boolean(has(info, capability) && id !== info.id && info.stage0.manageableUserIds.includes(id));
}
function canManageRole(info, id) {
  return Boolean(has(info, 'ROLE_MENU_WRITE') && info.stage0.roleAIds.includes(id));
}
function filterMenus(rows, info) {
  if (info && info.stage1) return stage1.menus(rows, info);
  if (!info || !Array.isArray(rows)) return [];
  const allowed = new Set([...info.stage0.readMenuIds, ...(info.stage0.role === 'B' ? info.stage0.maintenanceMenuIds : [])]);
  function visit(items) {
    return items.flatMap(item => {
      if (!item || typeof item.id !== 'string') return [];
      const children = visit(Array.isArray(item.children) ? item.children : []);
      if (children.length) return [{...item, frontRoute: 'Main', children}];
      if (!allowed.has(item.id)) return [];
      let leaf = {...item};
      if (prepPages[item.permission]) {
        const [frontRoute, name, path] = prepPages[item.permission];
        leaf = {...leaf, frontRoute, name, path};
      }
      const capability = pages[leaf.frontRoute];
      if (!capability || !has(info, capability)) return [];
      return [{...leaf, children: []}];
    });
  }
  return visit(rows);
}
function canRoute(info, menus, route) {
  if (info && info.stage1) return stage1.canRoute(info, menus, route);
  if (!info) return false;
  if (route.name === 'home_index') return has(info, 'SELF_READ');
  const entries = [];
  const visit = rows => rows.forEach(row => {
    if (row.children && row.children.length) visit(row.children);
    else entries.push(row);
  });
  visit(menus || []);
  return entries.some(row => pages[row.frontRoute] && has(info, pages[row.frontRoute]) &&
    (row.name === route.name || (route.meta && route.meta.stage0MenuId === row.id)));
}
function createManagerAccess({fetchInfo, fetchMenus, snapshot, sameSession, stage1Enabled = false}) {
  const state = {info: null, menus: [], ready: false};
  let requestVersion = 0;
  function clear() { requestVersion++; state.info = null; state.menus = []; state.ready = false; }
  async function refresh() {
    const ticket = ++requestVersion;
    const source = snapshot();
    state.info = null; state.menus = []; state.ready = false;
    try {
      const infoResponse = await fetchInfo();
      const info = infoResponse && infoResponse.success === true ? normalizeInfo(infoResponse.result, stage1Enabled) : null;
      if (!info || !sameSession(source) || ticket !== requestVersion) return false;
      const menuResponse = await fetchMenus();
      if (!menuResponse || menuResponse.success !== true || !Array.isArray(menuResponse.result) ||
          !sameSession(source) || ticket !== requestVersion) return false;
      state.info = info;
      state.menus = filterMenus(menuResponse.result, info);
      state.ready = true;
      return true;
    } catch (_) { return false; }
  }
  return {state, clear, refresh, has: cap => state.ready && has(state.info, cap),
    canRoute: route => state.ready && canRoute(state.info, state.menus, route),
    canManageUser: (id, cap) => state.ready && canManageUser(state.info, id, cap),
    canManageRole: id => state.ready && canManageRole(state.info, id)};
}
module.exports = {PROTOCOL, normalizeInfo, has, canManageUser, canManageRole, filterMenus, canRoute, createManagerAccess};
