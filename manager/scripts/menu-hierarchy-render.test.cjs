'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const compiler=require('vue-template-compiler');
const {chromium}=require('C:/Users/65410/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),sfc=compiler.parseComponent(fs.readFileSync(path.join(root,'src/views/main-parts/shrinkable-menu/shrinkable-menu.vue'),'utf8'));
let browser;before(async()=>{browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking','--no-first-run']});});after(async()=>browser?.close());
async function fixture(t,route={name:'home_index',meta:{}},limited=false){
 const context=await browser.newContext();t.after(()=>context.close());await context.route('**/*',r=>r.abort());const page=await context.newPage();await page.setContent('<div id="test"></div>');
 await page.addScriptTag({path:path.join(root,'node_modules/vue/dist/vue.js')});await page.addScriptTag({path:path.join(root,'node_modules/view-design/dist/iview.js')});await page.addStyleTag({path:path.join(root,'node_modules/view-design/dist/styles/iview.css')});
 const script=sfc.script.content.replace(/import util[^;]+;/,"const util={initRouter(){}};").replace('export default','module.exports =');
 await page.evaluate(async({script,template,route,limited})=>{
  Vue.config.productionTip=false;window.errors=[];Vue.config.errorHandler=e=>window.errors.push(e.message);window.navigations=[];
  const groups=[['settings','原生设置','users','后台账号'],['merchant','商户与商品','s1-goods','商品监管'],['orders','订单与履约','s3-orders','商城订单'],['funds','售后与资金','s45-payments','支付记录']].map(([name,title,id,text])=>({id:name,name,title,children:[{id,name:id,title:text}]}));
  window.state=Vue.observable({route,app:{navList:[{name:'mall',title:'智慧社区商城'}],menuList:limited?groups.slice(1,2):groups,currNav:'mall'}});
  const module={exports:{}};new Function('module',script)(module);
  const definition={...module.exports,...Vue.compile(template),beforeCreate(){Object.defineProperty(this,'$route',{get:()=>state.route});this.$store={state:{app:state.app},commit(){}};this.$router={push:r=>navigations.push(r)};this.setStore=()=>{};}};
  window.menu=new(Vue.extend(definition))();menu.$mount('#test');await Vue.nextTick();await Vue.nextTick();
 },{script,template:sfc.template.content,route,limited});return page;
}
test('groups start collapsed and accordion selection preserves named navigation',async t=>{
 const p=await fixture(t);assert.equal(await p.locator('.ivu-menu-submenu').count(),4);assert.equal(await p.locator('.ivu-menu-item:visible').count(),0);
 await p.getByText('原生设置',{exact:true}).click();await p.getByText('后台账号',{exact:true}).waitFor();
 await p.getByText('商户与商品',{exact:true}).click();await p.getByText('商品监管',{exact:true}).waitFor();await p.getByText('后台账号',{exact:true}).waitFor({state:'hidden'});
 await p.getByText('商品监管',{exact:true}).click();assert.deepEqual(await p.evaluate(()=>navigations),[{name:'s1-goods'}]);assert.deepEqual(await p.evaluate(()=>errors),[]);
});
test('cold detail entry opens its real parent and highlights the list menu',async t=>{
 const p=await fixture(t,{name:'s3-orders-detail',meta:{stage0MenuId:'s3-orders'}});assert.equal(await p.locator('.ivu-menu-opened > .ivu-menu-submenu-title').innerText(),'订单与履约');assert.equal(await p.locator('.ivu-menu-item.ivu-menu-item-active').innerText(),'商城订单');
 await p.evaluate(()=>{state.route={name:'s45-payments-detail',meta:{stage0MenuId:'s45-payments'}}});await p.getByText('支付记录',{exact:true}).waitFor();await p.getByText('商城订单',{exact:true}).waitFor({state:'hidden'});assert.equal(await p.locator('.ivu-menu-item.ivu-menu-item-active').innerText(),'支付记录');
});
test('a granted single leaf keeps its directory and revoked menus disappear',async t=>{
 const p=await fixture(t,{name:'s2-goods-detail',meta:{stage0MenuId:'s1-goods'}},true);assert.equal(await p.locator('.ivu-menu-submenu').count(),1);assert.equal(await p.locator('.ivu-menu-item.ivu-menu-item-active').innerText(),'商品监管');assert.equal(await p.getByText('原生设置',{exact:true}).count(),0);
 await p.evaluate(()=>{state.app.menuList=[]});await p.locator('.ivu-menu-submenu').waitFor({state:'detached'});assert.equal(await p.locator('.ivu-menu-item').count(),0);assert.deepEqual(await p.evaluate(()=>errors),[]);
});
