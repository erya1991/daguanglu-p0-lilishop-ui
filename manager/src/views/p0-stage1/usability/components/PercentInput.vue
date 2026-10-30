<template><MoneyInput :value="value" :disabled="disabled" :maximum="10000" suffix="%" placeholder="请输入百分比，如3.33" @input="$emit('input',$event)" @valid="$emit('valid',$event)"/></template>
<script>import MoneyInput from './MoneyInput';export default {components:{MoneyInput},props:{value:Number,disabled:Boolean}};</script>
