'use strict';
function configuration(base){if(!base||base.stage1Enabled!==true||base.stage2Enabled===true||base.stage1WebUsabilityEnabled!==true||!base.stage1DemoData||base.stage1DemoData.enabled!==true)return null;return base.stage1DemoData;}
function testName(value){return /^(?:S1_|S2_|P0_|TEST[_-]|PERF[_-]|UAT[0-9a-f]{5}$|UI[0-9a-f]{5}$)/i.test(String(value||''));}
function categoryRows(rows,all){if(all)return rows;const roots=new Set(rows.filter(r=>String(r.parentId||'0')==='0'&&!testName(r.name)).map(r=>r.id));for(let i=0;i<3;i++)for(const r of rows)if(roots.has(r.parentId))roots.add(r.id);return rows.filter(r=>roots.has(r.id));}
function unitRows(rows,all){return all?rows:rows.filter(r=>!testName(r.name)&&!/^件\d+$/.test(r.name));}
function expandedIds(current,key,expanded){const raw=key&&typeof key==='object'?key.id:key;if(raw==null)return current;const id=String(raw);return expanded?[...new Set([...current,id])]:current.filter(value=>value!==id);}
function defaults(path,keys,cfg,all){if(!cfg||all)return {};const result={};if(keys.includes('q')&&/^\/s1\/(stores|applications)$/.test(path))result.q=cfg.storeSearch;if(keys.includes('targetStore'))result.targetStore=cfg.storeId;return result;}
function allFromRoute(route,cfg,storage){if(!cfg)return true;if(route.query.showTests==='1')return true;if(route.query.showTests==='0')return false;if(route.query.q&&testName(route.query.q))return true;if(route.query.targetStore&&route.query.targetStore!==cfg.storeId)return true;try{return storage.getItem('s1-display-all-tests')==='1';}catch{return false;}}
module.exports={configuration,testName,categoryRows,unitRows,expandedIds,defaults,allFromRoute};
