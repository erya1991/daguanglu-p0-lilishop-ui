<template><div class="s1-files"><p>{{title}} <small v-if="protectedHint">{{protectedHint}}</small></p><input type="file" :accept="imagesOnly?'image/png,image/jpeg':'image/png,image/jpeg,application/pdf'" :disabled="disabled||loading||pending||(multiple&&ids.length>=maximum)" @change="upload"/><p v-if="error" class="s1-error">{{error}}</p><div v-if="pending"><p>本次上传结果尚未确认，请先回查。</p><Button :disabled="loading" @click="recover(false)">回查上传</Button><Button :disabled="loading" @click="recover(true)">重试原上传</Button><Button :disabled="loading" @click="abandon">核实并关闭未提交上传</Button></div><div v-for="(id,index) in ids" :key="id"><Button size="small" @click="$emit('preview',id)">预览附件 {{index+1}}</Button><Button size="small" :disabled="disabled||loading||pending" @click="remove(index)">移除引用</Button></div></div></template>
<script>
import {stage1Confirm} from './confirm';
import {s1Uploads} from '@/api/stage1';
export default {
  inject:{stage1UploadActivity:{default:()=>()=>{}}},
  props:{value:[String,Array],purpose:{type:String,required:true},title:String,receiptKey:{type:String,required:true},protectedHint:String,multiple:Boolean,imagesOnly:Boolean,disabled:Boolean,maximum:{type:Number,default:10}},
  data(){const client=s1Uploads(this.$route.path+':'+this.receiptKey);return {loading:false,error:'',client,pending:client.pending()};},
  computed:{ids(){return this.multiple?(this.value||[]):this.value?[this.value]:[];}},
  methods:{
    accepted(result){if(!result||!result.id)throw Error('上传结果缺少文件编号。');this.$emit('input',this.multiple?[...new Set([...this.ids,result.id])]:result.id);},
    async perform(action){this.loading=true;this.$emit('pending',true);this.stage1UploadActivity(this.receiptKey,true);this.error='';try{this.accepted(await action());}catch(e){this.error=e.message;}finally{this.loading=false;this.pending=this.client.pending();this.$emit('pending',this.pending);this.stage1UploadActivity(this.receiptKey,this.pending);}},
    async upload(event){const file=event.target.files[0];if(!file)return;await this.perform(()=>this.client.upload(file,this.purpose));event.target.value='';},
    recover(retry){return this.perform(()=>retry?this.client.retry():this.client.query());},
    abandon(){stage1Confirm({title:'核实本次上传结果',content:'已提交时返回原文件；未提交时关闭原操作标识，防止晚到上传产生重复结果。',onOk:()=>this.perform(()=>this.client.abandon())});},
    remove(index){const next=[...this.ids];next.splice(index,1);this.$emit('input',this.multiple?next:null);}
  },mounted(){this.$emit('pending',this.pending);}
};
</script>
<style scoped>.s1-files{border:1px solid #e8eaec;border-radius:4px;padding:14px;margin:12px 0}.s1-files p{margin-bottom:8px}.s1-files button{margin:10px 10px 0 0}.s1-error{color:#c8292f}small{color:#666}</style>
