<template>
  <Card class="s1-ui">
    <header class="ui-header"><div><h2>住户账号</h2><p>查看住户小程序账号；停用影响同一会员关联的全部身份。</p></div></header>
    <PageStatus v-bind="$data" :target="pendingTarget" @recover="recover()" @retry="recover(true)" @abandon="abandon"/>
    <div class="ui-search">
      <label>会员编号<Input v-model="memberId" maxlength="19" placeholder="精确查询"/></label>
      <label>昵称<Input v-model="nickname" maxlength="100" placeholder="搜索昵称"/></label>
      <label>手机号<Input v-model="mobile" maxlength="20" placeholder="完整手机号"/></label>
      <label>账号状态<Select v-model="status" clearable><Option value="ACTIVE">正常</Option><Option value="DISABLED">已停用</Option></Select></label>
      <div class="ui-actions"><Button type="primary" @click="search">查询</Button><Button @click="reset">重置</Button></div>
    </div>
    <Table :columns="columns" :data="records" :loading="loading" no-data-text="暂无符合条件的住户账号">
      <template slot="state" slot-scope="{row}">{{stateText(row.status)}}</template>
      <template slot="binding" slot-scope="{row}">{{bindingText(row.bindingStatus)}}</template>
      <template slot="merchant" slot-scope="{row}">{{({RELATED:'有关联',NONE:'无关联',UNVERIFIED:'待核实'})[row.merchantAssociation] || '无查看权限'}}</template>
      <template slot="actions" slot-scope="{row}"><Button size="small" @click="showDetail(row.id)">查看详情</Button></template>
    </Table>
    <Page :total="total" :current="page" :page-size="size" show-total @on-change="changePage"/>
    <Drawer v-model="visible" title="住户账号详情" width="600" @on-close="closeDetail">
      <div v-if="selected" class="resident-detail">
        <p>会员编号：{{selected.id}}</p><p>昵称：{{selected.nickname || '未填写'}}</p>
        <p>联系方式：{{selected.mobileMasked || '未绑定'}}</p><p>住户身份：{{bindingText(selected.bindingStatus)}}</p>
        <p>会员账号：{{stateText(selected.status)}}</p><p>创建时间：{{selected.createdAt || '未知'}}</p>
        <p>身份来源：未核实</p>
        <section v-if="selected.merchantRelations"><h3>商户关联</h3><p v-if="!selected.merchantRelations.length">暂无已确认的店铺人员关系</p><p v-for="item in selected.merchantRelations" :key="item.clerkId">{{item.storeName || '店铺信息待核实'}} · {{item.role === 'OWNER' ? '负责人' : '工作人员'}} · {{item.active ? '有效' : '无效'}}</p></section>
        <section v-if="selected.merchantApplications"><h3>商户申请</h3><p v-if="!selected.merchantApplications.length">暂无申请记录</p><p v-for="item in selected.merchantApplications" :key="item.id">申请编号 {{item.id}} · {{item.kind}} · {{item.status}}</p></section>
        <section><h3>账号操作记录</h3><p v-if="!selected.audit.length">暂无启停记录</p><p v-for="(item,index) in selected.audit" :key="index">{{item.action === 'resident.disable' ? '停用' : '启用'}} · {{item.operatorName || item.operatorId}} · {{item.createdAt}} · {{item.reason}}</p></section>
        <section v-if="canOrders"><h3>商城订单</h3><Button size="small" @click="loadRelated('orders',1)">查看订单</Button><div v-for="item in orders" :key="item.id"><Button type="text" @click="openRelated('/s3/orders/',item.id)">{{item.orderSn || item.id}}</Button> {{item.storeName || ''}} · {{item.createdAt}}</div><Page v-if="orderTotal>20" :total="orderTotal" :page-size="20" @on-change="loadRelated('orders',$event)"/></section>
        <section v-if="canAftersales"><h3>售后记录</h3><Button size="small" @click="loadRelated('aftersales',1)">查看售后</Button><div v-for="item in aftersales" :key="item.id"><Button type="text" @click="openRelated('/s45/aftersales/',item.id)">{{item.sn || item.id}}</Button> {{item.type}} · {{item.state}}</div><Page v-if="saleTotal>20" :total="saleTotal" :page-size="20" @on-change="loadRelated('aftersales',$event)"/></section>
        <Button v-if="can('resident.manage') && selected.status !== 'UNKNOWN'" :disabled="blocked" @click="changeStatus">{{selected.status === 'ACTIVE' ? '停用会员' : '启用会员'}}</Button>
      </div>
    </Drawer>
  </Card>
