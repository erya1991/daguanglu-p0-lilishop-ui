'use strict';
// Never inherit a production/test mode into a local server.
if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
  console.error('[manager-local] NODE_ENV must be development or unset.');
  process.exit(1);
}
process.env.NODE_ENV = 'development';
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const guard = spawnSync(process.execPath, [path.join(__dirname, 'apply-compression-hash-fix.cjs')], {stdio: 'inherit'});
if (guard.status !== 0) process.exit(guard.status || 1);
const result = spawnSync(process.execPath, [require.resolve('@vue/cli-service/bin/vue-cli-service.js'), 'serve', '--host', '127.0.0.1', '--port', '10003'], {stdio: 'inherit'});
process.exit(result.status || (result.error ? 1 : 0));
