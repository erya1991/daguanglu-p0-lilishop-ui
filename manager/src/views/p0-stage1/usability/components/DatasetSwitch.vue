<template><div v-if="available" class="ui-dataset-switch"><span>{{all?'全部数据':'日常演示数据'}}</span><Checkbox :value="all" @on-change="$emit('change',$event)">显示历史测试数据</Checkbox><span class="ui-meta">历史记录保留，筛选不改变权限和业务状态。</span></div></template>
<script>export default {props:{available:Boolean,all:Boolean}};</script>
