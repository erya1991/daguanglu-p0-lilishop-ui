'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../src/libs/manager-session-core.cjs');

const initial = {accessToken: 'synthetic-access-a', refreshToken: 'synthetic-refresh-a'};
const rotated = {accessToken: 'synthetic-access-b', refreshToken: 'synthetic-refresh-b'};
const expired = {success: false, code: 403, message: '登录已失效，请重新登录'};
const denied = {success: false, code: 403, message: '权限不足'};
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function fixture() {
  let tokens = {...initial};
  let clears = 0;
  const session = core.createManagerSession({
    readTokens: () => ({...tokens}),
    writeTokens: value => { tokens = {...value}; },
    clearTokens: () => { clears++; tokens = {accessToken: '', refreshToken: ''}; }
  });
  return {session, tokens: () => tokens, clears: () => clears, externalChange: value => { tokens = {...value}; }};
}

test('ordinary 403 and HTTP-200 permission rejection are not authentication expiry', () => {
  assert.equal(core.failureKind(403, denied), 'forbidden');
  assert.equal(core.failureKind(200, {...denied, code: 400}), 'forbidden');
  assert.equal(core.failureKind(200, {...denied, code: 20005}), 'forbidden');
  assert.equal(core.failureKind(403, undefined), 'forbidden');
});
test('duplicate 20004 brand code cannot log a Manager out', () => {
  assert.equal(core.failureKind(200, {success: false, code: 20004, message: '品牌不存在'}), 'other');
  assert.equal(core.failureKind(200, {success: false, code: 20004, message: '用户已退出，请重新登录'}), 'expired');
});
test('actual legacy expiration messages and HTTP-401 are recognized', () => {
  assert.equal(core.failureKind(403, expired), 'expired');
  assert.equal(core.failureKind(200, {...expired, message: '未登录或token失效'}), 'expired');
  assert.equal(core.failureKind(401, undefined), 'expired');
});
test('credential endpoints are excluded and only GET/HEAD are replayable', () => {
  for (const url of ['/passport/user/login', '/api/manager/passport/user/logout', '/passport/user/refresh/synthetic']) {
    assert.equal(core.credentialEndpoint(url), true);
  }
  assert.equal(core.credentialEndpoint('/permission/role'), false);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(core.replayable(method), false);
  assert.equal(core.replayable('get'), true);
  assert.equal(core.replayable('HEAD'), true);
});
test('concurrent refresh uses one promise and one token rotation', async () => {
  const f = fixture(); const pending = deferred(); let calls = 0;
  const source = f.session.snapshot();
  const send = token => { assert.equal(token, initial.refreshToken); calls++; return pending.promise; };
  const first = f.session.recover(source, send);
  const second = f.session.recover(source, send);
  assert.equal(first, second);
  await Promise.resolve(); assert.equal(calls, 1);
  pending.resolve({success: true, result: rotated});
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(f.tokens(), rotated);
});
test('late refresh after logout never revives credentials', async () => {
  const f = fixture(); const pending = deferred();
  const request = f.session.recover(f.session.snapshot(), () => pending.promise);
  await Promise.resolve(); f.session.invalidate();
  pending.resolve({success: true, result: rotated});
  assert.equal(await request, false);
  assert.equal(f.tokens().accessToken, ''); assert.equal(f.tokens().refreshToken, '');
});
test('old account refresh cannot replace a new account login', async () => {
  const f = fixture(); const pending = deferred();
  const request = f.session.recover(f.session.snapshot(), () => pending.promise);
  await Promise.resolve();
  const attempt = f.session.beginLogin();
  const next = {accessToken: 'synthetic-next-user-access', refreshToken: 'synthetic-next-user-refresh'};
  assert.equal(f.session.acceptLogin(attempt, next), true);
  pending.resolve({success: true, result: rotated});
  assert.equal(await request, false); assert.deepEqual(f.tokens(), next);
});
test('a different browser tab changing storage cannot be overwritten by a pending refresh', async () => {
  const f = fixture(); const pending = deferred(); const source = f.session.snapshot();
  const request = f.session.recover(source, () => pending.promise);
  await Promise.resolve();
  const next = {accessToken: 'synthetic-other-tab-access', refreshToken: 'synthetic-other-tab-refresh'};
  f.externalChange(next);
  pending.resolve({success: true, result: rotated});
  assert.equal(await request, false); assert.equal(f.session.expire(source), false);
  assert.deepEqual(f.tokens(), next);
});
test('old userinfo and menu snapshots remain invalid after rotation followed by external account switch', async () => {
  const f = fixture(); const source = f.session.snapshot();
  await f.session.recover(source, () => ({success: true, result: rotated}));
  assert.equal(f.session.sameSession(source), true);
  f.externalChange({accessToken: 'synthetic-external-access', refreshToken: 'synthetic-external-refresh'});
  assert.equal(f.session.sameSession(source), false);
  assert.equal(f.session.expire(source), false);
  assert.equal(f.tokens().accessToken, 'synthetic-external-access');
});
test('old login completion and old failure cannot clear or replace a new account', () => {
  const f = fixture(); const first = f.session.beginLogin();
  const old = f.session.snapshot(); const next = f.session.beginLogin();
  assert.equal(f.session.acceptLogin(next, rotated), true);
  assert.equal(f.session.acceptLogin(first, initial), false);
  assert.equal(f.session.expire(old), false);
  assert.deepEqual(f.tokens(), rotated);
});
test('refresh rejection and malformed success clear current credentials', async () => {
  for (const send of [() => Promise.reject(new Error('synthetic-offline')), () => ({success: true, result: {accessToken: 'synthetic-only'}})]) {
    const f = fixture();
    assert.equal(await f.session.recover(f.session.snapshot(), send), false);
    assert.equal(f.clears(), 1); assert.equal(f.tokens().refreshToken, '');
  }
});
test('an already rotated request reuses current credentials without consuming refresh twice', async () => {
  const f = fixture(); const source = f.session.snapshot(); let calls = 0;
  const send = () => { calls++; return {success: true, result: rotated}; };
  assert.equal(await f.session.recover(source, send), true);
  assert.equal(await f.session.recover(source, send), true);
  assert.equal(calls, 1);
});

