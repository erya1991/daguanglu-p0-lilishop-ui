'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
global.BASE={p0IntegrationEnabled:true};
const native=require('../src/libs/native-access-core.cjs');
const stage1=require('../src/libs/stage1-access-core.cjs');
function info(permissions){return {id:'42',isSuper:false,sessionProtocol:'STAGE0_SESSION',stage1:{permissions,authVersion:'a'.repeat(64),environment:'TEST',mode:'MOCK'},nativeAccess:{integration:true,permissions:[]}};}
const tree=[{id:'1',name:'root',children:[{id:'2',name:'uat-resident-group',children:[
  {id:'3',name:'s1-residents',title:'住户账号',path:'/s1/residents',frontRoute:'p0-stage1/residents',permission:'s1.resident.read',children:[]},
  {id:'4',name:'action-s1-resident-manage',title:'启停会员',path:'',frontRoute:'',permission:'s1.resident.manage',children:[]}
]}]}];
test('resident navigation is hierarchical and requires current read permission',()=>{
  const authorized=info(['resident.read']);assert.ok(stage1.normalize(authorized));
  const menus=native.menus(tree,authorized);assert.equal(menus[0].children[0].children[0].name,'s1-residents');
  assert.deepEqual(native.menus(tree,info([])),[]);
});
test('read permission does not imply member status management',()=>{
  assert.equal(stage1.has(info(['resident.read']),'resident.manage'),false);
  assert.equal(stage1.has(info(['resident.read','resident.manage']),'resident.manage'),true);
});
test('resident operation context accepts the new page without opening arbitrary routes',()=>{
  const list=require('../src/views/p0-stage1/usability/list-state.cjs');
  assert.equal(list.parent('/s1/residents'),'/s1/residents');
  assert.throws(()=>list.parent('/s1/unapproved'));
});
