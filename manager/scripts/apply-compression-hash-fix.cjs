'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_NAME = 'compression-webpack-plugin';
const VERSION = '4.0.1';
const BEFORE_SHA256 = 'b79d31dc7d04f6e75b3f2d18705edff8470573877963f8304e79997daccfc06e';
const AFTER_SHA256 = '950b598eef25905c5f32bb2733937a4f10294ed5efa410deb5af6959f61c8d4c';
const PATCH_SHA256 = '33c75bef8ec138cefef99a69c2ac574d50760331d6d280b2e9b90b234bbbb1ce';
const root = path.resolve(__dirname, '..');
const patchFile = path.join(root, 'patches', 'compression-webpack-plugin+4.0.1.patch');

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function regularFile(file) {
  const info = fs.lstatSync(file);
  check(info.isFile() && !info.isSymbolicLink() && info.nlink === 1,
    'Expected an independent regular file: ' + path.relative(root, file));
  return info;
}

function main() {
  check(!(process.env.NODE_OPTIONS || '').includes('--openssl-legacy-provider'),
    'OpenSSL legacy provider is not part of this build contract.');

  // Normalize only the versioned patch's checkout line endings.
  // The installed dependency must retain its exact published bytes.
  regularFile(patchFile);
  const patch = fs.readFileSync(patchFile, 'utf8').replace(/\r\n/g, '\n');
  check(!patch.includes('\r') && sha256(patch) === PATCH_SHA256,
    'Versioned compatibility patch SHA-256 mismatch.');

  const lines = patch.split('\n');
  check(lines[0] === '--- a/node_modules/compression-webpack-plugin/dist/index.js' &&
    lines[1] === '+++ b/node_modules/compression-webpack-plugin/dist/index.js' &&
    lines[2] === '@@ -160,7 +160,7 @@' && lines[lines.length - 1] === '',
  'Unexpected compatibility patch structure.');
  const hunk = lines.slice(3, -1);
  check(hunk.every(line => /^[ +\-]/.test(line)), 'Unexpected patch hunk.');
  const removed = hunk.filter(line => line[0] === '-').map(line => line.slice(1));
  const added = hunk.filter(line => line[0] === '+').map(line => line.slice(1));
  check(removed.length === 1 && added.length === 1 &&
    removed[0] === "        contentHash: _crypto.default.createHash('md4').update(input).digest('hex')," &&
    added[0] === removed[0].replace("'md4'", "'sha256'"),
  'Patch must change only the expected hash algorithm argument.');
  const beforeHunk = hunk.filter(line => line[0] !== '+')
    .map(line => line.slice(1)).join('\n') + '\n';
  const afterHunk = hunk.filter(line => line[0] !== '-')
    .map(line => line.slice(1)).join('\n') + '\n';

  const modules = path.join(root, 'node_modules');
  const dependency = path.join(modules, PACKAGE_NAME);
  for (const dir of [modules, dependency]) {
    const info = fs.lstatSync(dir);
    check(info.isDirectory() && !info.isSymbolicLink(),
      'Expected a local dependency directory: ' + path.relative(root, dir));
  }
  check(fs.realpathSync(dependency).toLowerCase() ===
    path.join(fs.realpathSync(root), 'node_modules', PACKAGE_NAME).toLowerCase(),
  'Shared or redirected dependency directory is unsupported.');

  const manifestFile = path.join(dependency, 'package.json');
  regularFile(manifestFile);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  check(manifest.name === PACKAGE_NAME && manifest.version === VERSION,
    'Expected compression-webpack-plugin@4.0.1; dependency was not modified.');

  const target = path.join(dependency, 'dist', 'index.js');
  const info = regularFile(target);
  const source = fs.readFileSync(target);
  const currentHash = sha256(source);
  if (currentHash === AFTER_SHA256) {
    console.log('[manager-md4-compat] already-applied ' + PACKAGE_NAME + '@' +
      VERSION + ' sha256=' + AFTER_SHA256);
    return;
  }
  check(currentHash === BEFORE_SHA256,
    'Published plugin SHA-256 mismatch; dependency was not modified.');
  const sourceText = source.toString('utf8');
  check(Buffer.from(sourceText, 'utf8').equals(source), 'Unexpected plugin encoding.');
  const index = sourceText.indexOf(beforeHunk);
  check(index >= 0 && sourceText.indexOf(beforeHunk, index + 1) === -1 &&
    sourceText.split("_crypto.default.createHash('md4')").length === 2,
  'Expected exactly one Webpack 4 MD4 call and patch context.');
  const result = Buffer.from(sourceText.slice(0, index) + afterHunk +
    sourceText.slice(index + beforeHunk.length), 'utf8');
  check(result.length === source.length + 3 && sha256(result) === AFTER_SHA256,
    'Patched plugin SHA-256 mismatch; dependency was not modified.');

  // Replace only this verified local dependency file. Upstream code and its
  // MIT/copyright header remain intact; gzip options and cache structure stay unchanged.
  const temporary = target + '.md4-compat-' + process.pid + '.tmp';
  let descriptor;
  let ownedTemporary = false;
  try {
    descriptor = fs.openSync(temporary, 'wx', info.mode);
    ownedTemporary = true;
    fs.writeFileSync(descriptor, result);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    check(sha256(fs.readFileSync(temporary)) === AFTER_SHA256 &&
      sha256(fs.readFileSync(target)) === BEFORE_SHA256,
    'Dependency changed during patching; replacement aborted.');
    fs.renameSync(temporary, target);
    ownedTemporary = false;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (ownedTemporary) fs.unlinkSync(temporary);
  }
  check(sha256(fs.readFileSync(target)) === AFTER_SHA256,
    'Installed patched plugin verification failed.');
  console.log('[manager-md4-compat] applied ' + PACKAGE_NAME + '@' +
    VERSION + ' sha256=' + AFTER_SHA256);
}

try {
  main();
} catch (error) {
  console.error('[manager-md4-compat] ERROR: ' + error.message);
  process.exitCode = 1;
}
