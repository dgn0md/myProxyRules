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
  const url = 'https://www.apple.com/library/test/success.html';
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

test('exclude-only groups keep case-insensitive regexes without broken quantifier commas', () => {
  const config = build().config;
  for (const target of ['surge', 'shadowrocket', 'quantumultx']) {
    const { text } = renderTarget(target, config);
    assert.ok(!text.includes('{2\\,}'), `${target} contains corrupted quantifier comma`);
    const lines = text.split('\n');
    for (const groupName of ['手动选择', '自动选择ex(大陆&香港)', '其他节点']) {
      const line = lines.find((entry) =>
        target === 'quantumultx' ? entry.includes(`= ${groupName},`) : entry.startsWith(`${groupName} = `),
      );
      assert.ok(line, `${target}: missing ${groupName}`);
      const match = /(?:policy-regex-filter|server-tag-regex)=([^,]+)/.exec(line);
      assert.ok(match, `${target}: missing regex filter for ${groupName}`);
      assert.ok(match[1].startsWith('(?i)'), `${target}: ${groupName} lost (?i) case-insensitive prefix`);
      const compiled = new RegExp(match[1].slice(4), 'i');
      assert.equal(compiled.test('PANEL notice'), false, `${target}: ${groupName} should exclude uppercase PANEL`);
      if (groupName === '自动选择ex(大陆&香港)') {
        assert.equal(compiled.test('hk 01'), false);
        assert.equal(compiled.test('china node'), false);
        assert.equal(compiled.test('taiwan 01'), true);
      }
      if (groupName === '其他节点') {
        assert.equal(compiled.test('Japan 01'), false);
        assert.equal(compiled.test('Unknown Node 01'), true);
      }
    }
  }
});

test('parseRule extracts policy before optional parameters such as no-resolve', () => {
  const surge = buildRules('surge', {
    rules: ['RULE-SET,google,Google,no-resolve', 'IP-CIDR,1.2.3.4/32,DIRECT,no-resolve'],
  });
  assert.deepEqual(surge.lines, [
    'RULE-SET,https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Google/Google.list,Google,no-resolve',
    'IP-CIDR,1.2.3.4/32,DIRECT,no-resolve',
  ]);
  assert.deepEqual(surge.mappedRemoteProviders, ['google']);

  const qx = buildRules('quantumultx', {
    rules: ['IP-CIDR,1.2.3.4/32,DIRECT,no-resolve'],
  });
  assert.deepEqual(qx.lines, ['ip-cidr, 1.2.3.4/32, direct,no-resolve']);
});

test('Quantumult X static region policies keep their auto-select sub-policy and profiles follow IPv6 option', () => {
  const defaultConfig = build().config;
  const qx = renderTarget('quantumultx', defaultConfig).text;
  assert.match(qx, /^static = 香港, 香港-自动选择, resource-tag-regex=订阅, server-tag-regex=/m);
  assert.match(qx, /^static = 美国, 美国-自动选择, resource-tag-regex=订阅, server-tag-regex=/m);

  const ipv4Only = build({ settings: { options: { IPv6: false } } }).config;
  assert.match(renderTarget('surge', ipv4Only).text, /^ipv6 = false$/m);
  assert.match(renderTarget('shadowrocket', ipv4Only).text, /^ipv6 = false$/m);
});
