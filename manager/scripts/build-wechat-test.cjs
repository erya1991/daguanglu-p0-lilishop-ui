'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--output'||!path.isAbsolute(args[1]))throw new Error('Usage: npm run build:wechat-test -- --output <new-absolute-directory>');
const output=path.resolve(args[1]);
if(output===root||output.startsWith(root+path.sep)||fs.existsSync(output))throw new Error('New independent output required');
for(const argv of [[path.join(__dirname,'apply-compression-hash-fix.cjs')],[path.join(root,'node_modules/@vue/cli-service/bin/vue-cli-service.js'),'build']]){
  const result=spawnSync(process.execPath,argv,{cwd:root,env:{...process.env,P0_MANAGER_OUTPUT:output,VUE_CLI_SERVICE_CONFIG_PATH:path.join(root,'server-test.config.cjs')},stdio:'inherit'});
  if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
fs.copyFileSync(path.join(root,'deploy/wechat-test/config.js'),path.join(output,'config.js'));
console.log('Manager TEST/MOCK build: '+output);
