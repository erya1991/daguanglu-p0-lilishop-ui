import {userInfo, getCurrentPermissionList} from '@/api/index';
import {managerSession} from './manager-session';
import {createManagerAccess} from './manager-access-core.cjs';

export const stage0ManagerEnabled = typeof BASE !== 'undefined' && BASE.stage0ManagerSessionEnabled === true;
export const managerAccess = createManagerAccess({
  fetchInfo: () => userInfo(), fetchMenus: () => getCurrentPermissionList(),
  snapshot: managerSession.snapshot, sameSession: managerSession.sameSession
});