</template>
<script>
import page from './usability/page';
import PageStatus from './usability/components/PageStatus';
import {postRequestWithNoForm} from '@/libs/axios';
import {managerSession} from '@/libs/manager-session';
import {managerAccess} from '@/libs/manager-access';
import {unwrap,Stage1Error} from '@/api/stage1-core.cjs';
export default {
  mixins:[page], components:{PageStatus},
  data:()=>({memberId:'',nickname:'',mobile:'',status:'',visible:false,selected:null,detailTicket:0,orders:[],aftersales:[],orderTotal:0,saleTotal:0,
    columns:[{title:'会员编号',key:'id',minWidth:175},{title:'昵称',key:'nickname',minWidth:150},
      {title:'手机号',key:'mobileMasked',minWidth:140},{title:'住户身份',slot:'binding',width:130},
      {title:'账号状态',slot:'state',width:110},{title:'关联商户',slot:'merchant',width:120},{title:'创建时间',key:'createdAt',minWidth:180},{title:'操作',slot:'actions',width:110}]}),
  computed:{canOrders(){const s=managerAccess.state.info?.stage1?.stage3;return !!s&&Array.isArray(s.permissions)&&s.permissions.includes('order.read');},canAftersales(){const s=managerAccess.state.info?.stage1?.stage45;return !!s&&Array.isArray(s.permissions)&&s.permissions.includes('aftersale.read');}},
  mounted(){this.reload();},
  methods:{
    stateText(value){return ({ACTIVE:'正常',DISABLED:'已停用',UNKNOWN:'状态待核实'})[value]||'状态待核实';},
    bindingText(value){return ({ACTIVE:'已绑定',PENDING:'绑定处理中',UNRESOLVED:'状态待核实'})[value]||'状态待核实';},
    reload(){const body={pageNumber:this.page,pageSize:this.size};for(const key of ['memberId','nickname','mobile','status'])if(this[key])body[key]=this[key].trim();
      const source=managerSession.snapshot();return this.latest(async()=>{const value=unwrap(await postRequestWithNoForm('/p0/s1/residents/search',body));if(!managerSession.sameSession(source))throw new Stage1Error('STALE_OPERATION');return value;},value=>{this.records=value.records;this.total=value.total;},()=>{this.records=[];this.total=0;});},
    search(){this.page=1;this.reload();},reset(){this.memberId='';this.nickname='';this.mobile='';this.status='';this.search();},
    changePage(value){this.page=value;this.reload();},
    async showDetail(id){const ticket=++this.detailTicket;this.selected=null;this.orders=[];this.aftersales=[];this.orderTotal=0;this.saleTotal=0;this.visible=true;try{const value=await this.read('/residents/'+id);if(ticket===this.detailTicket&&this.visible)this.selected=value;}catch(e){if(ticket===this.detailTicket)this.error=e.message;}},
    closeDetail(){this.detailTicket++;this.selected=null;this.orders=[];this.aftersales=[];},
    async loadRelated(kind,number){const selected=this.selected,ticket=this.detailTicket;if(!selected)return;try{const value=await this.read('/residents/'+selected.id+'/'+kind,{pageNumber:number,pageSize:20});if(ticket!==this.detailTicket||!this.selected||this.selected.id!==selected.id)return;if(kind==='orders'){this.orders=value.records;this.orderTotal=value.total;}else{this.aftersales=value.records;this.saleTotal=value.total;}}catch(e){if(ticket===this.detailTicket)this.error=e.message;}},
    openRelated(path,id){this.visible=false;this.$router.push(path+id);},
    async changeStatus(){const current=this.selected;if(!current||this.blocked)return;try{
      const impact=await this.read('/residents/'+current.id+'/impact');if(!this.selected||this.selected.id!==current.id)return;
      const enabled=impact.status==='ACTIVE';const message='停用的是会员账号，同一会员关联的住户及商户身份均可能受影响；店主可能无法处理已有订单。'+(impact.merchantAssociated?' 此会员存在商户关联。':'');
      const result=await this.command('/residents/'+current.id+(enabled?'/disable':'/enable'),enabled?'停用会员':'启用会员',{version:impact.version},enabled?message:'启用后须重新登录，不会恢复旧会话或被撤销的店铺授权。');
      if(result){await this.reload();await this.showDetail(current.id);}
    }catch(e){this.error=e.message;}}
  }
};
</script>
