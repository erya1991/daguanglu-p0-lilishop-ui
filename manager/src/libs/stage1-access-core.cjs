'use strict';
const pages = {
  applications: ['admission.review', 'seller/shop/shopList'], stores: ['store.read', 'seller/shop/shopList'],
  agreements: ['agreement.read', 'p0-stage1/agreements'], eligibility: ['store.read', 'p0-stage1/eligibility'],
  'channel-configs': ['channel.configure', 'p0-stage1/channel-configs'], submerchants: ['channel.onboard', 'p0-stage1/submerchants'],
  receivers: ['channel.receiver', 'p0-stage1/receivers'], 'commission-rules': ['rule.read', 'p0-stage1/commission-rules'],
  categories: ['catalog.configure', 'goods/goods-manage/category'], units: ['catalog.configure', 'goods-unit/index'],
  reviews: ['goods.review', 'goods/goods-info/goodsApply'], goods: ['goods.read', 'goods/goods-info/goods'],
  fulfillment: ['fulfillment.inspect', 'p0-stage1/fulfillment']
};
const actions = new Set(['admission.review','store.read','store.supervise','agreement.read','agreement.write','rule.read','rule.write','channel.configure','channel.onboard','channel.receiver','catalog.configure','goods.read','goods.review','goods.supervise','fulfillment.inspect']);
function normalize(result) {
  const scope = result && result.stage1;
  if (!scope || result.sessionProtocol !== 'STAGE0_SESSION' || result.isSuper !== false || typeof result.id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(result.id)
      || !Array.isArray(scope.permissions) || !scope.permissions.every(a => actions.has(a)) || typeof scope.authVersion !== 'string' || !/^[a-f0-9]{64}$/.test(scope.authVersion)
      || !['DEV','TEST','PROD'].includes(scope.environment) || !['MOCK','REAL'].includes(scope.mode)
      || (scope.environment === 'PROD' && scope.mode === 'MOCK')) return null;
  return {...result, stage1: {...scope, permissions: [...new Set(scope.permissions)]}};
}
function has(info, action) { return Boolean(info && info.stage1 && (['SELF_READ','MENU_SELF_READ'].includes(action) || info.stage1.permissions.includes(action))); }
function menus(rows, info) {
  if (!Array.isArray(rows) || !info || !info.stage1) return [];
  const children = [];
  const visit = items => items.forEach(item => {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item.children) && item.children.length) return visit(item.children);
    const key = typeof item.name === 'string' && item.name.startsWith('s1-') ? item.name.slice(3) : '';
    const spec = pages[key];
    if (!spec || item.id !== 's1-' + key || item.path !== '/s1/' + key || item.frontRoute !== spec[1] || item.permission !== 's1.' + spec[0] || !has(info, spec[0]) || children.some(c => c.id === item.id)) return;
    children.push({...item, children: []});
  });
  visit(rows);
  const groups=children.length?[{id:'s1-management',name:'s1-management',title:'Stage1 商城',path:'/s1',frontRoute:'Main',level:1,children}]:[];
  groups.push(...require('./stage3-access-core.cjs').menus(rows,info));
  groups.push(...require('./stage45-access-core.cjs').menus(rows,info));
  return groups.length?[{id:'s1-root',name:'s1-root',title:'商城管理',level:0,children:groups}]:[];
}
function canRoute(info, rows, route) {
  if (!info || !info.stage1) return false;
  if (route.name === 'home_index') return has(info,'SELF_READ');
  const valid = menus(rows, info), parent = (require('../router/stage1-details.cjs').parent(route)||require('../router/stage2-ui.cjs').parent(route)||require('./stage3-access-core.cjs').parent(route)||require('./stage45-access-core.cjs').parent(route));return valid.some(root => root.children.some(group => group.children.some(item => item.name === (parent || route.name) && route.meta && route.meta.stage0MenuId === item.id)));
}
module.exports = {pages,normalize,has,menus,canRoute};
