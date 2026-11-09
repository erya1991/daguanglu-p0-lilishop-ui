'use strict';
const labels={MERCHANT_DELIVERY:'商户配送',EXPRESS:'普通物流',COMMUNITY_PICKUP:'社区自提',STORE_REDEMPTION:'到店核销',WAIT_PREPARE:'待备货',WAIT_DISPATCH:'待配送',WAIT_SHIP:'待发货',DELIVERING:'配送中',DELIVERED:'已送达，待居民确认',SHIPPED:'已发货，待居民确认',WAIT_PICKUP:'待自提',WAIT_VERIFY:'待核销',COMPLETED:'已完成',BLOCKED:'待核实',NOT_STARTED:'未开始付款',UNPAID:'未付款',SUCCEEDED:'已付款',UNKNOWN:'付款结果核实中',CLOSED:'已关闭',SUCCESS:'核销成功',REJECTED:'核销拒绝',READY:'可履约',PREPARE:'备货完成',DISPATCH:'开始配送',SHIP:'已发货',EXCEPTION:'异常记录'};
const label=v=>v==null?'未提供':labels[v]||'待核实';
function money(v){if(v==null)return '待核实';const s=String(v);if(!/^\d+$/.test(s)||typeof v==='number'&&!Number.isSafeInteger(v))return '待核实';const n=s.padStart(3,'0');return '¥'+n.slice(0,-2)+'.'+n.slice(-2);}
function date(v){if(!v)return '尚未发生';const d=new Date(v);return Number.isNaN(d.getTime())?'时间待核实':new Date(d.getTime()+8*3600000).toISOString().slice(0,19).replace('T',' ')+'（北京）';}
function day(value){if(!(value instanceof Date)||Number.isNaN(value.getTime()))return '';return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');}
function selectedDate(text){if(!/^\d{4}-\d{2}-\d{2}$/.test(text||''))return null;const [y,m,d]=text.split('-').map(Number);return new Date(y,m-1,d);}
function restoreDates(query){return query.fromDay&&query.toDay?[selectedDate(query.fromDay),selectedDate(query.toDay)]:[];}
function range(dates){const result={};for(let i=0;i<2;i++){const selected=day(dates[i]);if(!selected)continue;let date=selected;if(i===1){const [y,m,d]=selected.split('-').map(Number);date=new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10);}result[i===0?'timeFrom':'timeTo']=new Date(date+'T00:00:00+08:00').toISOString();}return result;}
module.exports={label,money,date,day,range,restoreDates};
