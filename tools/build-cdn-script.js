'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { computeScriptSha256 } = require('./script-sha');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'Script/mihomoScript.js');
const CDN_SCRIPT = path.join(ROOT, 'Script/mihomoScript.cdn.js');
const CDN_LINK =
  /^([ \t]*\* CDN 脚本：https:\/\/cdn\.jsdelivr\.net\/gh\/dgn0md\/myProxyRules@main\/Script\/mihomoScript\.cdn\.js)$/gm;
const CDN_HASH_FIELD = /^([ \t]*\* 缓存 CDN SHA-256：)[0-9a-f]{64}$/gm;

function replaceCdnHash(source, value) {
  let count = 0;
  const text = source.replace(CDN_HASH_FIELD, (_line, prefix) => {
    count++;
    return `${prefix}${value}`;
  });
  if (count !== 1) throw new Error('CDN 脚本必须且只能包含一个 CDN SHA-256 标识');
  return text;
}

function computeCdnScriptSha256(source) {
  const normalized = replaceCdnHash(source, '0'.repeat(64));
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function buildCdnScript(source) {
  const sourceSha256 = computeScriptSha256(source);
  let count = 0;
  const template = source.replace(CDN_LINK, (line) => {
    count++;
    return `${line}\n *\n * 缓存 CDN SHA-256：${'0'.repeat(64)}`;
  });
  if (count !== 1) throw new Error('源脚本必须且只能包含一个 CDN 脚本链接');
  const cdnSha256 = computeCdnScriptSha256(template);
  return { text: replaceCdnHash(template, cdnSha256), sourceSha256, cdnSha256 };
}

function writeCdnScript() {
  const source = fs.readFileSync(SCRIPT, 'utf8');
  const result = buildCdnScript(source);
  fs.writeFileSync(CDN_SCRIPT, result.text);
  return result;
}

if (require.main === module) {
  try {
    const { sourceSha256, cdnSha256 } = writeCdnScript();
    console.log(`Generated CDN script (Raw ${sourceSha256}; CDN ${cdnSha256})`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildCdnScript, computeCdnScriptSha256, writeCdnScript };
