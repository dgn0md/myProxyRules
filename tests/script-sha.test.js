'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { build } = require('../tools/build');
const { computeScriptSha256, updateScriptSha256 } = require('../tools/script-sha');
const { buildCdnScript, computeCdnScriptSha256 } = require('../tools/build-cdn-script');

const rawUrl = 'https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Script/mihomoScript.js';
const cdnUrl = 'https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Script/mihomoScript.cdn.js';

const MARKERS = `/**
 * 最新 Raw SHA-256：${'0'.repeat(64)}
 * Raw 脚本：${rawUrl}
 * CDN 脚本：${cdnUrl}
 * 示例脚本内容
 */
`;

test('script SHA-256 is stable when its own identifier fields are updated', () => {
  const result = updateScriptSha256(MARKERS);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(computeScriptSha256(result.text), result.sha256);
  assert.equal(result.text.match(new RegExp(result.sha256, 'g')).length, 1);
  assert.notEqual(computeScriptSha256(result.text.replace('示例脚本内容', '更新后的脚本内容')), result.sha256);
});

test('source and generated CDN copy carry distinct version identifiers', () => {
  const script = fs.readFileSync('Script/mihomoScript.js', 'utf8');
  const rawSha256 = computeScriptSha256(script);
  const cdn = buildCdnScript(script);
  const cdnScript = cdn.text;
  const text = build().text;
  assert.match(script, new RegExp(`最新 Raw SHA-256：${rawSha256}`));
  assert.doesNotMatch(script, /缓存 CDN SHA-256/);
  assert.match(cdnScript, new RegExp(`最新 Raw SHA-256：${rawSha256}`));
  assert.match(cdnScript, new RegExp(`缓存 CDN SHA-256：${cdn.cdnSha256}`));
  assert.equal(computeCdnScriptSha256(cdnScript), cdn.cdnSha256);
  assert.notEqual(rawSha256, cdn.cdnSha256);
  assert.ok(cdnScript.includes(cdnUrl));
  assert.ok(!text.includes(rawUrl));
  assert.ok(!text.includes(cdnUrl));
  assert.ok(text.includes('https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/mihomoConfig.yaml'));
  assert.ok(text.includes('https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/mihomoConfig.cdn.yaml'));
  assert.ok(text.includes('MIT License；Copyright (c) 2026 dgn0md、AIsouler。'));
});