// Execute the actual axios interceptor source with an isolated transport. No
// network, browser, real tokens, database or authorization fixtures are used.
function axiosFixture(transport, refresh = () => ({success: true, result: rotated})) {
  const f = fixture(); const calls = []; const messages = []; const navigations = [];
  let before; let fulfilled; let rejected; let refreshCalls = 0;
  const service = config => Promise.resolve(config).then(before).then(cfg => {
    calls.push(cfg);
    return Promise.resolve().then(() => transport(cfg, calls.length)).then(
      result => ({status: 200, ...result, config: cfg}),
      error => { error.config = cfg; if (error.response) error.response.config = cfg; throw error; }
    );
  }).then(fulfilled, rejected);
  service.interceptors = {
    request: {use: fn => { before = fn; }},
    response: {use: (yes, no) => { fulfilled = yes; rejected = no; }}
  };
  const sourceFile = path.resolve(__dirname, '../src/libs/axios.js');
  const source = fs.readFileSync(sourceFile, 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export \{[^\n]*\};\r?\n/gm, '')
    .replace(/export const /g, 'const ');
  const context = {
    module: {exports: {}}, Promise, Error, Date,
    axios: {create: () => service},
    managerSession: f.session,
    failureKind: core.failureKind, credentialEndpoint: core.credentialEndpoint, replayable: core.replayable,
    getStore: key => f.tokens()[key] || '', setStore: () => {},
    router: {history: {current: {name: 'user-manage'}}, push: value => navigations.push(value)},
    Message: {error: message => messages.push(message)},
    handleRefreshToken: token => { refreshCalls++; return refresh(token); },
    uuidv4: () => 'synthetic-ui-request-id', localDevelopment: {enabled: false},
    commonUrl: '', managerUrl: '', commonApiPath: '', uploadFile: ''
  };
  vm.runInNewContext(source + '\nmodule.exports={getRequest,postRequest,putRequest,deleteRequest};', context, {filename: sourceFile});
  return {...f, calls, messages, navigations, api: context.module.exports, refreshCalls: () => refreshCalls};
}
function httpError(status, data) { return Object.assign(new Error('synthetic-http-failure'), {response: {status, data}}); }
async function waitForRefresh(f) {
  for (let attempt = 0; attempt < 100 && f.refreshCalls() === 0; attempt++) await Promise.resolve();
  assert.notEqual(f.refreshCalls(), 0, 'expected the synthetic transport to enter refresh');
}

