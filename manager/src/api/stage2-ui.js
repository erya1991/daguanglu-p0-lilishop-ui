import {s1Read,Stage1Error} from './stage1';
import {getRequest} from '@/libs/axios';
import {managerSession} from '@/libs/manager-session';
export const stage2UiRead=(suffix='',params)=>{if(!/^(?:|\/[1-9][0-9]{0,18})$/.test(suffix))throw new Stage1Error('INVALID_OPERATION');return s1Read('/ui/stage2-goods'+suffix,params);};
export const stage2Stores=params=>s1Read('/ui/stage2-stores',params);
export async function stage2Image(goods,file){if(![goods,file].every(v=>/^[1-9][0-9]{0,18}$/.test(v)))throw new Stage1Error('INVALID_OPERATION');const source=managerSession.snapshot();const blob=await getRequest('/p0/s1/goods/'+goods+'/images/'+file,{},'blob');if(!managerSession.sameSession(source))throw new Stage1Error('STALE_OPERATION');if(!(blob instanceof Blob)||!blob.type.startsWith('image/'))throw new Stage1Error('INVALID_RESPONSE');return URL.createObjectURL(blob);}
