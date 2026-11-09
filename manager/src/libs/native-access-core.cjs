'use strict';
// Existing compiled components only. Menu IDs, titles, order and parents stay in native persistence.
const pages=[
 ['users','后台账号','sys/user-manage/userManage','/manager/passport/user/*'],
 ['roles','角色管理','sys/role-manage/roleManage','/manager/permission/role*'],
 ['menus','菜单管理','sys/menu-manage/menuManage','/manager/permission/menu*'],
 ['departments','部门管理','sys/department-manage/departmentManage','/manager/permission/department*'],
 ['settings','系统设置','sys/setting-manage/settingManage','/manager/setting/setting/*'],
 ['notice','消息模板','sys/message/noticeMessageTemplate','/manager/setting/messageTemplate/*'],
 ['sms','短信配置','sys/message/sms','/manager/sms/*'],
 ['sms-sign','短信签名','sys/message/sms','/manager/sms/sign/*'],
 ['regions','地区管理','region/index','/manager/setting/region/*'],
 ['logistics','物流公司','logistics/index','/manager/other/logistics*'],
 ['words','敏感词','sensitive-words/index','/manager/other/sensitiveWords*'],
 ['files','文件管理','sys/oss-manage/ossManage','/manager/common/file*'],
 ['versions','版本管理','sys/app-version/appVersion','/manager/other/appVersion*'],
 ['captcha','验证码管理','sys/slider/slider','/manager/other/verificationSource*'],
 ['logs','操作日志','sys/log-manage/logManage','/manager/setting/log*']
];
const enabled=()=>typeof BASE!=='undefined'&&BASE.p0IntegrationEnabled===true;
function active(info){return enabled()&&!!(info&&info.nativeAccess&&info.nativeAccess.integration===true);}
function normalize(info){
 const native=info&&info.nativeAccess;
 if(!enabled()||!native||native.integration!==true||!Array.isArray(native.permissions)||!native.permissions.every(g=>g&&typeof g.permission==='string'&&typeof g.write==='boolean'))return null;
 const value=require('./stage1-access-core.cjs').normalize(info);
 return value?{...value,nativeAccess:{integration:true,permissions:native.permissions.map(g=>({...g}))}}:null;
}
function match(pattern,path){let previous=0;const parts=pattern.split('*');for(let i=0;i<parts.length;i++){const part=parts[i],at=path.indexOf(part,previous);if(at<0||i===0&&at!==0)return false;previous=at+part.length;}return parts.length>1&&parts[parts.length-1]===''||previous===path.length;}
function grants(info,method,path){
 if(path==='/manager/common/upload/file')path='/manager/common/file';
 if(!active(info))return false;
 return info.nativeAccess.permissions.some(g=>(method==='GET'||g.write)&&g.permission.split(',').some(p=>p.startsWith('/manager/')&&match(p.trim(),path)));
}
function action(info,permission){
 const [prefix,...rest]=permission.split('.'),action=rest.join('.');
 if(prefix==='s1')return info.stage1.permissions.includes(action);
 if(prefix==='s3')return (info.stage1.stage3&&info.stage1.stage3.permissions||[]).includes(action);
 if(prefix==='s45')return (info.stage1.stage45&&info.stage1.stage45.permissions||[]).includes(action);
 return info.nativeAccess.permissions.some(g=>g.permission===permission);
}
function menus(rows,info){
 if(!active(info)||!Array.isArray(rows))return [];
 const stage1=require('./stage1-access-core.cjs').pages,stage3=require('./stage3-access-core.cjs').definitions,stage45=require('./stage45-access-core.cjs').definitions;
 const seen=new Set();
 function visit(items){return items.flatMap(row=>{
  if(!row||typeof row.id!=='string'||seen.has(row.id)||typeof row.name!=='string'||!/^[-a-zA-Z0-9_]+$/.test(row.name))return [];seen.add(row.id);
  const children=visit(Array.isArray(row.children)?row.children:[]);
  if(children.length)return [{...row,frontRoute:'Main',children}];
  let valid=pages.some(p=>row.name==='uat-'+p[0]&&row.frontRoute===p[2]&&row.path==='/settings/'+p[0]&&row.permission===p[3]);
  for(const [key,spec]of Object.entries(stage1))if(row.name==='s1-'+key&&row.path==='/s1/'+key&&row.frontRoute===spec[1]&&row.permission==='s1.'+spec[0])valid=true;
  for(const [prefix,defs]of [['s3',stage3],['s45',stage45]])for(const [key,spec]of Object.entries(defs))if(row.name===prefix+'-'+key&&row.path==='/'+prefix+'/'+key&&row.frontRoute==='p0-stage'+prefix.slice(1)+'/'+spec[2]&&row.permission===prefix+'.'+spec[0])valid=true;
  return valid&&action(info,row.permission)?[{...row,children:[]}]:[];
 });}
 return visit(rows);
}
function canRoute(info,rows,route){
 if(!active(info))return false;
 if(route.name==='home_index')return true;
 let leaves=[];function visit(items){for(const row of items)row.children&&row.children.length?visit(row.children):leaves.push(row);}visit(menus(rows,info));
 return leaves.some(row=>route.meta&&route.meta.stage0MenuId===row.id&&(route.name===row.name||route.name===row.name+'-detail'&&new RegExp('^'+row.path+'/[1-9][0-9]{0,18}$').test(route.path||'')||route.name==='s2-goods-detail'&&row.name==='s1-goods'&&/^\/s1\/goods\/[1-9][0-9]{0,18}$/.test(route.path||'')));
}
function profileCookie(info){
 const result={id:String(info.id||''),isSuper:info.isSuper===true,status:info.status===true};
 for(const key of ['username','nickName'])if(typeof info[key]==='string')result[key]=info[key].slice(0,100);
 if(typeof info.avatar==='string'&&info.avatar.length<=512)result.avatar=info.avatar;
 return JSON.stringify(result);
}
function accountPayload(input,create){
 const result={};
 for(const key of ["username","nickName","mobile","email","description","avatar","departmentId"])if(Object.prototype.hasOwnProperty.call(input,key))result[key]=input[key];
 if(create)result.password=input.password;else result.id=input.id;
 if(Array.isArray(input.roles))result.roles=input.roles.length?input.roles.slice():"";
 return result;
}
function messageTemplatePayload(input,mp){return mp?{enable:input.enable===true}:{enable:input.enable===true,first:input.first||"",remark:input.remark||""};}
module.exports={messageTemplatePayload,accountPayload,profileCookie,pages,enabled,active,normalize,grants,menus,canRoute};
