'use strict';
// Internal shared snapshot reader for native Mihomo checks; decoded files stay in the temporary directory.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');

const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]+$/i;
const DNS_HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]{2,}$/i;

function matchesDomain(snapshot, host) {
  host = host.toLowerCase();
  if (snapshot.exact.has(host)) return true;
  for (let pos = 0; ;) {
    const suffix = pos === 0 ? host : host.slice(pos);
    if (snapshot.suffix.has(suffix)) return true;
    const nextDot = host.indexOf('.', pos);
    if (nextDot === -1) return false;
    pos = nextDot + 1;
  }
}

function createSnapshotReader({ binary, rulesDir, temp, providers }) {
  const cache = new Map();

  function read(name) {
    if (cache.has(name)) return cache.get(name);
    const spec = providers[name];
    assert.ok(spec && ['domain', 'classical'].includes(spec.behavior), `invalid sample provider ${name}`);
    const input = path.resolve(rulesDir, `${name}${path.extname(spec.path)}`);
    let rules;
    if (spec.format === 'mrs' && spec.behavior === 'domain') {
      const output = path.join(temp, `${name}-samples.txt`);
      const result = spawnSync(binary, ['convert-ruleset', 'domain', 'mrs', input, output], {
        encoding: 'utf8',
        timeout: 10000,
      });
      assert.equal(result.status, 0, `${name}: ${result.stdout}\n${result.stderr}`);
      rules = fs
        .readFileSync(output, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } else if (spec.format === 'yaml' && spec.behavior === 'classical') {
      const document = YAML.parseDocument(fs.readFileSync(input, 'utf8'), { uniqueKeys: true });
      assert.equal(document.errors.length, 0, `${name}: ${document.errors[0]?.message}`);
      rules = document.toJS()?.payload;
      assert.ok(Array.isArray(rules), `${name}: missing YAML payload`);
    } else if (spec.format === 'text' && spec.behavior === 'classical') {
      rules = fs
        .readFileSync(input, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    } else {
      assert.fail(`unsupported sample provider ${name}: ${spec.format}/${spec.behavior}`);
    }

    const exact = new Set();
    const suffix = new Set();
    for (const rule of rules) {
      if (/^DOMAIN,/i.test(rule)) exact.add(rule.split(',')[1].toLowerCase());
      else if (/^DOMAIN-SUFFIX,/i.test(rule)) suffix.add(rule.split(',')[1].toLowerCase());
      else if (rule.startsWith('+.')) suffix.add(rule.slice(2).toLowerCase());
      else if (!/^(?:PROCESS-NAME|PROCESS-PATH),/i.test(rule) && spec.format === 'mrs') exact.add(rule.toLowerCase());
    }
    assert.ok(exact.size || suffix.size, `${name}: no domain members in snapshot`);

    let hostsCache = null;
    let dnsCandidatesCache = null;
    const snapshot = {
      exact,
      suffix,
      get hosts() {
        if (!hostsCache) {
          hostsCache = [...new Set([...exact, ...suffix])].filter((host) => HOST_PATTERN.test(host)).sort();
        }
        return hostsCache;
      },
      get candidates() {
        if (!dnsCandidatesCache) {
          dnsCandidatesCache = [
            ...[...suffix].map((domain, index) => `dns-policy-probe-${index}.${domain}`),
            ...exact,
          ].filter((host) => DNS_HOST_PATTERN.test(host));
        }
        return dnsCandidatesCache;
      },
      matches: (host) => matchesDomain(snapshot, host),
    };
    cache.set(name, snapshot);
    return snapshot;
  }

  return { read };
}

module.exports = { createSnapshotReader, matchesDomain };
