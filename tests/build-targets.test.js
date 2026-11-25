'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const {
  RULE_SOURCE_REGISTRY,
  buildRules,
  resolveRuleSource,
  sameUpstreamRuleCandidates,
  renderTarget,
} = require('../tools/build-targets');
const { build } = require('../tools/build');

const appleCnUrl =
  'https://raw.githubusercontent.com/SukkaW/Surge/0afc9c2ee92aadbf79ce1c9caf03f724135073ea/Source/non_ip/apple_cn.conf';

test('generated clients use the Apple health-check URL', () => {
  const config = build().config;
  const url = 'http://www.apple.com/library/test/success.html';
  for (const target of ['stash', 'surge', 'shadowrocket', 'quantumultx']) {
    const { text } = renderTarget(target, config);
    assert.ok(text.includes(url), `${target} does not use the Apple health-check URL`);
    assert.ok(!text.includes('cp.cloudflare.com/generate_204'));
    if (target === 'quantumultx') assert.ok(text.includes(`server_check_url = ${url}`));
    if (target === 'stash') {
      assert.deepEqual(YAML.parse(text), JSON.parse(JSON.stringify(config)));
    } else if (target !== 'quantumultx') {
      const groups = text.split('[Proxy Group]\n')[1].split('\n[Rule]')[0].split('\n');
      const automatic = groups.filter((line) => /= (?:url-test|load-balance),/.test(line));
      assert.ok(automatic.length > 0, `${target} has no automatic groups`);
      for (const line of automatic) assert.ok(line.includes(`url=${url}`), `${target}: ${line}`);
    }
  }
});

test('AppleProxy uses native fallback when same-upstream variants are not equivalent', () => {
  for (const target of ['surge', 'shadowrocket', 'quantumultx']) {
    const candidate = RULE_SOURCE_REGISTRY.apple_proxy.sameUpstream[target];
    const source = resolveRuleSource(target, 'apple_proxy');
    assert.equal(candidate.compatibilityVerified, false);
    assert.match(candidate.reason, /different rule types and member counts/);
    const pathTarget = target === 'quantumultx' ? 'QuantumultX' : target[0].toUpperCase() + target.slice(1);
    assert.equal(source.upstream, 'blackmatrix7/ios_rule_script');
    assert.equal(source.selection, 'client-native-fallback');
    assert.match(source.url, new RegExp('/' + pathTarget + '/AppleProxy/AppleProxy\\.list$'));
  }
});

test('Sukka Apple CN uses the same upstream rule file where supported', () => {
  for (const target of ['surge', 'shadowrocket']) {
    const source = resolveRuleSource(target, 'apple_cn');
    assert.equal(source.url, appleCnUrl);
    assert.equal(source.upstream, 'SukkaW/Surge');
    assert.equal(source.selection, 'same-upstream-native-variant');
    assert.equal(source.compatibilityVerified, true);
  }
  assert.equal(resolveRuleSource('quantumultx', 'apple_cn'), undefined);
});

test('generic Bett variants fall back to verified client-native sources', () => {
  const entry = RULE_SOURCE_REGISTRY.google;
  assert.equal(entry.upstream, 'appshubcc/bett-rules');
  assert.match(entry.sameUpstreamReason, /generic payload formats/);

  const providerConfig = {
    'rule-providers': {
      google: {
        type: 'http',
        format: 'mrs',
        behavior: 'domain',
        url: 'https://fastly.jsdelivr.net/gh/appshubcc/bett-rules@meta/geo/geosite/google.mrs',
      },
    },
  };
  const candidates = sameUpstreamRuleCandidates('surge', 'google', providerConfig);
  assert.deepEqual(
    candidates.map((candidate) => candidate.url),
    [
      'https://fastly.jsdelivr.net/gh/appshubcc/bett-rules@meta/geo/geosite/google.list',
      'https://fastly.jsdelivr.net/gh/appshubcc/bett-rules@meta/geo/geosite/google.yaml',
    ],
  );
  assert.ok(candidates.every((candidate) => !candidate.compatibilityVerified));

  const expected = {
    surge: 'rule-set',
    shadowrocket: 'rule-set',
    quantumultx: 'quantumultx-filter',
  };
  for (const [target, format] of Object.entries(expected)) {
    const source = resolveRuleSource(target, 'google', providerConfig);
    assert.equal(source.selection, 'client-native-fallback');
    assert.equal(source.upstream, 'blackmatrix7/ios_rule_script');
    assert.equal(source.format, format);
  }
});

test('remote rule rendering follows the resolved client source format', () => {
  const surge = buildRules('surge', { rules: ['RULE-SET,google,Google'] });
  assert.deepEqual(surge.lines, [
    'RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Google/Google.list,Google',
  ]);

  const quantumultx = buildRules('quantumultx', { rules: ['RULE-SET,google,Google'] });
  assert.deepEqual(quantumultx.lines, [
    'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/QuantumultX/Google/Google.list, force-policy=Google, enabled=true',
  ]);
});

test('unverified MRS replacements and unsupported compound rules remain omitted', () => {
  const result = buildRules('surge', {
    rules: [
      'RULE-SET,geolocation-cn,DIRECT',
      'RULE-SET,cn_ip,DIRECT',
      'RULE-SET,domestic_alibaba,DIRECT',
      'AND,((RULE-SET,domestic_alibaba),(NOT,((RULE-SET,domestic_alibaba_noncn)))),DIRECT',
    ],
  });

  assert.deepEqual(result.lines, []);
  assert.ok(result.omitted.some((entry) => entry.startsWith('geolocation-cn ')));
  assert.ok(result.omitted.some((entry) => entry.startsWith('cn_ip ')));
  assert.ok(result.omitted.some((entry) => entry.startsWith('domestic_alibaba ')));
  assert.ok(result.omitted.some((entry) => entry.startsWith('AND ')));
});
