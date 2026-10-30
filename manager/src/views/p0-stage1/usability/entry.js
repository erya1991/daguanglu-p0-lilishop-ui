import {usabilityEnabled} from './enabled';
import {stage1Confirm} from '../confirm';
function editing(vm){return !!(vm&&(vm.dirty||vm.uploading||(vm.$children||[]).some(editing)));}
export function leaveGuard(to,from,next){if(to.fullPath===from.fullPath||!editing(this))return next();stage1Confirm({title:'离开当前编辑？',content:'未保存输入不会提交。上传或结果未知的请求请先回查；原请求回执会继续保留。',onOk:()=>next(),onCancel:()=>next(false)});}
export function entry(legacy,component,props=()=>({})){return {name:'Stage1BusinessEntry',beforeRouteLeave:leaveGuard,beforeRouteUpdate:leaveGuard,render(h){return h(usabilityEnabled?component:legacy,{props:props(this),ref:'content',key:usabilityEnabled?this.$route.path:'legacy'});}};}
