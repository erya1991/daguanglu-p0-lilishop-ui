import {s1Read,Stage1Error} from './stage1';
import {getRequest} from '@/libs/axios';
import {managerSession} from '@/libs/manager-session';
export const uiRead=(path,params)=>s1Read('/ui'+path,params);
export async function uiPreview(id){if(typeof id!=='string'||!/^[1-9][0-9]{0,18}$/.test(id))throw new Stage1Error('INVALID_OPERATION');const source=managerSession.snapshot(),blob=await getRequest('/p0/s1/files/'+id+'/preview',{},'blob');if(!managerSession.sameSession(source))throw new Stage1Error('STALE_OPERATION');if(!(blob instanceof Blob)||!['image/png','image/jpeg','image/webp','application/pdf'].includes(blob.type))throw new Stage1Error('INVALID_RESPONSE');return {url:URL.createObjectURL(blob),mimeType:blob.type,size:blob.size};}
