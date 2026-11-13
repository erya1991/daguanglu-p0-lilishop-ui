'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Vue=require('vue'),babel=require('@babel/core');
const session={snapshot:()=>({generation:1}),sameSession:()=>true};
const list=require('../src/views/p0-stage1/usability/list-state.cjs');
const mocks={'@/libs/manager-access':{managerAccess:{has:()=>true,state:{info:{}}}},'@/libs/manager-session':{managerSession:session},'@/api/stage1':{s1Read:()=>{}},'@/api/stage1-usability':{uiRead:()=>{}},'../confirm':{stage1Confirm:()=>{}},'./operation-context':{operationContext:p=>{list.parent(p);return {pending:()=>false};},pendingReference:()=>null},'./display.cjs':{methods:{}},'./accessibility':{},'./errors.cjs':{fieldMessage:()=>''},'./list-state.cjs':list,'./demo-data.cjs':{configuration:()=>null,allFromRoute:()=>false},'./components/DatasetSwitch':{},'./usability/components/PageStatus':{},'@/libs/axios':{postRequestWithNoForm:async()=>({success:true,code:'SUCCESS',result:{records:[],total:0}})},'@/api/stage1-core.cjs':{unwrap:r=>r.result,Stage1Error:Error}};
global.BASE={};global.sessionStorage={getItem:()=>null};
function load(name,source){const code=babel.transformSync(source,{babelrc:false,configFile:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code,m={exports:{}};const local=x=>{if(x.endsWith('.scss'))return {};if(Object.hasOwn(mocks,x))return mocks[x];throw Error('Unmocked '+x+' in '+name)};new Function('module','exports','require',code)(m,m.exports,local);return m.exports.default;}
const root=path.join(__dirname,'../src/views/p0-stage1'),source=fs.readFileSync(path.join(root,'residents.vue'),'utf8');
mocks['./usability/page']=load('page',fs.readFileSync(path.join(root,'usability/page.js'),'utf8'));
const component=load('residents',source.match(/<script>([\s\S]*?)<\/script>/)[1]);
function instance(){return new (Vue.extend(component))({beforeCreate(){this.$route={path:'/s1/residents',query:{}}}});}
test('status action is in the row and independently permission-gated',()=>{
  const list=source.split('</Table>')[0],detail=source.split('<Drawer')[1].split('</Drawer>')[0];
  assert.match(list,/can\('resident\.manage'\)/);assert.match(list,/changeStatus\(row\)/);assert.doesNotMatch(detail,/changeStatus/);
});
for(const [state,suffix] of [['ACTIVE','disable'],['DISABLED','enable']])test('row '+state+' uses its own identity and impact version',async()=>{
  const vm=instance();let call;vm.read=async()=>({status:state,version:'v',merchantAssociated:false});vm.command=async(...args)=>{call=args;return {ok:true};};vm.reload=async()=>{};
  await vm.changeStatus({id:'1001',status:state});assert.equal(call[0],'/residents/1001/'+suffix);assert.equal(call[2].version,'v');assert.match(call[3],/1001/);assert.equal(vm.visible,false);
});
test('stale row does not submit the opposite status operation',async()=>{
  const vm=instance();let sent=false,reloaded=false;vm.read=async()=>({status:'DISABLED',version:'v'});vm.command=async()=>{sent=true;};vm.reload=async()=>{reloaded=true;};
  await vm.changeStatus({id:'1001',status:'ACTIVE'});assert.equal(sent,false);assert.equal(reloaded,true);assert.match(vm.error,/状态已变化/);
});
