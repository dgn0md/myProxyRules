'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { computeConfigSha256 } = require('./config-sha');

const ROOT = path.resolve(__dirname, '..');
const RAW_CONFIG = path.join(ROOT, 'Config/mihomoConfig.yaml');
const CDN_CONFIG = path.join(ROOT, 'Config/mihomoConfig.cdn.yaml');
const CDN_LINK =
  /^([ \t]*# CDN 配置：https:\/\/cdn\.jsdelivr\.net\/gh\/dgn0md\/myProxyRules@main\/Config\/mihomoConfig\.cdn\.yaml)$/gm;
const CDN_HASH_FIELD = /^([ \t]*# 缓存 CDN SHA-256：)[0-9a-f]{64}$/gm;
const RAW_HASH_FIELD = /^# 最新 Raw SHA-256：([0-9a-f]{64})$/gm;

function replaceCdnHash(source, value) {
  let count = 0;
  const text = source.replace(CDN_HASH_FIELD, (_line, prefix) => {
    count++;
    return `${prefix}${value}`;
  });
  if (count !== 1) throw new Error('CDN YAML 必须且只能包含一个 CDN SHA-256 标识');
  return text;
}

function computeCdnConfigSha256(source) {
  const normalized = replaceCdnHash(source, '0'.repeat(64));
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function buildCdnConfig(source) {
  const rawSha256 = computeConfigSha256(source);
  const rawHashes = [...source.matchAll(RAW_HASH_FIELD)];
  if (rawHashes.length !== 1 || rawHashes[0][1] !== rawSha256) throw new Error('源 YAML 的 Raw SHA-256 标识已过期');

  let count = 0;
  const template = source.replace(CDN_LINK, (line) => {
    count++;
    return `${line}\n# 缓存 CDN SHA-256：${'0'.repeat(64)}`;
  });
  if (count !== 1) throw new Error('源 YAML 必须且只能包含一个 CDN YAML 链接');
  const cdnSha256 = computeCdnConfigSha256(template);
  return { text: replaceCdnHash(template, cdnSha256), rawSha256, cdnSha256 };
}

function writeCdnConfig({ check = false } = {}) {
  const source = fs.readFileSync(RAW_CONFIG, 'utf8');
  const result = buildCdnConfig(source);
  if (check) {
    if (!fs.existsSync(CDN_CONFIG) || fs.readFileSync(CDN_CONFIG, 'utf8') !== result.text)
      throw new Error('CDN YAML 已过期，请等待 GitHub Actions 重新生成');
    return result;
  }
  fs.writeFileSync(CDN_CONFIG, result.text, { mode: 0o600 });
  return result;
}

function cli(args) {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check'))
    throw new Error('用法：node tools/build-cdn-config.js [--check]');
  const { rawSha256, cdnSha256 } = writeCdnConfig({ check: args[0] === '--check' });
  console.log(`Generated CDN YAML (Raw ${rawSha256}; CDN ${cdnSha256})`);
}

module.exports = { buildCdnConfig, computeCdnConfigSha256, writeCdnConfig };
if (require.main === module) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
