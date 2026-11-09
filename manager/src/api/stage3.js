import {getRequest} from '@/libs/axios';
import {managerSession} from '@/libs/manager-session';
import {Stage1Error,unwrap} from './stage1-core.cjs';
export const stage3Enabled=typeof BASE!=='undefined'&&BASE.stage3Enabled===true;
export async function stage3Read(path,params={}) {
 if(!stage3Enabled||!/^\/(?:trades|orders\/[1-9][0-9]{0,18}|verifications(?:\/[1-9][0-9]{0,18})?)$/.test(path))throw new Stage1Error('INVALID_OPERATION');
 const source=managerSession.snapshot();
 try{const result=unwrap(await getRequest('/p0/s3'+path,Object.fromEntries(Object.entries(params).filter(([,v])=>v!==''&&v!=null))));if(!managerSession.sameSession(source))throw new Stage1Error('STALE_OPERATION');return result;}
 catch(error){if(!managerSession.sameSession(source))throw new Stage1Error('STALE_OPERATION');if(error instanceof Stage1Error)throw error;throw new Stage1Error(error.response?.data?.code||'STORAGE_UNAVAILABLE',error.response?.status);}
}
