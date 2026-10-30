'use strict';
const fs=require('fs'),path=require('path');
const original=require('./stage1.config.cjs');
const run=path.resolve(process.env.S1_RUN||'.'),output=path.resolve(process.env.S1_MANAGER_OUTPUT||'.');
if(!path.basename(output).startsWith('UI_')||!fs.existsSync(path.join(run,'runtime/web-usability-current.json')))throw Error('Owned UI batch required');
module.exports={...original,chainWebpack(config){original.chainWebpack(config);for(const name of ['vue','js','ts','tsx'])if(config.module.rules.has(name)){const rule=config.module.rule(name);if(rule.uses.has('babel-loader'))rule.use('babel-loader').tap(options=>({...options,cacheDirectory:path.join(run,'cache','web-usability',path.basename(output),'babel')}));}}};
