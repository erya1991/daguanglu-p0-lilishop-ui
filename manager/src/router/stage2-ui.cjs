'use strict';
const enabled=()=>typeof BASE!=='undefined'&&BASE.stage2Enabled===true&&BASE.stage2WebUiEnabled===true;
function routes(menus){if(!enabled())return [];return menus.filter(m=>m.id==='s1-goods'&&m.name==='s1-goods'&&m.path==='/s1/goods').map(m=>({name:'s2-goods-detail',title:'商品与库存详情',path:'/s1/goods/:id([1-9][0-9]{0,18})',frontRoute:'p0-stage2/GoodsDetail',hidden:true,meta:{title:'商品与库存详情',stage0MenuId:m.id,stage2DetailParent:m.name,firstRouterName:m.meta&&m.meta.firstRouterName}}));}
function parent(route){return enabled()&&route.name==='s2-goods-detail'&&route.meta&&route.meta.stage2DetailParent==='s1-goods'&&route.meta.stage0MenuId==='s1-goods'&&/^\/s1\/goods\/[1-9][0-9]{0,18}$/.test(route.path||'')?'s1-goods':null;}
module.exports={enabled,routes,parent};
