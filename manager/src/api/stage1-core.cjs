'use strict';
const messages={ORIGINAL_INPUT_UNAVAILABLE:'原提交内容未保存在本机，请回查或核实并关闭未提交请求。',OPERATION_ABANDONED:'未提交请求已由服务端关闭，业务资料未改变，可重新填写提交。',OPERATION_STORAGE_UNAVAILABLE:'无法保存操作标识，尚未发出请求。',VERSION_CONFLICT:'资料已被更新，请保留输入并读取最新版本。',REVIEW_VERSION_CONFLICT:'审核内容已变化，请重新核对。',IDEMPOTENCY_CONFLICT:'该操作标识已用于其他内容，请回查原操作。',BASIC_NOT_ELIGIBLE:'经营基础条件未满足，请查看资格原因。',CHANNEL_PENDING:'真实渠道条件待核验。',RESOURCE_NOT_FOUND:'对象不存在或不在可访问范围。',FIELD_INVALID:'请检查表单中的必填项和格式。',GOODS_REVIEW_PENDING:'商品正在审核，暂不能修改内容。',UNIQUE_CONFLICT:'编号或业务关系已存在，请核对。',STORAGE_UNAVAILABLE:'资料服务暂不可用。',SESSION_REJECTED:'会话或当前权限已变化，请重新核对登录。',UNKNOWN:'提交结果尚未确认，请回查本次操作。',STALE_OPERATION:'登录身份已变化，请在当前身份下重新读取。'};
Object.assign(messages,{RECEIPT_PERMISSION_CHANGED:'当前权限已变化，原操作事实仍保留；请由有权人员核对业务结果。',PAYMENT_APPLICATION_MISMATCH:'付款 AppID 须与服务端住户应用一致，请核对受控配置。',CHANNEL_ENVIRONMENT_INVALID:'当前环境不允许此渠道模式。'});
class Stage1Error extends Error {constructor(code,status=0,detail=null,unknown=false){super(messages[code]||(status===403?'当前账号无权执行此操作。':status===422?'请检查字段、范围和业务条件。':status===409?'当前状态不允许此操作，请读取最新资料。':'服务暂不可用，请稍后重试。'));this.code=code;this.status=status;this.detail=detail;this.unknown=unknown;}}
function unwrap(value){if(value&&value.success===false)throw new Stage1Error(value.code||'BUSINESS_REJECTED',Number(value.code)>=400&&Number(value.code)<=599?Number(value.code):422,value);if(!value||value.success!==true||!['SUCCESS',200].includes(value.code))throw new Stage1Error('INVALID_RESPONSE',502,null,true);return value.result;}
function createCommands({send,read,snapshot,sameSession,requestId,journal=null}){
  const pending=new Map();
  function find(key){if(pending.has(key))return pending.get(key);if(!journal)return null;const saved=journal.get(key);if(!saved)return null;if(saved.schema!==1||typeof saved.requestId!=='string'||!/^[A-Za-z0-9_-]{8,64}$/.test(saved.requestId)||!/^\/[A-Za-z0-9/-]+$/.test(saved.path)||!['POST','PUT'].includes(saved.method))throw new Stage1Error('INVALID_OPERATION');const operation={method:saved.method,path:saved.path,body:{requestId:saved.requestId},source:snapshot(),restored:true};pending.set(key,operation);return operation;}
  function forget(key){pending.delete(key);if(journal)journal.remove(key);}
  async function dispatch(key,operation){
    if(operation.restored)throw new Stage1Error('ORIGINAL_INPUT_UNAVAILABLE',409);
    try{const result=unwrap(await send(operation.method,operation.path,operation.body));if(!sameSession(operation.source))throw new Stage1Error('STALE_OPERATION');forget(key);return result;}
    catch(error){if(error.code==='STALE_OPERATION'){pending.delete(key);throw error;}const response=error.response,body=response&&response.data,status=response&&response.status||error.status||0;const unknown=error.unknown||!status||status>=500;if(!unknown)forget(key);throw new Stage1Error(unknown?'UNKNOWN':body&&body.code||error.code,status,body||error.detail,unknown);}
  }
  function resolved(key,operation,result){if(!sameSession(operation.source))throw new Stage1Error('STALE_OPERATION');if(result.status==='ABANDONED'){forget(key);throw new Stage1Error('OPERATION_ABANDONED',409)}if(result.status!=='COMMITTED')throw new Stage1Error('UNKNOWN',0,null,true);forget(key);return result.result;}
  return {
    pending:key=>Boolean(find(key)),
    async run(key,method,path,body){if(find(key))throw new Stage1Error('UNKNOWN',0,null,true);const operation={method,path,body:{...JSON.parse(JSON.stringify(body)),requestId:requestId()},source:snapshot()};if(journal)journal.set(key,{schema:1,method,path,requestId:operation.body.requestId});pending.set(key,operation);return dispatch(key,operation);},
    async query(key){const operation=find(key);if(!operation)return null;if(!sameSession(operation.source)){pending.delete(key);throw new Stage1Error('STALE_OPERATION');}return resolved(key,operation,unwrap(await read('/operations/'+operation.body.requestId)));},
    async abandon(key){const operation=find(key);if(!operation)throw new Stage1Error('INVALID_OPERATION');if(!sameSession(operation.source))throw new Stage1Error('STALE_OPERATION');return resolved(key,operation,unwrap(await send('POST','/operations/'+operation.body.requestId+'/abandon',{requestId:operation.body.requestId})));},
    retry(key){const operation=find(key);if(!operation)throw new Stage1Error('INVALID_OPERATION');if(!sameSession(operation.source)){pending.delete(key);throw new Stage1Error('STALE_OPERATION');}return dispatch(key,operation);}
  };
}
function createUploads(options){
  let originalFile;
  const commands=createCommands({...options,send:(method,path,body)=>path==='/files'?options.upload(originalFile,body):options.send(method,path,body)});
  return {pending:()=>commands.pending('upload'),upload(file,purpose){if(commands.pending('upload'))throw new Stage1Error('UNKNOWN',0,null,true);originalFile=file;return commands.run('upload','POST','/files',{purpose});},query:()=>commands.query('upload'),retry:()=>commands.retry('upload'),abandon:()=>commands.abandon('upload')};
}
module.exports={Stage1Error,unwrap,createCommands,createUploads};
