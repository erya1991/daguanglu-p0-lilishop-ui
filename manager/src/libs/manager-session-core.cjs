'use strict';

// Existing Manager responses reuse 20004 for an unrelated brand error. A code
// alone is therefore insufficient evidence that authentication has expired.
const expiredMessages = new Set([
  '登录已失效，请重新登录',
  '未登录或token失效',
  '用户已退出，请重新登录'
]);

function failureKind(status, data, stage0 = false) {
  if (Number(status) === 401) return 'expired';
  if (!data || data.success !== false) return Number(status) === 403 ? 'forbidden' : 'other';
  const code = Number(data.code);
  if (stage0) return code === 403 && data.message === 'SESSION_AUTH_INVALID' ? 'expired' :
    (Number(status) === 403 || code === 403 || code === 20005 ? 'forbidden' : 'other');
  if ((code === 403 || code === 20004 || code === 401) && expiredMessages.has(data.message)) {
    return 'expired';
  }
  if (Number(status) === 403 || code === 403 || code === 20005 || data.message === '权限不足') {
    return 'forbidden';
  }
  return 'other';
}

function credentialEndpoint(url) {
  const path = String(url || '').split(/[?#]/)[0];
  return /\/passport\/user\/(?:login|logout|refresh)$/.test(path) || /\/passport\/user\/refresh\//.test(path);
}

function replayable(method) {
  return /^(GET|HEAD)$/.test(String(method || 'GET').toUpperCase());
}

function validPair(tokens) {
  return tokens && typeof tokens.accessToken === 'string' && tokens.accessToken.length > 0 &&
    typeof tokens.refreshToken === 'string' && tokens.refreshToken.length > 0;
}

function createManagerSession({readTokens, writeTokens, clearTokens, onExpired = () => {}, acceptsProtocol = () => true}) {
  let generation = 0;
  let revision = 0;
  let flight = null;
  let knownTokens = {...readTokens()};

  function currentTokens() {
    const current = readTokens();
    // Account changes in another tab do not pass through this instance's login
    // methods. Treat an unrecognized storage pair as a new generation, without
    // deleting that other tab's credentials.
    if (current.accessToken !== knownTokens.accessToken || current.refreshToken !== knownTokens.refreshToken) {
      generation++;
      revision = 0;
      flight = null;
      knownTokens = {...current};
    }
    return current;
  }

  function commitTokens(tokens) {
    writeTokens(tokens);
    knownTokens = {...readTokens()};
    revision++;
  }

  function snapshot() {
    const current = currentTokens();
    return {...current, generation, revision};
  }

  function sameSession(source) {
    const current = currentTokens();
    return Boolean(source && source.generation === generation && validPair(source) && validPair(current) &&
      (source.revision < revision ||
        (source.accessToken === current.accessToken && source.refreshToken === current.refreshToken)));
  }

  function exactSnapshot(source) {
    const current = currentTokens();
    return Boolean(source && source.generation === generation && source.revision === revision &&
      source.accessToken === current.accessToken && source.refreshToken === current.refreshToken);
  }

  function invalidate() {
    generation++;
    revision = 0;
    flight = null;
    clearTokens();
    knownTokens = {...readTokens()};
    return generation;
  }

  function expire(source) {
    if (!exactSnapshot(source)) return false;
    invalidate();
    onExpired();
    return true;
  }

  function beginLogin() {
    return invalidate();
  }

  function acceptLogin(attempt, tokens) {
    currentTokens();
    if (attempt !== generation || !validPair(tokens) || !acceptsProtocol(tokens)) return false;
    commitTokens({accessToken: tokens.accessToken, refreshToken: tokens.refreshToken});
    return true;
  }

  function recover(source, sendRefresh) {
    if (!sameSession(source) || !validPair(source)) return Promise.resolve(false);
    const current = snapshot();
    // Another request has already rotated the same session; reuse its result.
    if (source.revision < current.revision) return Promise.resolve(true);
    if (source.accessToken !== current.accessToken || source.refreshToken !== current.refreshToken) {
      return Promise.resolve(false);
    }
    if (flight) return flight.promise;
    const pending = {generation, promise: null};
    flight = pending;
    pending.promise = Promise.resolve().then(() => {
      if (!sameSession(source)) return null;
      return sendRefresh(source.refreshToken);
    }).then(response => {
      if (!exactSnapshot(source)) return false;
      if (!response || response.success !== true || !validPair(response.result) || !acceptsProtocol(response.result)) {
        expire(source);
        return false;
      }
      commitTokens({accessToken: response.result.accessToken, refreshToken: response.result.refreshToken});
      return true;
    }).catch(() => {
      expire(source);
      return false;
    }).finally(() => {
      if (flight === pending) flight = null;
    });
    return pending.promise;
  }

  return {snapshot, sameSession, invalidate, expire, beginLogin, acceptLogin, recover};
}

module.exports = {createManagerSession, failureKind, credentialEndpoint, replayable};
