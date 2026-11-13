'use strict';
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve(process.env.P0_MANAGER_OUTPUT||'.'),root=fs.realpathSync(__dirname);
if(!process.env.P0_MANAGER_OUTPUT||output===root||output.startsWith(root+path.sep))throw new Error('Independent Manager output directory required');
const original=require('./vue.config');
module.exports={...original,outputDir:output,parallel:false,productionSourceMap:false,lintOnSave:false,
  configureWebpack:{...original.configureWebpack,cache:false,externals:{},plugins:[],optimization:{...original.configureWebpack.optimization,minimize:false}},
  chainWebpack(config){
    original.chainWebpack(config);
    config.plugin('html').tap(args=>{args[0].cdn={css:[],js:[]};return args;});
    for(const name of ['vue','js','ts','tsx'])if(config.module.rules.has(name)){
      const rule=config.module.rule(name);rule.uses.delete('cache-loader');rule.uses.delete('thread-loader');
      if(rule.uses.has('babel-loader'))rule.use('babel-loader').tap(options=>({...options,cacheDirectory:false}));
    }
    config.resolve.alias.set('@',path.join(__dirname,'src'));
  }
};
