<template><section class="ui-section"><h3>{{title}}</h3><p v-if="description" class="ui-note">{{description}}</p><div :class="grid?'ui-grid':''"><slot/></div></section></template>
<script>export default {props:{title:String,description:String,grid:{type:Boolean,default:true}}};</script>
