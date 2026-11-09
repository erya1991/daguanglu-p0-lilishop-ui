'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../.uat-runtime'),run=path.resolve(process.env.UAT_RUN||'.'),output=path.resolve(process.env.UAT_MANAGER_OUTPUT||'.');
if(path.dirname(run)!==root||!/^UAT_[0-9]{17}$/.test(path.basename(run))||JSON.parse(fs.readFileSync(path.join(run,'owner.json'))).integration!==true||!output.startsWith(path.join(run,'build','manager')+path.sep))throw Error('UAT owned output required');
const original=require('./vue.config');
module.exports={...original,outputDir:output,parallel:false,productionSourceMap:false,lintOnSave:false,
 configureWebpack:{...original.configureWebpack,cache:false,externals:{},plugins:[],optimization:{...original.configureWebpack.optimization,minimize:false}},
 chainWebpack(config){original.chainWebpack(config);config.plugin('html').tap(args=>{args[0].cdn={css:[],js:[]};return args;});for(const name of ['vue','js','ts','tsx'])if(config.module.rules.has(name)){const rule=config.module.rule(name);rule.uses.delete('cache-loader');rule.uses.delete('thread-loader');if(rule.uses.has('babel-loader'))rule.use('babel-loader').tap(options=>({...options,cacheDirectory:path.join(run,'cache','manager-babel')}));}config.resolve.alias.set('@',path.join(__dirname,'src'));}
};
