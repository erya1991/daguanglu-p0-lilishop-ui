'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../.stage3-runtime'),run=path.resolve(process.env.S3_RUN||'.'),output=path.resolve(process.env.S3_MANAGER_OUTPUT||'.');
if(path.dirname(run)!==root||!/^S3_[0-9]{8}_[0-9]{6}$/.test(path.basename(run))||JSON.parse(fs.readFileSync(path.join(run,'owner.json'))).stage!==3||!output.startsWith(path.join(run,'build','manager')+path.sep))throw Error('Stage3 owned output required');
const original=require('./vue.config');
module.exports={...original,outputDir:output,parallel:false,productionSourceMap:false,lintOnSave:false,
 configureWebpack:{...original.configureWebpack,cache:false,externals:{},plugins:[],optimization:{...original.configureWebpack.optimization,minimize:false}},
 chainWebpack(config){original.chainWebpack(config);config.plugin('html').tap(args=>{args[0].cdn={css:[],js:[]};return args;});for(const name of ['vue','js','ts','tsx'])if(config.module.rules.has(name)){const rule=config.module.rule(name);rule.uses.delete('cache-loader');rule.uses.delete('thread-loader');if(rule.uses.has('babel-loader'))rule.use('babel-loader').tap(options=>({...options,cacheDirectory:path.join(run,'cache','manager-babel')}));}config.resolve.alias.set('@',path.join(__dirname,'src'));}
};
