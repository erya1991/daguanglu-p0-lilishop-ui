'use strict';
// Development has one explicit local origin. Production continues to use public/config.js.
const enabled = process.env.NODE_ENV === 'development';
const apiPrefix = '/api';
const managerPrefix = apiPrefix + '/manager';
const target = 'http://127.0.0.1:18887';
function allowedRequest(config) {
  const raw = config.url || '';
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw)) return false;
  const base = config.baseURL || managerPrefix;
  if (base !== managerPrefix) return false;
  // The request interceptor strips a full /api/manager prefix before Axios joins baseURL.
  const path = raw.startsWith(apiPrefix + '/') ? raw : managerPrefix + '/' + raw.replace(/^\/+/, '');
  return path.startsWith(managerPrefix + '/') && !/\\|%2e|%2f|%5c|%25|(?:^|\/)\.\.(?:\/|$)/i.test(path);
}
function localMenus(rows) {
  const leaves = [];
  const visit = items => (items || []).forEach(item => {
    if (item.children && item.children.length) visit(item.children);
    else leaves.push(item);
  });
  visit(rows);
  const mappings = [
    ['/manager/goods/goods/list', 'manager-goods', '商品列表', 'goods/goods-info/goods'],
    ['/manager/store/store', 'shop', '店铺列表', 'seller/shop/shopList']
  ];
  const children = mappings.flatMap(([permission, name, title, frontRoute]) => {
    const source = leaves.find(item => item.permission === permission);
    return source ? [{...source, name, title, frontRoute, path: '/' + name, level: 2, children: []}] : [];
  });
  if (!children.length) return [];
  return [{id: 'local-development', name: 'local-development', title: '本地联调', level: 0, children: [
    {id: 'local-read', name: 'local-read', title: '只读查询', path: '/local-read', frontRoute: 'Main', level: 1, children}
  ]}];
}
module.exports = {enabled, apiPrefix, managerPrefix, target, allowedRequest, localMenus};
