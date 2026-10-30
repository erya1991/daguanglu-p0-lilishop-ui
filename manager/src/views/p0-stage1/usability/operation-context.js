import {s1Commands} from '@/api/stage1';
import {managerAccess} from '@/libs/manager-access';
import {managerSession} from '@/libs/manager-session';
import {parent} from './list-state.cjs';
const clients=new Map();
export function operationContext(path){const actor=managerAccess.state.info&&managerAccess.state.info.id,source=managerSession.snapshot(),scope=parent(path),key=actor+':'+source.generation+':'+scope;for(const item of clients.keys())if(!item.startsWith(actor+':'+source.generation+':'))clients.delete(item);if(!clients.has(key))clients.set(key,s1Commands(scope));return clients.get(key);}
export function pendingReference(path){const actor=managerAccess.state.info&&managerAccess.state.info.id;try{const value=JSON.parse(localStorage.getItem('daguanglu:manager:stage1:'+actor+':'+parent(path)+':command')||'null');return value&&typeof value.path==='string'&&/^\/[a-z0-9/-]+$/i.test(value.path)?value.path:null;}catch(_){return null;}}
