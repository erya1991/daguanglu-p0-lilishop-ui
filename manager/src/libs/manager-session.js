import {getStore, setStore, removeStore} from './storage';
import Cookies from 'js-cookie';
import {createManagerSession} from './manager-session-core.cjs';

const stage0Enabled = typeof BASE !== 'undefined' && BASE.stage0ManagerSessionEnabled === true;
// Each opt-in mode accepts only its matching server protocol, without fallback.
export const managerSession = createManagerSession({
  acceptsProtocol: tokens => stage0Enabled ? tokens.sessionProtocol === 'STAGE0_SESSION' : tokens.sessionProtocol !== 'STAGE0_SESSION',
  readTokens: () => ({accessToken: getStore('accessToken'), refreshToken: getStore('refreshToken')}),
  writeTokens: tokens => {
    setStore('accessToken', tokens.accessToken);
    setStore('refreshToken', tokens.refreshToken);
  },
  clearTokens: () => {
    ['accessToken', 'refreshToken', 'menuData', 'currNav'].forEach(removeStore);
    Cookies.remove('userInfoManager');
  }
});
