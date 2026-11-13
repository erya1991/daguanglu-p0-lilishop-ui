'use strict';
const parents=new Set(['applications','stores','agreements','eligibility','channel-configs','submerchants','receivers','commission-rules','categories','units','reviews','goods','fulfillment','residents']);
function parent(path){const match=String(path).match(/^\/s1\/([a-z-]+)(?:\/|$)/);if(!match||!parents.has(match[1]))throw Error('未知业务入口');return '/s1/'+match[1];}
function restore(query,keys){const result={page:Math.max(1,Math.min(10000,parseInt(query.page,10)||1)),size:[20,50,100].includes(Number(query.size))?Number(query.size):20};for(const key of keys)result[key]=typeof query[key]==='string'?query[key]:'';return result;}
function listQuery(state,keys){const result={page:String(state.page),size:String(state.size)};for(const key of keys)if(state[key]!==''&&state[key]!==null&&state[key]!==undefined)result[key]=String(state[key]);return result;}
function returnLocation(path,query){return {path:parent(path),query:Object.fromEntries(Object.entries(query||{}).filter(([key,value])=>!['revision','contentRevision','edit','tab'].includes(key)&&typeof value==='string'))};}
module.exports={parent,restore,listQuery,returnLocation};
