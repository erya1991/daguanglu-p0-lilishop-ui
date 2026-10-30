import {managerAccess} from '@/libs/manager-access';
import {managerSession} from '@/libs/manager-session';
import {s1Read} from '@/api/stage1';
import {uiRead} from '@/api/stage1-usability';
import {stage1Confirm} from '../confirm';
import {operationContext,pendingReference} from './operation-context';
import display from './display.cjs';
import accessible from './accessibility';
import {fieldMessage} from './errors.cjs';
import listState from './list-state.cjs';
import './usability.scss';
import demo from './demo-data.cjs';
import DatasetSwitch from './components/DatasetSwitch';
const demoConfiguration=demo.configuration(typeof BASE==='undefined'?null:BASE);
const formatters=Object.fromEntries(Object.entries(display).filter(([,value])=>typeof value==='function'));
const compactCells=el=>{if(!el.isConnected)return;el.querySelectorAll('td .ivu-table-cell').forEach(cell=>{const text=cell.textContent.replace(/\s+/g,' ').trim();if(text)cell.setAttribute('title',text);});};
export default {
  mixins:[accessible],components:{DatasetSwitch},directives:{compactTable:{inserted:compactCells,componentUpdated:compactCells}},
  provide(){return {stage1UploadActivity:(key,value)=>this.$set(this.uploadStates,key,value)};},
  data(){const commands=operationContext(this.$route.path);return {showTestData:demo.allFromRoute(this.$route,demoConfiguration,sessionStorage),methods:display.methods,loading:false,busy:false,error:'',fieldErrors:null,selected:null,records:[],total:0,page:1,size:20,ticket:0,commands,pending:commands.pending('command'),uploadStates:{},dirty:false,tab:'overview'};},
  computed:{demoAvailable(){return !!demoConfiguration;},demoStore(){return demoConfiguration&&demoConfiguration.storeId||'';},demoActive(){return !!demoConfiguration&&!this.showTestData;},uploading(){return Object.values(this.uploadStates).some(Boolean);},blocked(){return this.busy||this.pending||this.uploading;},pendingTarget(){return this.pending?pendingReference(this.$route.path):null;}},
  methods:{...formatters,can(action){return managerAccess.has(action);},
    async switchDataset(all){this.ticket++;this.showTestData=all;sessionStorage.setItem('s1-display-all-tests',all?'1':'0');this.page=1;this.selected=null;this.records=[];this.total=0;this.error='';if('q' in this)this.q='';if('targetStore' in this)this.targetStore='';const keys=this._s1ListKeys||('targetStore' in this?['targetStore']:[]);if(!all)Object.assign(this,demo.defaults(this.$route.path,keys,demoConfiguration,false));if(this.$route.path==='/s1/categories'){this.query='';this.queryDraft='';this.expanded=[];}if(this.$route.path==='/s1/units'){this.query='';this.searchDraft='';}const query={showTests:all?'1':'0'};if(this.targetStore)query.targetStore=this.targetStore;await this.$router.replace({path:this.$route.path,query}).catch(()=>{});if(this.reload)await this.reload();},
    async completeList(path,params={}){const rows=[];let first;for(let page=1;;page++){const v=await this.read(path,{...params,pageNumber:page,pageSize:100});first=first||v;rows.push(...v.records);if(page*100>=v.total)break;if(page>=1000)throw Error('数据范围过大，请选择查询条件。');}return {...first,records:rows,total:rows.length};},
    async latest(work,accept,clear){const ticket=++this.ticket,source=managerSession.snapshot();this.loading=true;this.error='';if(clear)clear();try{const value=await work();if(ticket===this.ticket&&managerSession.sameSession(source)){accept(value);return value;}}catch(e){if(ticket===this.ticket){this.error=e.message+(fieldMessage(e.detail)?' '+fieldMessage(e.detail):'');this.fieldErrors=e.detail;}}finally{if(ticket===this.ticket)this.loading=false;}},
    read(path,params){return s1Read(path,params);},ui(path,params){return uiRead(path,params);},
    load(path,params={},presentation=false){return this.latest(()=>this.demoActive&&path==='/receivers'?this.completeList(path,params).then(v=>{const rows=v.records.filter(r=>!demo.testName(r.displayName));return {...v,total:rows.length,records:rows.slice((this.page-1)*this.size,this.page*this.size)};}):presentation?uiRead(path,{pageNumber:this.page,pageSize:this.size,...params}):s1Read(path,{pageNumber:this.page,pageSize:this.size,...params}),value=>{this.records=Array.isArray(value)?value:value.records||[];this.total=Array.isArray(value)?value.length:value.total;this.$nextTick(this.restoreScroll);},()=>{this.records=[];this.total=0;});},
    async run(path,body,method='POST'){if(this.blocked)return;this.busy=true;this.error='';try{const value=await this.commands.run('command',method,path,body);this.pending=false;this.dirty=false;this.$Message.success('操作已保存');return value;}catch(e){this.error=e.message;this.fieldErrors=e.detail;this.pending=this.commands.pending('command');throw e;}finally{this.busy=false;}},
    async recover(retry=false){if(this.busy)return;this.busy=true;this.error='';try{await (retry?this.commands.retry('command'):this.commands.query('command'));this.pending=false;this.$Message.success('已查到本次操作结果');if(this.reload)await this.reload();}catch(e){this.error=e.status===404?'暂未查到提交结果，请稍后回查或按原请求重试。':e.message;}finally{this.pending=this.commands.pending('command');this.busy=false;}},
    abandon(){stage1Confirm({title:'核实并关闭未提交请求',content:'若已提交则回读原结果；尚未提交才关闭请求。不会撤销已有业务。',onOk:async()=>{this.busy=true;try{await this.commands.abandon('command');if(this.reload)await this.reload();}catch(e){this.error=e.message;}finally{this.pending=this.commands.pending('command');this.busy=false;}}});},
    command(path,title,body={},impact=''){if(this.blocked)return Promise.resolve(null);let reason='';return new Promise(resolve=>stage1Confirm({title,render:h=>h('div',[h('p',impact||'请核对当前对象及版本。本操作会保存审计记录。'),h('Input',{props:{type:'textarea',maxlength:500,placeholder:'操作原因（必填）'},on:{input:value=>{reason=value;}}})]),onOk:async()=>{if(!reason.trim()){this.error='请填写操作原因。';return resolve(null);}try{resolve(await this.run(path,{...body,reason:reason.trim()}));}catch(_){resolve(null);}},onCancel:()=>resolve(null)}));},
    remember(keys){const query=listState.listQuery(this,keys);if(demoConfiguration)query.showTests=this.showTestData?'1':'0';this.$router.replace({path:listState.parent(this.$route.path),query});},
    restoreScroll(){if(!this._s1List)return;try{const raw=sessionStorage.getItem('s1-ui-scroll:'+this.$route.fullPath);if(!raw)return;const value=JSON.parse(raw),container=document.querySelector('.single-page-con');if(container)container.scrollTop=value.container||0;window.scrollTo(0,value.window||0);}catch(_){}},rememberScroll(){const container=document.querySelector('.single-page-con');sessionStorage.setItem('s1-ui-scroll:'+this.$route.fullPath,JSON.stringify({container:container?container.scrollTop:0,window:window.scrollY}));},initializeList(keys,defaults={}){this._s1List=true;this._s1ListKeys=keys;defaults={...demo.defaults(this.$route.path,keys,demoConfiguration,this.showTestData),...defaults};const values=listState.restore(this.$route.query,keys);Object.assign(this,values);for(const [key,value] of Object.entries(defaults))if(!(key in this.$route.query))this[key]=value;},
    detail(id,base){this.rememberScroll();this.$router.push({path:(base||listState.parent(this.$route.path))+'/'+id,query:{...this.$route.query}}).then(()=>{const container=document.querySelector('.single-page-con');if(container)container.scrollTop=0;window.scrollTo(0,0);});},
    back(){this.$router.push(listState.returnLocation(this.$route.path,this.$route.query));},
    link(path,query={}){this.$router.push({path,query});}
  },
  beforeRouteUpdate(to,from,next){if(!this.dirty&&!this.uploading)return next();stage1Confirm({title:'离开当前编辑？',content:'未保存内容不会提交，原请求回执仍保留。',onOk:()=>next(),onCancel:()=>next(false)});},
  beforeRouteLeave(to,from,next){if(!this.dirty&&!this.uploading)return next();stage1Confirm({title:'离开当前编辑？',content:this.uploading?'本次上传尚未确认，建议先回查。离开不会替你提交资料。':'未保存的输入不会提交；未决业务回执仍可回查。',onOk:()=>next(),onCancel:()=>next(false)});},
  beforeDestroy(){this.ticket++;}
};
