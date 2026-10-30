<template><dl class="ui-field" :class="{wide}"><dt>{{label}}</dt><dd><slot>{{value===null||value===undefined||value===''?'未提供':typeof value==='boolean'?(value?'是':'否'):value}}</slot></dd></dl></template>
<script>export default {props:{label:String,value:[String,Number,Boolean],wide:Boolean}};</script>