test('actual interceptor returns HTTP-200 permission rejection without refresh', async () => {
  const f = axiosFixture(() => ({data: denied}));
  const result = await f.api.getRequest('/permission/role');
  assert.equal(result.success, false); assert.equal(f.refreshCalls(), 0); assert.equal(f.calls.length, 1);
  assert.deepEqual(f.tokens(), initial);
});
test('actual interceptor rejects forbidden HTTP-403 without refreshing or clearing session', async () => {
  const f = axiosFixture(() => { throw httpError(403, denied); });
  await assert.rejects(f.api.getRequest('/permission/role'));
  assert.equal(f.refreshCalls(), 0); assert.equal(f.calls.length, 1); assert.deepEqual(f.tokens(), initial);
});
test('actual interceptor does not confuse brand 20004 with expiration', async () => {
  const f = axiosFixture(() => ({data: {success: false, code: 20004, message: '品牌不存在'}}));
  assert.equal((await f.api.getRequest('/unrelated-read')).success, false);
  assert.equal(f.refreshCalls(), 0); assert.deepEqual(f.tokens(), initial);
});
test('actual expired GET refreshes once and retries with the new Access', async () => {
  const f = axiosFixture((config, call) => call === 1 ? {data: expired} : {data: {success: true}});
  assert.equal((await f.api.getRequest('/passport/user/info')).success, true);
  assert.equal(f.refreshCalls(), 1); assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].headers.accessToken, rotated.accessToken);
});
test('second expiration terminates without looping or further refresh', async () => {
  const f = axiosFixture(() => { throw httpError(403, expired); });
  await assert.rejects(f.api.getRequest('/passport/user/info'));
  assert.equal(f.calls.length, 2); assert.equal(f.refreshCalls(), 1); assert.equal(f.tokens().accessToken, '');
});
test('expired non-idempotent writes are not refreshed or replayed', async () => {
  for (const method of ['postRequest', 'putRequest', 'deleteRequest']) {
    const f = axiosFixture(() => { throw httpError(403, expired); });
    await assert.rejects(f.api[method]('/permission/not-authorized', {}));
    assert.equal(f.calls.length, 1); assert.equal(f.refreshCalls(), 0); assert.equal(f.tokens().refreshToken, '');
  }
});
test('HTTP-200 expired write keeps its failure semantics without replay', async () => {
  const f = axiosFixture(() => ({data: expired}));
  assert.equal((await f.api.postRequest('/permission/not-authorized', {})).success, false);
  assert.equal(f.calls.length, 1); assert.equal(f.refreshCalls(), 0); assert.equal(f.tokens().accessToken, '');
});
test('authentication endpoints cannot recursively refresh', async () => {
  for (const endpoint of ['/passport/user/login', '/passport/user/logout', '/passport/user/refresh/synthetic']) {
    const f = axiosFixture(() => { throw httpError(403, expired); });
    await assert.rejects(f.api.getRequest(endpoint));
    assert.equal(f.calls.length, 1); assert.equal(f.refreshCalls(), 0);
  }
});
test('logout can send the captured old Access after local invalidation without being rejected by the request guard', async () => {
  const f = axiosFixture(config => {
    assert.equal(config.headers.accessToken, initial.accessToken);
    return {data: {success: true}};
  });
  const accessToken = f.session.snapshot().accessToken;
  f.session.invalidate();
  assert.equal((await f.api.postRequest('/passport/user/logout', {}, {accessToken})).success, true);
  assert.equal(f.tokens().accessToken, ''); assert.equal(f.refreshCalls(), 0);
});
test('pending interceptor refresh cannot replay a read after logout', async () => {
  const pending = deferred();
  const f = axiosFixture(() => { throw httpError(403, expired); }, () => pending.promise);
  const request = f.api.getRequest('/passport/user/info');
  await waitForRefresh(f);
  f.session.invalidate(); pending.resolve({success: true, result: rotated});
  await assert.rejects(request);
  assert.equal(f.calls.length, 1); assert.equal(f.tokens().accessToken, '');
});
test('two expired reads share one interceptor refresh', async () => {
  const pending = deferred();
  const f = axiosFixture(config => config.__managerRetried ? {data: {success: true}} : {data: expired}, () => pending.promise);
  const first = f.api.getRequest('/passport/user/info');
  const second = f.api.getRequest('/permission/menu/memberMenu');
  await waitForRefresh(f);
  pending.resolve({success: true, result: rotated});
  const results = await Promise.all([first, second]);
  assert.equal(results.every(result => result.success), true);
  assert.equal(f.refreshCalls(), 1); assert.equal(f.calls.length, 4);
});
