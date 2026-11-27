'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { build, load } = require('../tools/build');
const { loadScript } = require('../Test/lib/loader');
const YAML = require('yaml');
const fx = require('../Test/lib/fixtures');
const siriAiGroup = 'Siri Ai/Apple Intelligence';
const siriAiOption = 'Apple智能分流';
const appleProxyGroup = 'AppleProxy';
const otherAppleGroup = 'Other Apple Service';
const otherAppleOption = 'Apple其他服务';
const domesticDnsResolvers = ['https://dns.alidns.com/dns-query#DIRECT', 'https://doh.pub/dns-query#DIRECT'];
const dnsRouteFor = (resolver) => resolver.split('#')[1]?.split('&')[0];
const autoSelectExMainlandHongKongGroup = '自动选择ex(大陆&香港)';
const autoSelectExMainlandHongKongOption = '排除大陆香港自动选';
const proxy = (name) => ({ name, type: 'ss', server: '192.0.2.1', port: 443, cipher: 'aes-128-gcm', password: 'test' });
const clean = () => ({
  proxies: [proxy('美国 测试')],
});
function policyKeyForRuleSet(config, provider) {
  const prefix = 'rule-set:';
  return Object.keys(config.dns['nameserver-policy']).find(
    (key) => key.startsWith(prefix) && key.slice(prefix.length).split(',').includes(provider),
  );
}
function policyForRuleSet(config, provider) {
  const key = policyKeyForRuleSet(config, provider);
  return key ? config.dns['nameserver-policy'][key] : undefined;
}
function graph(config) {
  const groups = new Map(config['proxy-groups'].map((g) => [g.name, g]));
  const nodes = new Set(config.proxies.map((p) => p.name));
  const builtins = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE']);
  assert.equal(groups.size, config['proxy-groups'].length, 'duplicate group names');
  assert.equal(nodes.size, config.proxies.length, 'duplicate node names');
  for (const name of groups.keys()) assert.ok(!nodes.has(name), `node collides with group ${name}`);
  const exists = (name) => groups.has(name) || nodes.has(name) || builtins.has(name);
  for (const g of groups.values()) {
    for (const p of g.proxies || []) assert.ok(exists(p), `dangling ${g.name} → ${p}`);
    if (g['default-selected']) assert.ok(g.proxies.includes(g['default-selected']));
  }
  const visited = new Set();
  function visit(name, visiting = new Set()) {
    if (visited.has(name) || !groups.has(name)) return;
    assert.ok(!visiting.has(name), `cycle at ${name}`);
    const next = new Set(visiting).add(name);
    for (const target of groups.get(name).proxies || []) visit(target, next);
    visited.add(name);
  }
  for (const g of groups.keys()) visit(g);
  for (const rule of config.rules) {
    const parts = rule.split(',');
    const target = parts.at(-1) === 'no-resolve' ? parts.at(-2) : parts.at(-1);
    assert.ok(exists(target), `unknown rule target ${rule}`);
  }
  const providerPayloads = Object.values(config['rule-providers']).map((provider) =>
    provider.type === 'inline' ? provider.payload : [],
  );
  const refs = JSON.stringify([config.rules, config.dns, providerPayloads]);
  for (const match of refs.matchAll(/RULE-SET,([A-Za-z0-9_!@.-]+)/g))
    assert.ok(config['rule-providers'][match[1]], `missing provider ${match[1]}`);
  const dnsRuleSetProviders = new Set([
    ...Object.keys(config.dns['nameserver-policy'] || {})
      .filter((key) => key.startsWith('rule-set:'))
      .flatMap((key) => key.slice('rule-set:'.length).split(',')),
    ...(config.dns['fake-ip-filter'] || [])
      .filter((key) => key.startsWith('rule-set:'))
      .flatMap((key) => key.slice('rule-set:'.length).split(',')),
  ]);
  for (const provider of dnsRuleSetProviders)
    assert.ok(config['rule-providers'][provider], `missing policy provider ${provider}`);
  for (const [key, provider] of Object.entries(config['rule-providers'])) {
    if (provider.type !== 'inline') assert.equal(provider.interval, 86400);
    assert.ok(
      refs.includes(`RULE-SET,${key},`) ||
        refs.includes(`RULE-SET,${key})`) ||
        refs.includes(`rule-set:${key}\"`) ||
        dnsRuleSetProviders.has(key),
      `unused provider ${key}`,
    );
  }
  for (const p of config.proxies) if (p['dialer-proxy']) assert.ok(exists(p['dialer-proxy']));
}
function encryptedDns(config) {
  const dns = config.dns;
  assert.equal(dns['use-system-hosts'], false);
  assert.equal(dns['prefer-h3'], false);
  assert.ok(!dns.fallback);
  const arrays = ['default-nameserver', 'nameserver', 'proxy-server-nameserver', 'direct-nameserver'];
  const values = arrays.flatMap((key) => dns[key] || []);
  for (const field of ['nameserver-policy', 'proxy-server-nameserver-policy']) {
    for (const value of Object.values(dns[field] || {})) values.push(...(Array.isArray(value) ? value : [value]));
  }
  for (const value of values) {
    assert.match(value, /^(https|tls|quic|rcode):\/\//);
    assert.doesNotMatch(value, /skip-cert-verify=true|^system|^dhcp/);
  }
  assert.deepEqual(dns['default-nameserver'], [
    'https://223.5.5.5/dns-query#DIRECT&name-cert-verify=dns.alidns.com',
    'https://1.12.12.12/dns-query#DIRECT&name-cert-verify=doh.pub',
  ]);
  const expectedDefaultNameserverGroup =
    config['proxy-groups'].some((g) => g.name === '漏网之鱼') &&
    config['proxy-groups'].some((g) => g.name === autoSelectExMainlandHongKongGroup)
      ? '自动选择ex(大陆%26香港)'
      : '默认代理';
  assert.deepEqual(dns.nameserver, [
    `https://cloudflare-dns.com/dns-query#${expectedDefaultNameserverGroup}&h3=true`,
    `https://dns.google/dns-query#${expectedDefaultNameserverGroup}`,
  ]);
  assert.deepEqual(dns['proxy-server-nameserver'], [
    'https://dns.alidns.com/dns-query#DIRECT',
    'https://doh.pub/dns-query#DIRECT',
  ]);
  assert.deepEqual(config.hosts['dns.alidns.com'], ['223.5.5.5', '223.6.6.6']);
  assert.deepEqual(config.hosts['doh.pub'], ['1.12.12.12', '120.53.53.53']);
  assert.deepEqual(config.hosts['cloudflare-dns.com'], ['1.1.1.1', '1.0.0.1']);
  assert.deepEqual(config.hosts['dns.google'], ['8.8.8.8', '8.8.4.4']);
  assert.equal(config.hosts['one.one.one.one'], undefined);
}
test('sample-style country names cover regional groups and correct conflicting Taiwan flags', () => {
  const samples = [
    ['香港', '🇭🇰 fixture HK endpoint'],
    ['新加坡', '🇸🇬 fixture SG endpoint'],
    ['菲律宾', '🇵🇭 fixture PH endpoint'],
    ['印度尼西亚', '🇮🇩 fixture ID endpoint'],
    ['越南', '🇻🇳 fixture VN endpoint'],
    ['澳大利亚', '🇦🇺 fixture AU endpoint'],
    ['印度', '🇮🇳 fixture IN endpoint'],
    ['韩国', '🇭🇰 fixture KR endpoint'],
    ['日本', '🇯🇵 fixture JP endpoint'],
    ['美国', '🇺🇸 fixture US endpoint'],
    ['加拿大', '🇨🇦 fixture CA endpoint'],
    ['台湾', '🇨🇳 fixture TW 台湾 endpoint'],
    ['德国', '🇩🇪 fixture DE endpoint'],
    ['英国', '🇬🇧 fixture UK endpoint'],
    ['法国', '🇫🇷 fixture FR endpoint'],
    ['荷兰', '🇳🇱 fixture NL endpoint'],
    ['西班牙', '🇪🇸 fixture ES endpoint'],
    ['俄罗斯', '🇷🇺 fixture RU endpoint'],
    ['乌克兰', '🇺🇦 fixture UA endpoint'],
    ['土耳其', '🇹🇷 fixture TR endpoint'],
    ['挪威', '🇳🇴 fixture NO endpoint'],
    ['瑞士', '🇨🇭 fixture CH endpoint'],
    ['瑞典', '🇸🇪 fixture SE endpoint'],
    ['爱尔兰', '🇮🇪 fixture IE endpoint'],
    ['泰国', '🇹🇭 fixture TH endpoint'],
    ['马来西亚', '🇲🇾 fixture MY endpoint'],
  ];
  const config = build({ subscription: { proxies: samples.map(([, name]) => proxy(name)) } }).config;
  for (const [region, name] of samples) {
    const group = config['proxy-groups'].find((entry) => entry.name === region);
    assert.ok(group, `missing region group ${region}`);
    const normalized = name.replace(
      /^[\u{1F1E6}-\u{1F1FF}]{2}/u,
      { 台湾: '🇹🇼', 韩国: '🇰🇷' }[region] || name.match(/^[\u{1F1E6}-\u{1F1FF}]{2}/u)?.[0],
    );
    assert.ok(group.proxies.includes(normalized), `${name} should be in ${region}`);
  }
  assert.ok(config.proxies.some((entry) => entry.name === '🇹🇼 fixture TW 台湾 endpoint'));
  assert.ok(config.proxies.some((entry) => entry.name === '🇰🇷 fixture KR endpoint'));
});

test('sample multiplier and residential labels enter their matching groups without treating node indices as rates', () => {
  const names = [
    '🇭🇰 fixture 6x home broadband',
    '🇭🇰 fixture 3x residential',
    '🇺🇸 fixture 10x residential [manual proxy only]',
    '🇯🇵 fixture route 14| BGP',
    '🇹🇼 Taiwan residential endpoint HINET',
    '🇺🇸 fixture speed 08| ordinary',
    '🇺🇸 fixture 1.5x residential',
    '🇸🇬 fixture 0.5x residential',
    '🇺🇸 fixture 1.0x standard',
    '🇩🇪 fixture 2倍率 residential',
  ];
  const config = build({ subscription: { proxies: names.map(proxy) } }).config;
  const members = (name) => config['proxy-groups'].find((group) => group.name === name)?.proxies || [];
  for (const name of names.slice(0, 3)) assert.ok(members('高倍率节点').includes(name), `${name} should be high rate`);
  assert.ok(members('高倍率节点').includes(names[6]), '1.5x should be high rate');
  assert.ok(members('低倍率节点').includes(names[7]), '0.5x should be low rate');
  assert.ok(members('高倍率节点').includes(names[9]), '2倍率 should be high rate');
  assert.ok(!members('高倍率节点').includes(names[5]), 'node index 08 is not a multiplier');
  assert.ok(!members('高倍率节点').includes(names[8]), '1.0x is not a high multiplier');
  for (const name of [names[0], names[1], names[2], names[4]])
    assert.ok(members('家宽节点').includes(name), `${name} should be residential`);
  assert.ok(members('日本').includes(names[3]));
});

test('announcement and website rows are filtered even when they contain a recognized region', () => {
  const blocked = [
    'Panel: www.example.invalid',
    '🇺🇸 residential provider website: https://example.invalid/help',
    '🇺🇸 US service announcement: https://example.invalid/info',
  ];
  const validWarningNode = '🇺🇸 10x US residential [manual proxy only]';
  const config = build({ subscription: { proxies: [...blocked, validWarningNode].map(proxy) } }).config;
  for (const name of blocked) assert.ok(!config.proxies.some((entry) => entry.name.includes(name)));
  assert.ok(config.proxies.some((entry) => entry.name === validWarningNode));
  assert.ok(config['proxy-groups'].find((group) => group.name === '美国').proxies.includes(validWarningNode));
});

test('static provider has all sample region groups and compatible filters preserve regional backups', () => {
  const config = build().config;
  const regions = [
    '香港',
    '日本',
    '美国',
    '新加坡',
    '台湾',
    '韩国',
    '澳大利亚',
    '印度',
    '加拿大',
    '德国',
    '英国',
    '法国',
    '荷兰',
    '西班牙',
    '俄罗斯',
    '乌克兰',
    '土耳其',
    '挪威',
    '瑞士',
    '瑞典',
    '爱尔兰',
    '菲律宾',
    '印度尼西亚',
    '越南',
    '泰国',
    '马来西亚',
  ];
  for (const region of regions) {
    const group = config['proxy-groups'].find((entry) => entry.name === region);
    assert.ok(group, `static provider missing ${region}`);
    assert.ok(group.filter);
    assert.ok(group['exclude-filter']?.includes('官网'));
    assert.ok(!group['exclude-filter']?.includes('备用'), `${region} should retain backup nodes`);
    assert.doesNotMatch(group.filter, /\(\?:|\(\?[=!<]/, `${region} filter must be Mihomo-compatible`);
  }
  const other = config['proxy-groups'].find((entry) => entry.name === '其他节点');
  assert.ok(other['exclude-filter']?.includes('panel'));
});
test('static provider removes contradictory mainland flag from Taiwan names before group filters', () => {
  const provider = build().config['proxy-providers'].订阅;
  assert.equal(provider.override['proxy-name'].length, 2);
  for (const rule of provider.override['proxy-name']) assert.match(rule.pattern, /台湾/);
  assert.match(provider.override['proxy-name'][0].pattern, /🇨🇳/);
});

test('health checks use the Apple endpoint and require HTTP 200 in static and expanded modes', () => {
  for (const subscription of [undefined, clean()]) {
    const config = build({ subscription }).config;
    for (const group of config['proxy-groups'].filter((entry) => ['url-test', 'load-balance'].includes(entry.type))) {
      assert.equal(group.url, 'https://www.apple.com/library/test/success.html', group.name);
      assert.equal(group['expected-status'], 200, group.name);
    }
    if (!subscription) {
      assert.equal(
        config['proxy-providers'].订阅['health-check'].url,
        'https://www.apple.com/library/test/success.html',
      );
      assert.equal(config['proxy-providers'].订阅['health-check']['expected-status'], 200);
    }
    assert.equal(config.dns['cache-algorithm'], 'lru');
    assert.equal(config.dns['cache-max-size'], 1);
    assert.equal(config['disable-keep-alive'], true);
  }
});

test('static and expanded modes classify region codes containing zero-width spaces', () => {
  const name = 'H\u200bK sample';
  const expanded = build({ subscription: { proxies: [proxy(name)] } }).config;
  const hk = expanded['proxy-groups'].find((group) => group.name === '香港');
  assert.ok(hk.proxies.some((member) => member.includes(name)));
  const staticFilter = build().config['proxy-groups'].find((group) => group.name === '香港').filter;
  assert.equal(new RegExp(staticFilter.replace(/^\(\?i\)/, ''), 'i').test(name), true);
  assert.equal(new RegExp(staticFilter.replace(/^\(\?i\)/, ''), 'i').test('SH\u200bK sample'), false);
  const other = build().config['proxy-groups'].find((group) => group.name === '其他节点')['exclude-filter'];
  assert.equal(new RegExp(other.replace(/^\(\?i\)/, ''), 'i').test(name), true);
});

test('mainland/Hong Kong auto-select group excludes those labels and keeps Taiwan', () => {
  const subscription = {
    proxies: [
      proxy('🇭🇰 香港 01'),
      proxy('HK 02 Hong Kong'),
      proxy('🇭🇰 Node 03'),
      proxy('HKG node 04'),
      proxy('🇨🇳 中国大陆 01'),
      proxy('大陆 上海 02'),
      proxy('CN node 03'),
      proxy('China-Guangzhou 04'),
      proxy('🇨🇳 中国台湾 TW 01'),
      proxy('🇯🇵 日本 01'),
      proxy('US Los Angeles 01'),
      proxy('PRC Mainland 02'),
    ],
  };
  const config = build({ subscription }).config;
  const group = config['proxy-groups'].find((entry) => entry.name === autoSelectExMainlandHongKongGroup);
  assert.ok(group);
  assert.equal(group.type, 'url-test');
  assert.equal(group.interval, 600);
  assert.ok(group.proxies.includes('🇹🇼 中国台湾 TW 01'));
  assert.ok(group.proxies.includes('🇯🇵 日本 01'));
  assert.ok(group.proxies.includes('🇺🇸 US Los Angeles 01'));
  assert.deepEqual(group.proxies, ['🇹🇼 中国台湾 TW 01', '🇯🇵 日本 01', '🇺🇸 US Los Angeles 01']);

  const staticConfig = build().config;
  const staticGroup = staticConfig['proxy-groups'].find((entry) => entry.name === autoSelectExMainlandHongKongGroup);
  assert.equal(staticGroup['include-all-providers'], true);
  assert.match(staticGroup['exclude-filter'], /香港/);
  assert.match(staticGroup['exclude-filter'], /大陆/);
  assert.ok(
    staticConfig['proxy-groups']
      .find((entry) => entry.name === '默认代理')
      .proxies.includes(autoSelectExMainlandHongKongGroup),
  );
  assert.ok(
    staticConfig['proxy-groups']
      .find((entry) => entry.name === 'GLOBAL')
      .proxies.includes(autoSelectExMainlandHongKongGroup),
  );
  assert.ok(!staticConfig['proxy-groups'].some((entry) => entry.name === '自动选择'));
  const serviceGroupsWithGeneralCandidates = [
    'FCM',
    'YouTube',
    'GitHub',
    'Microsoft',
    otherAppleGroup,
    'Telegram',
    '海外游戏',
    'Twitter',
    'Line',
    'Netflix',
    'Emby',
    'PikPak',
    'BT/PT',
    'Spotify',
    'Crypto',
    'PayPal',
    'Patreon',
    'EHentai',
    appleProxyGroup,
  ];
  for (const name of serviceGroupsWithGeneralCandidates) {
    assert.ok(
      staticConfig['proxy-groups']
        .find((entry) => entry.name === name)
        .proxies.includes(autoSelectExMainlandHongKongGroup),
      `${name} should offer the replacement auto-select group`,
    );
  }
  for (const name of ['Google', 'AI', 'TikTok', 'Meta', siriAiGroup]) {
    assert.ok(
      !staticConfig['proxy-groups']
        .find((entry) => entry.name === name)
        .proxies.includes(autoSelectExMainlandHongKongGroup),
      `${name} should retain its restricted regional candidates`,
    );
  }

  const disabled = build({ settings: { options: { [autoSelectExMainlandHongKongOption]: false } } }).config;
  assert.ok(!disabled['proxy-groups'].some((entry) => entry.name === autoSelectExMainlandHongKongGroup));
  const migrated = build({ settings: { options: { 自动选择: false } } });
  assert.ok(!migrated.config['proxy-groups'].some((entry) => entry.name === autoSelectExMainlandHongKongGroup));
  assert.equal(YAML.parse(migrated.text)['x-myProxyRules'].options[autoSelectExMainlandHongKongOption], false);
  const explicitNewOptionWins = build({
    settings: { options: { 自动选择: false, [autoSelectExMainlandHongKongOption]: true } },
  }).config;
  assert.ok(explicitNewOptionWins['proxy-groups'].some((entry) => entry.name === autoSelectExMainlandHongKongGroup));
  const minimal = build({ settings: { options: { 极简分流: true } } }).config;
  assert.ok(minimal['proxy-groups'].some((entry) => entry.name === autoSelectExMainlandHongKongGroup));
  assert.ok(
    minimal['proxy-groups']
      .find((entry) => entry.name === '默认代理')
      .proxies.includes(autoSelectExMainlandHongKongGroup),
  );
});

test('GLOBAL and default proxy prefer the requested available groups in both modes', () => {
  for (const minimal of [false, true]) {
    for (const subscription of [undefined, fx.typicalSubscription(), fx.minimalSubscription()]) {
      for (const enabled of [false, true]) {
        const config = build({
          subscription,
          settings: {
            options: {
              极简分流: minimal,
              [autoSelectExMainlandHongKongOption]: enabled,
            },
          },
        }).config;
        const groups = new Map(config['proxy-groups'].map((entry) => [entry.name, entry]));
        const global = groups.get('GLOBAL');
        const proxy = groups.get('默认代理');
        if (groups.has('美国')) assert.equal(global.proxies[0], '美国');
        else assert.ok(!global.proxies.includes('美国'));
        if (enabled) assert.equal(proxy.proxies[0], autoSelectExMainlandHongKongGroup);
        else assert.ok(!(proxy.proxies || []).includes(autoSelectExMainlandHongKongGroup));
        assert.equal(new Set(global.proxies).size, global.proxies.length);
        assert.equal(new Set(proxy.proxies || []).size, (proxy.proxies || []).length);
        graph(config);
      }
    }
  }
});

test('domestic vendor DNS policies follow the route toggle and match domestic sets', () => {
  const modules = [
    ['alibaba', true],
    ['bilibili', true],
    ['bytedance', true],
    ['chinamobile', true],
    ['chinatelecom', true],
    ['chinaunicom', true],
    ['huaweicloud', true],
    ['jd', true],
    ['netease', true],
    ['sina', true],
    ['tencent', true],
    ['xiaomi', true],
    ['xiaohongshu', true],
  ];
  const domesticResolvers = domesticDnsResolvers;
  for (const subscription of [undefined, clean()]) {
    for (const minimal of [false, true]) {
      const baseline = build({
        subscription,
        settings: {
          options: {
            极简分流: minimal,
          },
        },
      }).config;
      for (const options of [{}, { 国内服务优先直连: false }]) {
        const config = build({
          subscription,
          settings: {
            options: {
              极简分流: minimal,
              ...options,
            },
          },
        }).config;
        for (const field of ['nameserver', 'default-nameserver', 'proxy-server-nameserver', 'fake-ip-filter'])
          assert.deepEqual(config.dns[field], baseline.dns[field]);
        for (const provider of ['dns_domestic_cdn', 'dns_microsoft_cdn'])
          assert.deepEqual(policyForRuleSet(config, provider), policyForRuleSet(baseline, provider));
        for (const [source, excludeOverseas] of modules) {
          const name = `domestic_${source}`;
          const rule = excludeOverseas
            ? `AND,((RULE-SET,${name}),(NOT,((RULE-SET,${name}_noncn)))),直连`
            : `RULE-SET,${name},直连`;
          const enabled = options.国内服务优先直连 !== false;
          assert.equal(config.rules.includes(rule), enabled);
          const moduleProviders = excludeOverseas
            ? [
                [name, source],
                [`${name}_noncn`, `${source}@!cn`],
              ]
            : [[name, source]];
          for (const [provider, file] of moduleProviders) {
            assert.equal(!!config['rule-providers'][provider], enabled);
            if (!enabled) continue;
            assert.ok(config['rule-providers'][provider].url.endsWith(`/geosite/${file}.mrs`));
            assert.equal(config['rule-providers'][provider].interval, 86400);
          }
          const dnsProvider = `${name}_dns`;
          if (excludeOverseas) {
            assert.equal(
              !!config['rule-providers'][dnsProvider],
              enabled,
              `${dnsProvider} should follow 国内服务优先直连`,
            );
            if (enabled)
              assert.deepEqual(config['rule-providers'][dnsProvider], {
                type: 'inline',
                format: 'text',
                behavior: 'classical',
                payload: [`AND,((RULE-SET,${name}),(NOT,((RULE-SET,${name}_noncn))))`],
              });
            assert.deepEqual(policyForRuleSet(config, dnsProvider), enabled ? domesticResolvers : undefined);
            assert.equal(policyForRuleSet(config, name), undefined);
            assert.equal(policyForRuleSet(config, `${name}_noncn`), undefined);
            if (enabled) {
              const policyIndex = Object.keys(config.dns['nameserver-policy']).indexOf(
                policyKeyForRuleSet(config, dnsProvider),
              );
              const geolocationIndex = Object.keys(config.dns['nameserver-policy']).indexOf(
                policyKeyForRuleSet(config, 'geolocation-cn'),
              );
              const providerOrder = policyKeyForRuleSet(config, dnsProvider).slice('rule-set:'.length).split(',');
              assert.ok(
                policyIndex <= geolocationIndex &&
                  providerOrder.indexOf(dnsProvider) < providerOrder.indexOf('geolocation-cn'),
                `${dnsProvider} must precede the broad geolocation-cn policy`,
              );
            }
          } else {
            assert.equal(config['rule-providers'][dnsProvider], undefined);
            assert.deepEqual(policyForRuleSet(config, name), enabled ? domesticResolvers : undefined);
            if (enabled) {
              const policyIndex = Object.keys(config.dns['nameserver-policy']).indexOf(
                policyKeyForRuleSet(config, name),
              );
              const geolocationIndex = Object.keys(config.dns['nameserver-policy']).indexOf(
                policyKeyForRuleSet(config, 'geolocation-cn'),
              );
              const providerOrder = policyKeyForRuleSet(config, name).slice('rule-set:'.length).split(',');
              assert.ok(
                policyIndex <= geolocationIndex &&
                  providerOrder.indexOf(name) < providerOrder.indexOf('geolocation-cn'),
                `${name} must precede the broad geolocation-cn policy`,
              );
            }
          }
          if (enabled) {
            const index = config.rules.indexOf(rule);
            assert.ok(index < config.rules.indexOf('RULE-SET,geolocation-cn,直连'));
            assert.ok(index < config.rules.findIndex((entry) => entry.includes('RULE-SET,geolocation-!cn')));
            if (!minimal)
              for (const service of ['tiktok', 'ai', 'ads']) {
                const serviceIndex = config.rules.findIndex((entry) => entry.startsWith(`RULE-SET,${service},`));
                if (serviceIndex >= 0) assert.ok(serviceIndex < index);
              }
          }
        }
        graph(config);
      }
    }
  }
});

test('static provider applies enabled rate filters to every node-bearing group', () => {
  const rates = load().rateRegionDefinitions;
  const cases = [
    ['过滤低倍率', '低倍率节点'],
    ['过滤高倍率', '高倍率节点'],
  ];
  for (const [option, name] of cases) {
    const pattern = rates.find((entry) => entry.name === name).regex.source;
    const config = build({ settings: { options: { [option]: true } } }).config;
    for (const groupName of ['手动选择', '美国', '家宽节点', '其他节点']) {
      const group = config['proxy-groups'].find((entry) => entry.name === groupName);
      assert.ok(
        group?.['exclude-filter']?.includes(pattern),
        `${option} must exclude matching nodes from ${groupName}`,
      );
    }
  }
});

test('regional selectors default to their own auto-select groups only when those groups exist', () => {
  const regions = load().regionDefinitions.map((entry) => entry.name);
  for (const config of [build().config, build({ subscription: fx.typicalSubscription() }).config]) {
    const groups = new Map(config['proxy-groups'].map((entry) => [entry.name, entry]));
    for (const region of regions) {
      const group = groups.get(region);
      if (!group) continue;
      assert.equal(group.proxies[0], `${region}-自动选择`, `${region} should default to its url-test`);
      assert.equal(group['default-selected'], undefined);
    }
    for (const name of ['低倍率节点', '高倍率节点', '家宽节点', '其他节点'])
      assert.equal(
        groups.get(name)?.['default-selected'],
        undefined,
        `${name} should keep its existing selection behavior`,
      );
  }
  const noAutoSelect = build({
    subscription: fx.typicalSubscription(),
    settings: { options: { 地区测速组: false } },
  }).config;
  for (const region of regions) {
    const group = noAutoSelect['proxy-groups'].find((entry) => entry.name === region);
    if (group) assert.notEqual(group.proxies[0], `${region}-自动选择`, `${region} has no auto-select target`);
  }
});

test('default script and provider YAML have complete graphs and encrypted DNS', () => {
  for (const config of [build({ subscription: fx.typicalSubscription() }).config, build().config]) {
    graph(config);
    encryptedDns(config);
    assert.equal(config['allow-lan'], false);
    assert.equal(config.tun.stack, 'mips');
    assert.deepEqual(config.tun['dns-hijack'], ['any:53', 'tcp://any:53']);
  }
});
test('changing the test URL does not add a global Apple-domain routing or DNS exception', () => {
  for (const subscription of [undefined, clean()]) {
    for (const minimal of [false, true]) {
      for (const domesticFirst of [false, true]) {
        const config = build({
          subscription,
          settings: {
            options: {
              极简分流: minimal,
              国内服务优先直连: domesticFirst,
              拦截代理QUIC: true,
            },
          },
        }).config;
        assert.ok(!config.rules.some((rule) => rule.startsWith('DOMAIN,cp.cloudflare.com,')));
        assert.ok(!config.rules.some((rule) => rule.startsWith('DOMAIN,www.apple.com,')));
        assert.equal(config.dns['nameserver-policy']['cp.cloudflare.com'], undefined);
        assert.equal(config.dns['nameserver-policy']['www.apple.com'], undefined);
      }
    }
  }
});
test('sniffing recovers pure-IP domain metadata and overrides destinations in every output mode', () => {
  for (const subscription of [undefined, clean()]) {
    for (const minimal of [false, true]) {
      const config = build({ subscription, settings: { options: { 极简分流: minimal } } }).config;
      assert.equal(config.sniffer.enable, true);
      assert.equal(config.sniffer['parse-pure-ip'], true);
      assert.equal(config.sniffer['force-dns-mapping'], true);
      assert.equal(config.sniffer['override-destination'], true);
      for (const protocol of ['HTTP', 'TLS', 'QUIC']) {
        assert.ok(config.sniffer.sniff[protocol].ports.length > 0);
        assert.ok(!config.sniffer.sniff[protocol]['override-destination']);
      }
      encryptedDns(config);
      assert.equal(build({ subscription, settings: { options: { 域名嗅探: false } } }).config.sniffer.enable, false);
    }
  }
});
test('Apple AI/Siri and product endpoints precede Apple CN, advertising and QUIC', () => {
  const config = build({ settings: { options: { 拦截代理QUIC: true } } }).config;
  const rules = config.rules;
  assert.equal(config['rule-providers'].apple_cn.behavior, 'classical');
  assert.equal(config['rule-providers'].apple_cn.format, 'text');
  assert.match(config['rule-providers'].apple_cn.url, /SukkaW\/Surge@0afc9c2.*\/apple_cn\.conf$/);
  assert.ok(rules.indexOf('RULE-SET,apple_cn,直连') < rules.indexOf(`RULE-SET,apple,${otherAppleGroup}`));
  const apple = rules.indexOf(`RULE-SET,apple_siri_regex,${siriAiGroup}`);
  const appleProxyDynamic = rules.indexOf(`RULE-SET,apple_proxy,${appleProxyGroup}`);
  assert.ok(apple >= 0);
  assert.ok(appleProxyDynamic >= 0);
  for (const ref of ['RULE-SET,apple_cn,直连', 'RULE-SET,category-ads-all,AdBlock', 'RULE-SET,httpdns,AdBlock'])
    assert.ok(apple < rules.indexOf(ref));
  assert.ok(apple < rules.findIndex((r) => r.startsWith('AND,')));
  assert.ok(rules.indexOf(`DOMAIN-SUFFIX,smoot.apple.com,${siriAiGroup}`) < rules.indexOf('RULE-SET,apple_cn,直连'));
  assert.ok(!rules.includes(`DOMAIN-SUFFIX,apple.com,${siriAiGroup}`));
  assert.equal(config['proxy-groups'].find((g) => g.name === siriAiGroup).proxies[0], '美国');
  const products = config['proxy-groups'].find((g) => g.name === appleProxyGroup);
  assert.equal(products.proxies[0], '美国');
  assert.ok(products.proxies.includes('直连'));
  assert.equal(config['proxy-groups'].find((g) => g.name === otherAppleGroup).proxies[0], '直连');
  assert.equal(config['proxy-groups'].find((g) => g.name === 'Microsoft').proxies[0], '默认代理');
  assert.equal(config['proxy-groups'].find((g) => g.name === 'FCM').proxies[0], '默认代理');
  assert.ok(config.rules.includes(`RULE-SET,apple_ip,${appleProxyGroup},no-resolve`));
  assert.ok(
    rules.indexOf(`RULE-SET,apple_ip,${appleProxyGroup},no-resolve`) < rules.indexOf('RULE-SET,cn_ip,直连,no-resolve'),
  );
  assert.equal(dnsRouteFor(policyForRuleSet(config, 'apple_siri_regex')[0]), siriAiGroup);
  assert.equal(dnsRouteFor(config.dns['nameserver-policy']['+.smoot.apple.com'][0]), siriAiGroup);
  for (const domain of ['gdmf.apple.com', 'mesu.apple.com', 'updates.cdn-apple.com', 'assets.cdn-apple.com']) {
    const direct = rules.indexOf(`DOMAIN,${domain},直连`);
    assert.ok(direct >= 0, `missing direct download exception ${domain}`);
    assert.ok(direct < appleProxyDynamic, `${domain} must keep priority over the broad AppleProxy provider`);
  }
  const downloadsProxied = build({ settings: { options: { Apple下载直连: false } } }).config;
  assert.ok(!downloadsProxied.rules.includes('DOMAIN,assets.cdn-apple.com,直连'));
  assert.ok(downloadsProxied.rules.includes(`RULE-SET,apple_proxy,${appleProxyGroup}`));
  assert.ok(!rules.includes('RULE-SET,cn,直连'));
});
test('Apple IP routes to AppleProxy before cn_ip in every output mode', () => {
  for (const subscription of [undefined, clean()]) {
    for (const minimal of [false, true]) {
      const config = build({ subscription, settings: { options: { 极简分流: minimal } } }).config;
      assert.ok(config['rule-providers'].apple_ip);
      const appleIp = config.rules.indexOf(`RULE-SET,apple_ip,${appleProxyGroup},no-resolve`);
      assert.ok(appleIp >= 0);
      assert.ok(appleIp < config.rules.indexOf('RULE-SET,cn_ip,直连,no-resolve'));
      const products = config['proxy-groups'].find((g) => g.name === appleProxyGroup);
      assert.ok(products.proxies.includes('直连'));
      assert.equal(products.proxies[0], '美国');
    }
  }
});
test('Apple DNS domain suffixes route to AppleProxy with matching DNS', () => {
  const targets = [[`DOMAIN-SUFFIX,apple-dns.com,${appleProxyGroup}`, '+.apple-dns.com']];
  for (const subscription of [undefined, clean()]) {
    for (const minimal of [false, true]) {
      const config = build({ subscription, settings: { options: { 极简分流: minimal } } }).config;
      for (const [rule, policyKey] of targets) {
        const index = config.rules.indexOf(rule);
        assert.ok(index >= 0, `missing ${rule}`);
        for (const laterRule of [
          `RULE-SET,apple_cn,直连`,
          `RULE-SET,apple,${otherAppleGroup}`,
          'RULE-SET,category-ads-all,AdBlock',
          'RULE-SET,httpdns,AdBlock',
        ]) {
          const laterIndex = config.rules.indexOf(laterRule);
          if (laterIndex >= 0) assert.ok(index < laterIndex, `${rule} must precede ${laterRule}`);
        }
        const policy = config.dns['nameserver-policy'][policyKey];
        assert.ok(policy, `missing DNS policy ${policyKey}`);
        for (const resolver of Array.isArray(policy) ? policy : [policy])
          assert.equal(dnsRouteFor(resolver), appleProxyGroup, `${policyKey} DNS → ${resolver}`);
      }
      const dynamicRule = `RULE-SET,apple_proxy,${appleProxyGroup}`;
      const dynamicIndex = config.rules.indexOf(dynamicRule);
      assert.ok(dynamicIndex >= 0, `missing ${dynamicRule}`);
      for (const laterRule of [
        `RULE-SET,apple_cn,直连`,
        `RULE-SET,apple,${otherAppleGroup}`,
        'RULE-SET,category-ads-all,AdBlock',
        'RULE-SET,httpdns,AdBlock',
      ]) {
        const laterIndex = config.rules.indexOf(laterRule);
        if (laterIndex >= 0) assert.ok(dynamicIndex < laterIndex, `${dynamicRule} must precede ${laterRule}`);
      }
      assert.ok(
        policyForRuleSet(config, 'apple_proxy')?.every((resolver) => dnsRouteFor(resolver) === appleProxyGroup),
        'AppleProxy dynamic members must use AppleProxy DNS egress',
      );
      assert.ok(!config.rules.includes(`DOMAIN-SUFFIX,apple-dns.com.cn,${appleProxyGroup}`));
    }
  }
});
const proxyIpProviders = new Set(['google_ip', 'openai_ip', 'telegram_ip', 'tiktok_ip', 'twitter_ip', 'facebook_ip']);

test('required proxy IP routes survive disabled service groups and minimal mode without resolving domains', () => {
  const services = {
    google_ip: 'Google',
    openai_ip: 'AI',
    telegram_ip: 'Telegram',
    tiktok_ip: 'TikTok',
    twitter_ip: 'Twitter',
    facebook_ip: 'Meta',
  };
  const modes = [{}, { 极简分流: true }, ...Object.values(services).map((service) => ({ [service]: false }))];
  for (const subscription of [undefined, clean()]) {
    for (const options of modes) {
      const config = build({ subscription, settings: { options } }).config;
      graph(config);
      assert.ok(config.rules.includes('RULE-SET,private_ip,直连,no-resolve'));
      const groups = new Map(config['proxy-groups'].map((group) => [group.name, group]));
      const nodes = new Map(config.proxies.map((node) => [node.name, node]));
      const assertProxyOnly = (name, visited = new Set()) => {
        if (visited.has(name)) return;
        visited.add(name);
        assert.ok(!['直连', 'DIRECT', 'PASS', 'COMPATIBLE'].includes(name), `direct escape via ${name}`);
        assert.notEqual(nodes.get(name)?.type, 'direct');
        for (const member of groups.get(name)?.proxies || []) assertProxyOnly(member, visited);
      };
      for (const [provider, service] of Object.entries(services)) {
        const target = options.极简分流 || options[service] === false ? '默认代理' : service;
        const rule = `RULE-SET,${provider},${target},no-resolve`;
        assert.equal(config.rules.filter((entry) => entry.startsWith(`RULE-SET,${provider},`)).length, 1);
        assert.ok(config.rules.includes(rule), rule);
        assert.ok(config.rules.indexOf(rule) < config.rules.indexOf('RULE-SET,cn_ip,直连,no-resolve'));
        assert.equal(config['rule-providers'][provider].behavior, 'ipcidr');
        assertProxyOnly(target);
      }
    }
  }
});

test('dynamic IP rules keep service egress aligned with their domain DNS policy', () => {
  const expectedTargets = {
    apple_ip: appleProxyGroup,
    cn_ip: '直连',
    private_ip: '直连',
    google_ip: 'Google',
    openai_ip: 'AI',
    microsoft_ip: 'Microsoft',
    telegram_ip: 'Telegram',
    tiktok_ip: 'TikTok',
    twitter_ip: 'Twitter',
    facebook_ip: 'Meta',
    netflix_ip: 'Netflix',
    spotify_ip: 'Spotify',
  };
  const domainPartners = {
    apple_ip: 'apple_tv',
    google_ip: 'google',
    openai_ip: 'ai',
    microsoft_ip: 'microsoft',
    telegram_ip: 'telegram',
    tiktok_ip: 'tiktok',
    twitter_ip: 'twitter',
    facebook_ip: 'meta',
    netflix_ip: 'netflix',
    spotify_ip: 'spotify',
  };
  for (const subscription of [undefined, clean()]) {
    for (const minimal of [false, true]) {
      const config = build({ subscription, settings: { options: { 极简分流: minimal } } }).config;
      const routes = new Map();
      for (const rule of config.rules) {
        const match = /^RULE-SET,([^,]+),([^,]+)/.exec(rule);
        if (!match || config['rule-providers'][match[1]]?.behavior !== 'ipcidr') continue;
        const [, provider, target] = match;
        assert.equal(
          target,
          minimal && proxyIpProviders.has(provider) ? '默认代理' : expectedTargets[provider],
          `unexpected target for ${provider}`,
        );
        if (provider === 'cn_ip') assert.equal(rule, 'RULE-SET,cn_ip,直连,no-resolve');
        else assert.equal(rule.split(',').at(-1), 'no-resolve', `${provider} must not trigger DNS resolution`);
        // IP-CIDR providers have no DNS names; their domain companion carries the DNS policy.
        assert.equal(policyForRuleSet(config, provider), undefined);
        routes.set(provider, target);
      }
      const privateIpIndex = config.rules.indexOf('RULE-SET,private_ip,直连,no-resolve');
      const cnIpIndex = config.rules.indexOf('RULE-SET,cn_ip,直连,no-resolve');
      for (const provider of routes.keys()) {
        const index = config.rules.findIndex((rule) => rule.startsWith(`RULE-SET,${provider},${routes.get(provider)}`));
        if (provider === 'apple_ip') assert.ok(index < privateIpIndex && index < cnIpIndex);
        else if (!['cn_ip', 'private_ip'].includes(provider)) assert.ok(index > privateIpIndex && index < cnIpIndex);
      }
      for (const [ipProvider, domainProvider] of Object.entries(domainPartners)) {
        const target = routes.get(ipProvider);
        if (!target || (minimal && proxyIpProviders.has(ipProvider))) continue;
        assert.ok(
          config.rules.some(
            (rule) =>
              rule === `RULE-SET,${domainProvider},${target}` ||
              rule.startsWith(`AND,((RULE-SET,${domainProvider}),(NOT,((RULE-SET,dns_`),
          ),
          `${domainProvider} must share ${ipProvider} egress`,
        );
        const dns = policyForRuleSet(config, domainProvider);
        assert.ok(dns, `missing DNS policy for ${domainProvider}`);
        for (const resolver of Array.isArray(dns) ? dns : [dns]) {
          const expectedDnsRoute =
            domainProvider === 'microsoft'
              ? 'DIRECT'
              : domainProvider === 'apple' && target === otherAppleGroup
                ? siriAiGroup
                : target;
          assert.ok(
            dnsRouteFor(resolver) === expectedDnsRoute,
            `${ipProvider} → ${target}, ${domainProvider} DNS → ${resolver}`,
          );
        }
      }
      if (routes.has('cn_ip')) assert.equal(config.dns['nameserver-policy']['rule-set:cn'], undefined);
      if (routes.has('private_ip'))
        assert.equal(config.dns['nameserver-policy']['rule-set:private'], 'rcode://success');
      if (routes.has('apple_ip')) {
        assert.ok(
          config.rules.indexOf(`RULE-SET,apple_ip,${appleProxyGroup},no-resolve`) <
            config.rules.indexOf('RULE-SET,cn_ip,直连,no-resolve'),
        );
        if (config['rule-providers'].apple) {
          assert.ok(config.rules.includes(`RULE-SET,apple,${otherAppleGroup}`));
          assert.ok(config.dns['nameserver-policy']['rule-set:apple'].every((dns) => dnsRouteFor(dns) === siriAiGroup));
        }
      }
    }
  }
});
test('Siri AI domain routes use matching DNS policy and precede QUIC rejection in both output modes', () => {
  for (const subscription of [undefined, clean()]) {
    for (const minimal of [false, true]) {
      const config = build({
        subscription,
        settings: { options: { 极简分流: minimal, 拦截代理QUIC: true } },
      }).config;
      const routes = config.rules
        .map((rule, index) => ({ index, parts: rule.split(',') }))
        .filter(({ parts }) => ['DOMAIN', 'DOMAIN-SUFFIX'].includes(parts[0]) && parts[2] === siriAiGroup);
      assert.ok(routes.length > 0, 'expected Siri AI domain routes');
      const quic = config.rules.findIndex((entry) => entry.startsWith('AND,') && entry.endsWith(',REJECT'));
      assert.ok(quic >= 0, 'QUIC reject rule is enabled for this test');
      for (const { index, parts } of routes) {
        assert.ok(index < quic, `${parts[0]},${parts[1]} must precede QUIC rejection`);
        const key = parts[0] === 'DOMAIN-SUFFIX' ? `+.${parts[1]}` : parts[1];
        const resolvers = config.dns['nameserver-policy'][key];
        assert.ok(resolvers, `missing DNS policy for ${key}`);
        for (const resolver of Array.isArray(resolvers) ? resolvers : [resolvers])
          assert.equal(dnsRouteFor(resolver), siriAiGroup, `${key} DNS must use ${siriAiGroup}`);
      }
    }
  }
});
test('shared iCloud endpoints use Other Apple Service and matching DNS in both output modes', () => {
  const hosts = ['gateway.icloud.com', 'setup.icloud.com'];
  for (const subscription of [undefined, clean()]) {
    for (const minimal of [false, true]) {
      const config = build({
        subscription,
        settings: { options: { 极简分流: minimal, 拦截代理QUIC: true } },
      }).config;
      for (const host of hosts) {
        const rule = `DOMAIN,${host},${otherAppleGroup}`;
        const routeIndex = config.rules.indexOf(rule);
        assert.ok(routeIndex >= 0, `missing ${rule} in minimal=${minimal}`);
        assert.ok(!config.rules.includes(`DOMAIN,${host},${siriAiGroup}`));
        assert.ok(routeIndex < config.rules.indexOf('RULE-SET,apple_cn,直连'));
        const dns = config.dns['nameserver-policy'][host];
        assert.ok(dns, `missing DNS policy for ${host}`);
        for (const resolver of Array.isArray(dns) ? dns : [dns])
          assert.ok(
            dnsRouteFor(resolver) === siriAiGroup,
            `Other Apple Service DNS must use ${siriAiGroup}: ${resolver}`,
          );
      }
      assert.ok(!config.dns['fake-ip-filter'].includes('setup.icloud.com'));
      const group = config['proxy-groups'].find((entry) => entry.name === otherAppleGroup);
      assert.ok(group, `missing ${otherAppleGroup} group in minimal=${minimal}`);
      assert.equal(group.proxies[0], '直连');
      graph(config);
      encryptedDns(config);
    }
    const disabled = build({
      subscription,
      settings: { options: { [otherAppleOption]: false } },
    }).config;
    for (const host of hosts) {
      assert.ok(!disabled.rules.includes(`DOMAIN,${host},${otherAppleGroup}`));
      assert.ok(!disabled.dns['nameserver-policy'][host]);
    }
  }
});
test('international iCloud content suffix shares priority routing and DNS while excluding China sites', () => {
  const targets = [[`DOMAIN-SUFFIX,icloud-content.com,${siriAiGroup}`, '+.icloud-content.com']];
  for (const subscription of [undefined, clean()]) {
    for (const minimal of [false, true]) {
      const config = build({
        subscription,
        settings: { options: { 极简分流: minimal, 拦截代理QUIC: true } },
      }).config;
      graph(config);
      encryptedDns(config);
      assert.ok(!config['rule-providers'].apple_ai_edge);
      assert.ok(!config.rules.includes(`RULE-SET,apple_ai_edge,${siriAiGroup}`));
      assert.ok(!config.dns['nameserver-policy']['rule-set:apple_ai_edge']);
      for (const [rule, policy] of targets) {
        const index = config.rules.indexOf(rule);
        assert.ok(index >= 0, `missing AI exception: ${rule}`);
        for (const [i, other] of config.rules.entries()) {
          if (/^RULE-SET,(apple_cn|apple|category-ads-all|httpdns),|^AND,/.test(other))
            assert.ok(index < i, `${policy} must precede ${other}`);
        }
        assert.deepEqual(config.dns['nameserver-policy'][policy], config.dns['nameserver-policy']['+.smoot.apple.com']);
      }
      for (const suffix of ['icloud.com', 'icloud.com.cn', 'icloud-content.com.cn', 'gateway.icloud.com']) {
        assert.ok(!config.rules.includes(`DOMAIN-SUFFIX,${suffix},${siriAiGroup}`));
        assert.ok(!config.dns['nameserver-policy'][`+.${suffix}`]);
      }
      for (const host of ['gateway.icloud.com.cn', 'ussjc1.icloud-content.com.cn', 'xactu3.icloud-content.com.cn']) {
        assert.ok(!config.rules.includes(`DOMAIN,${host},${siriAiGroup}`));
        assert.ok(!config.dns['nameserver-policy'][host]);
      }
    }
    const off = build({ subscription, settings: { options: { [siriAiOption]: false } } }).config;
    graph(off);
    for (const [rule, policy] of targets) {
      assert.ok(!off.rules.includes(rule));
      assert.ok(!off.dns['nameserver-policy'][policy]);
    }
  }
});
test('proxy node hostname bootstrap uses mainland encrypted DNS before proxies are available', () => {
  const config = build().config;
  const dns = config.dns;
  assert.deepEqual(dns['proxy-server-nameserver'], [
    'https://dns.alidns.com/dns-query#DIRECT',
    'https://doh.pub/dns-query#DIRECT',
  ]);
  assert.deepEqual(dns.nameserver, [
    'https://cloudflare-dns.com/dns-query#自动选择ex(大陆%26香港)&h3=true',
    'https://dns.google/dns-query#自动选择ex(大陆%26香港)',
  ]);
});
test('strict script output discards unsafe airport DNS settings instead of blocking import', () => {
  for (const resolver of [
    'system',
    'system://',
    'dhcp://eth0',
    '192.168.1.1',
    'udp://10.2.3.4:53',
    'udp://192.0.2.53:53',
    'tcp://10.2.3.4:53',
    'tcp://192.0.2.53:53',
    'http://private.test/dns-query',
    'https://private.test/dns-query#skip-cert-verify=true',
  ]) {
    const subscription = clean();
    subscription.proxies[0].server = 'us.node.test';
    subscription.dns = {
      nameserver: [resolver],
      'proxy-server-nameserver': [resolver],
      'nameserver-policy': { 'us.node.test': resolver },
      'proxy-server-nameserver-policy': { 'us.node.test': resolver },
    };
    const config = build({ subscription }).config;
    encryptedDns(config);
    assert.deepEqual(config.dns.nameserver, [
      'https://cloudflare-dns.com/dns-query#自动选择ex(大陆%26香港)&h3=true',
      'https://dns.google/dns-query#自动选择ex(大陆%26香港)',
    ]);
    assert.deepEqual(config.dns['proxy-server-nameserver'], [
      'https://dns.alidns.com/dns-query#DIRECT',
      'https://doh.pub/dns-query#DIRECT',
    ]);
    assert.deepEqual(config.dns['proxy-server-nameserver-policy'], {});
    assert.ok(!('us.node.test' in config.dns['nameserver-policy']), `airport policy leaked: ${resolver}`);
  }
});
test('airport DNS policy does not override the script-owned node resolver policy', () => {
  const subscription = clean();
  subscription.proxies[0].server = 'a.example.co.uk';
  subscription.proxies.push({ ...subscription.proxies[0], name: '香港 测试', server: 'b.example.co.uk' });
  subscription.dns = {
    nameserver: ['tls://private.test:853'],
    'proxy-server-nameserver-policy': { 'a.example.co.uk': 'https://special.test/dns-query' },
  };
  const dns = build({ subscription }).config.dns;
  assert.deepEqual(dns['proxy-server-nameserver-policy'], {});
  assert.deepEqual(dns['proxy-server-nameserver'], [
    'https://dns.alidns.com/dns-query#DIRECT',
    'https://doh.pub/dns-query#DIRECT',
  ]);
});
test('private hosts rewrite still removes local-loop DNS before strict validation', () => {
  const config = build({ subscription: fx.hostsMappedSubscription() }).config;
  encryptedDns(config);
  assert.ok(config.proxies.some((p) => p.server === 'node-a1b2c3.example-apt.com'));
});
test('each boolean option is accepted, takes part in generation and leaves valid graphs', () => {
  const defaults = load().ruleOptionsEnable;
  for (const [key, value] of Object.entries(defaults)) {
    const settings = { options: { [key]: !value } };
    if (key === '链式代理') settings.customProxies = [{ ...clean().proxies[0], name: '自建 日本' }];
    for (const subscription of [undefined, clean()]) {
      const result = build({ settings, subscription });
      graph(result.config);
      assert.equal(YAML.parse(result.text)['x-myProxyRules'].options[key], !value);
      if (key !== '严格DNS校验') encryptedDns(result.config);
    }
  }
});
test('minimal mode keeps independently enabled Apple and DNS protections', () => {
  const config = build({ settings: { options: { 极简分流: true } } }).config;
  graph(config);
  encryptedDns(config);
  assert.ok(config.rules.includes(`RULE-SET,apple_siri_regex,${siriAiGroup}`));
  assert.ok(config.rules.includes(`RULE-SET,apple_ip,${appleProxyGroup},no-resolve`));
  assert.ok(!config['proxy-groups'].some((g) => g.name === 'YouTube'));
  assert.equal(config.rules.at(-1), 'MATCH,默认代理');
});
test('Apple/CDN/PCDN/IPv6/TUN/LAN switches change their advertised behavior', () => {
  const config = build({
    settings: {
      options: {
        [siriAiOption]: false,
        [appleProxyGroup]: false,
        Apple下载直连: false,
        PCDN拦截: false,
        IPv6: false,
        TUN: false,
        局域网访问: true,
      },
    },
  }).config;
  assert.ok(!config.rules.some((r) => r.endsWith(`,${siriAiGroup}`) || r.endsWith(`,${appleProxyGroup}`)));
  assert.ok(!policyForRuleSet(config, 'apple_siri_regex'));
  assert.ok(!config.rules.includes('DOMAIN,assets.cdn-apple.com,直连'));
  assert.ok(!Object.keys(config.hosts).some((key) => key.includes('mcdn')));
  assert.equal(config.ipv6, false);
  assert.equal(config.dns.ipv6, false);
  assert.equal(config.tun.enable, false);
  assert.equal(config['allow-lan'], true);
  assert.equal(config['bind-address'], '*');
  assert.ok(config.rules.some((r) => r.startsWith('DST-PORT,53,')));
  assert.ok(config.rules.includes('DST-PORT,853,REJECT'));
});
test('invalid true/false values and unknown options are rejected', () => {
  for (const value of ['ture', 'false', 1, null])
    assert.throws(() => build({ settings: { options: { [siriAiOption]: value } } }), /true.*false/);
  assert.throws(() => build({ settings: { options: { typo: true } } }), /未知配置项/);
});
test('default YAML is deterministic, commented and contains no template credentials', () => {
  const { config, text } = build();
  assert.ok(!JSON.stringify(config).includes('template'));
  assert.equal(fs.readFileSync('Config/mihomoConfig.yaml', 'utf8'), text);
  assert.deepEqual(YAML.parse(text).dns, config.dns);
  assert.match(text, /Mihomo 不执行 x-myProxyRules/);
  assert.match(text, /Apple智能分流: true #/);
  assert.equal(text, build().text);
  const metadata = YAML.parse(text)['x-myProxyRules'];
  assert.equal(text, build({ settings: metadata }).text);
});
test('provider cleanup preserves nested route, Fake-IP, DNS policy and inline DNS dependencies', () => {
  const api = loadScript('Script/mihomoScript.js', (source) => {
    const transformed = source.replace(
      '  return finalizeMyProxyRules(newConfig);',
      `  const cleanupProvider = { type: 'inline', behavior: 'domain', payload: [] };
  for (const name of [
    'cleanup_nested_route',
    'cleanup_fake_ip',
    'cleanup_dns_policy',
    'cleanup_proxy_dns_policy',
    'cleanup_dns_predicate',
    'cleanup_dns_predicate_full',
    'cleanup_dns_predicate_noncn',
    'cleanup_unused',
  ])
    newConfig['rule-providers'][name] = { ...cleanupProvider };
  newConfig['rule-providers'].cleanup_dns_predicate = {
    type: 'inline',
    behavior: 'classical',
    format: 'text',
    payload: ['AND,((RULE-SET,cleanup_dns_predicate_full),(NOT,((RULE-SET,cleanup_dns_predicate_noncn))))'],
  };
  newConfig.rules.push('RULE-SET,cleanup_nested_route,默认代理,no-resolve');
  newConfig.dns['fake-ip-filter'].push('rule-set:cleanup_fake_ip');
  newConfig.dns['nameserver-policy']['rule-set:cleanup_dns_policy'] = 'rcode://success';
  newConfig.dns['nameserver-policy']['rule-set:cleanup_dns_predicate'] = 'rcode://success';
  newConfig.dns['proxy-server-nameserver-policy']['rule-set:cleanup_proxy_dns_policy'] = 'rcode://success';
  return finalizeMyProxyRules(newConfig);`,
    );
    assert.notEqual(transformed, source);
    return transformed;
  });
  const config = api.main(clean());
  graph(config);
  for (const name of [
    'cleanup_nested_route',
    'cleanup_fake_ip',
    'cleanup_dns_policy',
    'cleanup_proxy_dns_policy',
    'cleanup_dns_predicate',
    'cleanup_dns_predicate_full',
    'cleanup_dns_predicate_noncn',
  ])
    assert.ok(config['rule-providers'][name], `${name} should be retained`);
  assert.equal(config['rule-providers'].cleanup_unused, undefined);
});
test('combined group switches and custom chain stay acyclic', () => {
  const settings = {
    options: {
      链式代理: true,
      手动选择: false,
      自动选择: false,
      负载均衡: false,
      地区测速组: false,
      倍率节点组: false,
      家宽节点组: false,
      服务组含全节点: true,
      过滤高倍率: true,
    },
    customProxies: [{ ...clean().proxies[0], name: '日本 自建 住宅' }],
  };
  graph(build({ settings }).config);
  graph(build({ settings, subscription: clean() }).config);
});
test('AppleProxy and Apple product endpoints share one regional group; overseas media stays opt-in', () => {
  const defaults = build().config;
  const products = defaults['proxy-groups'].find((group) => group.name === appleProxyGroup);
  assert.ok(products);
  assert.equal(products.proxies[0], '美国');
  assert.ok(products.proxies.includes('直连'));
  for (const rule of defaults.rules) {
    const match = /^(DOMAIN|DOMAIN-SUFFIX),([^,]+),(.+)$/.exec(rule);
    if (!match || ![siriAiGroup, appleProxyGroup, otherAppleGroup].includes(match[3])) continue;
    const [, type, domain, target] = match;
    const policyKey = type === 'DOMAIN-SUFFIX' ? `+.${domain}` : domain;
    const policy = defaults.dns['nameserver-policy'][policyKey];
    assert.ok(policy, `missing DNS policy for ${rule}`);
    const dnsTarget = target === otherAppleGroup ? siriAiGroup : target;
    for (const resolver of Array.isArray(policy) ? policy : [policy])
      assert.equal(dnsRouteFor(resolver), dnsTarget, `${rule} uses ${policyKey} → ${resolver}`);
  }
  for (const domain of [
    'news-client-search.apple.com',
    '+.fitness.apple.com',
    '+.sports.apple.com',
    '+.books.apple.com',
  ]) {
    const ruleDomain = domain.startsWith('+.') ? domain.slice(2) : domain;
    const type = domain.startsWith('+.') ? 'DOMAIN-SUFFIX' : 'DOMAIN';
    assert.ok(defaults.rules.includes(`${type},${ruleDomain},${appleProxyGroup}`));
    assert.equal(dnsRouteFor(defaults.dns['nameserver-policy'][domain]?.[0]), appleProxyGroup);
  }
  assert.deepEqual(defaults['rule-providers'].apple_siri_regex, {
    type: 'inline',
    format: 'text',
    behavior: 'classical',
    payload: [
      'DOMAIN-REGEX,^mask(-[a-z0-9]+)?\\.icloud\\.com$',
      'DOMAIN-REGEX,(^|\\.)apple-relay\\.(apple\\.com|cloudflare\\.com|fastly-edge\\.com|akamaized\\.net)$',
      'DOMAIN-REGEX,(^|\\.)guzzoni\\.apple\\.com$|^guzzoni-apple-com\\.v\\.aaplimg\\.com$',
      'DOMAIN-REGEX,(^|[.-])siri(-[a-z0-9]+)*\\.apple\\.com$',
      'AND,((DOMAIN-REGEX,ssl\\.ls\\.apple\\.com$|(^|\\.)ls-apple\\.com\\.akadns\\.net$),(NOT,((DOMAIN-REGEX,(^|[.-])cn([.-]|$)))))',
    ],
  });
  assert.deepEqual(defaults['rule-providers'].apple_ls_cn_regex, {
    type: 'inline',
    format: 'text',
    behavior: 'classical',
    payload: [
      'AND,((DOMAIN-REGEX,ssl\\.ls\\.apple\\.com$|(^|\\.)ls-apple\\.com\\.akadns\\.net$),(DOMAIN-REGEX,(^|[.-])cn([.-]|$)))',
    ],
  });
  assert.ok(defaults.rules.includes('RULE-SET,apple_ls_cn_regex,直连'));
  assert.deepEqual(policyForRuleSet(defaults, 'apple_ls_cn_regex'), domesticDnsResolvers);
  assert.ok(defaults.rules.includes(`RULE-SET,apple_siri_regex,${siriAiGroup}`));
  assert.ok(!defaults.rules.some((rule) => /^DOMAIN,gspe\d+-ssl\.ls\.apple\.com,/.test(rule)));
  assert.ok(policyForRuleSet(defaults, 'apple_siri_regex')?.every((dns) => dnsRouteFor(dns) === siriAiGroup));
  const appleProxyProvider = defaults['rule-providers'].apple_proxy;
  assert.equal(appleProxyProvider.behavior, 'classical');
  assert.equal(appleProxyProvider.format, 'yaml');
  assert.equal(appleProxyProvider.interval, 86400);
  assert.ok(appleProxyProvider.url.endsWith('/rule/Clash/AppleProxy/AppleProxy.yaml'));
  assert.ok(defaults.rules.includes(`RULE-SET,apple_proxy,${appleProxyGroup}`));
  assert.ok(
    defaults.rules.indexOf(`RULE-SET,apple_proxy,${appleProxyGroup}`) <
      defaults.rules.indexOf('RULE-SET,apple_cn,直连'),
  );
  assert.ok(policyForRuleSet(defaults, 'apple_proxy')?.every((dns) => dnsRouteFor(dns) === appleProxyGroup));
  assert.ok(defaults['rule-providers'].apple_tv.url.endsWith('/apple-tvplus.mrs'));
  assert.ok(
    defaults.rules.indexOf(`RULE-SET,apple_tv,${appleProxyGroup}`) < defaults.rules.indexOf('RULE-SET,apple_cn,直连'),
  );
  assert.ok(policyForRuleSet(defaults, 'apple_tv')?.every((dns) => dnsRouteFor(dns) === appleProxyGroup));
  assert.ok(defaults.rules.includes(`RULE-SET,apple_ip,${appleProxyGroup},no-resolve`));
  assert.ok(defaults.rules.includes(`RULE-SET,apple_siri_regex,${siriAiGroup}`));
  for (const oldName of [
    'AppleNews',
    'AppleTV',
    'AppleFitness',
    'AppleSports',
    'AppleBooks',
    'AppleRelay',
    'Apple地区检测',
  ])
    assert.ok(!defaults['proxy-groups'].some((group) => group.name === oldName));
  const off = build({ settings: { options: { [appleProxyGroup]: false } } }).config;
  assert.ok(!off['proxy-groups'].some((group) => group.name === appleProxyGroup));
  assert.ok(!off['rule-providers'].apple_ip);
  assert.ok(!off['rule-providers'].apple_proxy);
  assert.ok(!off['rule-providers'].apple_tv);
  assert.ok(!off['rule-providers'].apple_media_regex);
  assert.ok(!off.rules.some((rule) => rule.endsWith(`,${appleProxyGroup}`)));
  const media = build({ settings: { options: { Apple媒体代理: true } } }).config;
  assert.deepEqual(media['rule-providers'].apple_media_regex, {
    type: 'inline',
    format: 'text',
    behavior: 'classical',
    payload: ['DOMAIN-REGEX,^(?:(?:p\\d+-)?buy|play|se\\d*)\\.itunes\\.apple\\.com$'],
  });
  assert.ok(media.rules.includes(`RULE-SET,apple_media_regex,${appleProxyGroup}`));
  assert.ok(policyForRuleSet(media, 'apple_media_regex')?.every((dns) => dnsRouteFor(dns) === appleProxyGroup));
});
test('literal domain routes use mainland DNS when direct and service DNS follows the target group', () => {
  for (const subscription of [undefined, clean()]) {
    for (const minimal of [false, true]) {
      const config = build({ subscription, settings: { options: { 极简分流: minimal } } }).config;
      const groups = new Map(config['proxy-groups'].map((group) => [group.name, group]));
      let checked = 0;
      for (const rule of config.rules) {
        const match = /^(DOMAIN|DOMAIN-SUFFIX),([^,]+),([^,]+)(?:,|$)/.exec(rule);
        if (!match) continue;
        const [, type, domain, target] = match;
        const group = groups.get(target);
        if (target !== '直连' && !group) continue;
        const dnsTarget = target === otherAppleGroup ? siriAiGroup : target;
        const dnsGroup = groups.get(dnsTarget);
        const policyKey = type === 'DOMAIN-SUFFIX' ? `+.${domain}` : domain;
        const policy = config.dns['nameserver-policy'][policyKey];
        assert.ok(policy, `missing nameserver-policy for ${rule}`);
        checked++;
        if (target === '直连') {
          assert.deepEqual(policy, domesticDnsResolvers, `${rule} must use mainland DNS`);
        } else if (
          dnsGroup?.proxies.length &&
          dnsGroup.proxies.every((proxy) => ['REJECT', 'REJECT-DROP', 'PASS'].includes(proxy))
        ) {
          assert.equal(policy, 'rcode://name_error', `${rule} must fail closed with its DNS egress group`);
        } else {
          for (const resolver of Array.isArray(policy) ? policy : [policy])
            assert.equal(dnsRouteFor(resolver), dnsTarget, `${rule} uses ${policyKey} → ${resolver}`);
        }
      }
      assert.ok(checked > 0);
    }
  }
});
test('Other Apple Service traffic stays on its group while DNS follows the Siri selector', () => {
  for (const subscription of [undefined, clean()]) {
    const config = build({ subscription }).config;
    assert.ok(config.rules.includes(`RULE-SET,apple,${otherAppleGroup}`));
    assert.ok(config.dns['nameserver-policy']['rule-set:apple'].every((dns) => dnsRouteFor(dns) === siriAiGroup));
    for (const host of ['gateway.icloud.com', 'setup.icloud.com']) {
      assert.ok(config.rules.includes(`DOMAIN,${host},${otherAppleGroup}`));
      assert.ok(config.dns['nameserver-policy'][host].every((dns) => dnsRouteFor(dns) === siriAiGroup));
    }
    const group = config['proxy-groups'].find((entry) => entry.name === otherAppleGroup);
    assert.ok(group);
    assert.equal(group.proxies[0], '直连');
    assert.ok(config['proxy-groups'].some((entry) => entry.name === siriAiGroup));
  }
});
test('Other Apple DNS retains a Siri egress selector when Siri routing is disabled', () => {
  const config = build({ settings: { options: { [siriAiOption]: false } } }).config;
  const siriGroup = config['proxy-groups'].find((group) => group.name === siriAiGroup);
  assert.ok(siriGroup, 'Siri selector is required as the DNS egress group');
  assert.ok(
    !config.rules.some((rule) => rule.endsWith(`,${siriAiGroup}`)),
    'Siri service routes should remain disabled',
  );
  assert.ok(config.dns['nameserver-policy']['rule-set:apple'].every((dns) => dnsRouteFor(dns) === siriAiGroup));
  graph(config);
});
test('Other Apple direct route keeps encrypted DNS when no eligible Siri region exists', () => {
  const config = build({ subscription: { proxies: [proxy('香港 测试')] } }).config;
  assert.deepEqual(config['proxy-groups'].find((group) => group.name === siriAiGroup).proxies, ['REJECT']);
  assert.equal(config['proxy-groups'].find((group) => group.name === otherAppleGroup).proxies[0], '直连');
  assert.deepEqual(policyForRuleSet(config, 'apple'), domesticDnsResolvers);
  for (const key of ['gateway.icloud.com', 'setup.icloud.com'])
    assert.deepEqual(config.dns['nameserver-policy'][key], domesticDnsResolvers);
  assert.equal(policyForRuleSet(config, 'apple_siri_regex'), 'rcode://name_error');
});
test('strict DNS validates every generated upstream field', () => {
  const unsafe = loadScript('Script/mihomoScript.js', (source) =>
    source.replace("'https://223.5.5.5/dns-query#DIRECT&name-cert-verify=dns.alidns.com'", "'udp://192.0.2.53'"),
  );
  assert.throws(() => unsafe.main(clean()), /严格DNS校验.*default-nameserver/);
});
test('legacy Apple group switches migrate to the consolidated names and explicit new names win', () => {
  const legacy = {
    Apple: false,
    Apple智能: true,
    Siri: false,
    AppleNews: false,
    AppleTV: true,
    AppleFitness: false,
    AppleSports: false,
    AppleBooks: false,
    AppleRelay: false,
    Apple地区检测: false,
  };
  const migrated = build({ settings: { options: legacy } }).config;
  assert.ok(migrated['proxy-groups'].some((group) => group.name === siriAiGroup));
  assert.ok(migrated['proxy-groups'].some((group) => group.name === appleProxyGroup));
  assert.ok(!migrated['proxy-groups'].some((group) => group.name === otherAppleGroup));
  const oldProductName = build({ settings: { options: { 'Apple Product地区': false } } }).config;
  assert.ok(!oldProductName['proxy-groups'].some((group) => group.name === appleProxyGroup));
  const legacyRegionDetectionOff = build({ settings: { options: { Apple地区检测: false } } }).config;
  assert.ok(legacyRegionDetectionOff['proxy-groups'].some((group) => group.name === siriAiGroup));
  assert.ok(!legacyRegionDetectionOff.rules.some((rule) => rule.endsWith(`,${siriAiGroup}`)));
  assert.ok(
    legacyRegionDetectionOff.dns['nameserver-policy']['rule-set:apple'].every(
      (dns) => dnsRouteFor(dns) === siriAiGroup,
    ),
  );
  assert.ok(legacyRegionDetectionOff['proxy-groups'].some((group) => group.name === appleProxyGroup));

  const explicit = build({
    settings: {
      options: {
        ...legacy,
        [siriAiOption]: false,
        [appleProxyGroup]: false,
        [otherAppleOption]: true,
      },
    },
  }).config;
  assert.ok(explicit['proxy-groups'].some((group) => group.name === siriAiGroup));
  assert.ok(!explicit.rules.some((rule) => rule.endsWith(`,${siriAiGroup}`)));
  assert.ok(!explicit['proxy-groups'].some((group) => group.name === appleProxyGroup));
  assert.ok(explicit['proxy-groups'].some((group) => group.name === otherAppleGroup));
});

test('renamed option keys migrate to their short names and explicit short names win', () => {
  const aliases = {
    '自动选择ex(大陆&香港)': '排除大陆香港自动选',
    'Siri Ai/Apple Intelligence': 'Apple智能分流',
    'Other Apple Service': 'Apple其他服务',
    Apple海外媒体: 'Apple媒体代理',
    Apple模型下载直连: 'Apple下载直连',
    Apple服务默认直连: 'Apple其他默认直连',
    Steam: '海外游戏',
    严格加密DNS: '严格DNS校验',
    代理IPV4优先: '节点IPv4优先',
    代理IPV6优先: '节点IPv6优先',
    极简国内外分流模式: '极简分流',
    生成地区自动选择组: '地区测速组',
    隐藏地区手动选择组: '隐藏地区手选组',
    生成高低倍率组: '倍率节点组',
    生成家宽节点组: '家宽节点组',
    分流组添加所有节点: '服务组含全节点',
    过滤低倍率节点: '过滤低倍率',
    过滤高倍率节点: '过滤高倍率',
    过滤非地区节点: '过滤公告信息项',
    屏蔽代理QUIC流量: '拦截代理QUIC',
  };
  const defaults = YAML.parse(build().text)['x-myProxyRules'].options;

  for (const [oldName, newName] of Object.entries(aliases)) {
    const migratedValue = !defaults[newName];
    const migrated = build({ settings: { options: { [oldName]: migratedValue } } });
    const migratedOptions = YAML.parse(migrated.text)['x-myProxyRules'].options;
    assert.equal(migratedOptions[newName], migratedValue, `${oldName} should migrate to ${newName}`);

    const explicit = build({
      settings: { options: { [oldName]: migratedValue, [newName]: defaults[newName] } },
    });
    const explicitOptions = YAML.parse(explicit.text)['x-myProxyRules'].options;
    assert.equal(explicitOptions[newName], defaults[newName], `${newName} should take precedence`);
  }
});

test('AppleFlow PCC and Siri endpoints use the eligible selector with US default before QUIC rejection', () => {
  const config = build({ subscription: clean(), settings: { options: { 拦截代理QUIC: true } } }).config;
  const pcc = [
    ['DOMAIN-SUFFIX', 'issuer.apple.com', siriAiGroup],
    ['DOMAIN-SUFFIX', 'ropes.apple.com', siriAiGroup],
    ['DOMAIN-SUFFIX', 'app.apple.com', siriAiGroup],
    ['DOMAIN', 'cp4.cloudflare.com', siriAiGroup],
  ];
  const siri = [
    ['DOMAIN', 'dejavu.apple.com', siriAiGroup],
    ['DOMAIN', 'sequoia.apple.com', siriAiGroup],
    ['DOMAIN-SUFFIX', 'smoot.apple.com', siriAiGroup],
    ['DOMAIN', 'bag.itunes.apple.com', siriAiGroup],
  ];
  const quicReject = config.rules.findIndex((rule) => rule.startsWith('AND,') && rule.endsWith(',REJECT'));
  assert.ok(quicReject >= 0, 'QUIC reject rule is enabled for this test');
  const siriRegexIndex = config.rules.indexOf(`RULE-SET,apple_siri_regex,${siriAiGroup}`);
  assert.ok(siriRegexIndex >= 0 && siriRegexIndex < quicReject, 'apple_siri_regex must precede QUIC rejection');
  assert.ok(policyForRuleSet(config, 'apple_siri_regex')?.every((dns) => dnsRouteFor(dns) === siriAiGroup));
  assert.ok(config.dns['fake-ip-filter'].includes('rule-set:apple_siri_regex'));
  for (const [type, domain, target] of [...pcc, ...siri]) {
    const rule = `${type},${domain},${target}`;
    const index = config.rules.indexOf(rule);
    assert.ok(index >= 0, `missing ${rule}`);
    assert.ok(index < quicReject, `${rule} must precede QUIC rejection`);
    const policyKey = type === 'DOMAIN-SUFFIX' ? `+.${domain}` : domain;
    assert.ok(config.dns['nameserver-policy'][policyKey]?.some((dns) => dnsRouteFor(dns) === target));
    assert.ok(config.dns['fake-ip-filter'].includes(policyKey), `missing real-IP exception ${policyKey}`);
  }
  for (const name of ['AI', siriAiGroup]) {
    assert.deepEqual(config['proxy-groups'].find((group) => group.name === name).proxies, ['美国']);
  }
  assert.equal(config['proxy-groups'].find((group) => group.name === appleProxyGroup).proxies[0], '美国');
  const usGroup = config['proxy-groups'].find((group) => group.name === '美国');
  assert.ok(usGroup.proxies.includes('美国-自动选择'));
  assert.ok(config['proxy-groups'].find((group) => group.name === '美国-自动选择').proxies.includes('🇺🇸 美国 测试'));
  assert.ok(
    !config.rules.some((rule) => /,(直连|DIRECT)$/.test(rule) && /guzzoni|siri\.apple|dejavu|sequoia|smoot/.test(rule)),
  );
});

test('region-restricted service routes fail closed when no eligible country candidate exists', () => {
  const subscription = { proxies: [{ ...clean().proxies[0], name: 'Unlabelled node' }] };
  for (const settings of [{}, { options: { 极简分流: true } }]) {
    const config = build({ subscription, settings }).config;
    assert.ok(!config['proxy-groups'].some((group) => group.name === '美国'));
    for (const name of ['AI', siriAiGroup]) {
      const group = config['proxy-groups'].find((entry) => entry.name === name);
      if (name === 'AI' && settings.options?.极简分流) assert.equal(group, undefined);
      else assert.deepEqual(group.proxies, ['REJECT']);
    }
    const products = config['proxy-groups'].find((group) => group.name === appleProxyGroup);
    assert.ok(products);
    assert.equal(products.proxies[0], '默认代理');
    assert.ok(products.proxies.includes('直连'));
  }
});

test('AI, Google, TikTok, Meta and Siri AI expose only eligible country groups and default to US', () => {
  const subscription = {
    proxies: [
      '香港节点',
      '澳门节点',
      '中国大陆节点',
      '俄罗斯节点',
      '日本节点',
      '美国节点',
      '新加坡节点',
      '中国台湾节点',
    ].map((name) => proxy(name)),
  };
  const serviceNames = ['AI', 'Google', 'TikTok', 'Meta', siriAiGroup];
  const allowed = new Set(['日本', '美国', '新加坡', '台湾']);

  for (const minimal of [false, true]) {
    const config = build({ subscription, settings: { options: { 极简分流: minimal } } }).config;
    const groups = new Map(config['proxy-groups'].map((group) => [group.name, group]));
    for (const name of serviceNames) {
      if (minimal && name !== siriAiGroup) {
        assert.equal(groups.has(name), false);
        continue;
      }
      const group = groups.get(name);
      assert.ok(group, `missing ${name}`);
      assert.deepEqual(new Set(group.proxies), allowed, `${name} should expose only eligible country groups`);
      assert.equal(group.proxies[0], '美国', `${name} should default to the US`);
    }

    for (const [provider, target] of [
      ['ai', 'AI'],
      ['google', 'Google'],
      ['tiktok', 'TikTok'],
      ['meta', 'Meta'],
    ]) {
      if (minimal) continue;
      assert.ok(policyForRuleSet(config, provider).every((dns) => dnsRouteFor(dns) === target));
    }
    assert.ok(config.dns['nameserver-policy']['+.smoot.apple.com'].every((dns) => dnsRouteFor(dns) === siriAiGroup));
    assert.ok(policyForRuleSet(config, 'apple_siri_regex').every((dns) => dnsRouteFor(dns) === siriAiGroup));
  }
});

test('domestic DNS policy covers explicit direct routes, geolocation-cn and default dynamic whitelists', () => {
  const domesticResolvers = domesticDnsResolvers;
  const defaultWhitelists = ['dns_domestic_cdn', 'dns_microsoft_cdn'];
  for (const subscription of [undefined, clean()]) {
    for (const minimal of [false, true]) {
      const config = build({
        subscription,
        settings: {
          options: { 极简分流: minimal, Microsoft: false, 海外游戏: false, 国内服务优先直连: false },
        },
      }).config;
      graph(config);
      assert.equal(config.dns['direct-nameserver'], undefined);
      assert.equal(config.dns['direct-nameserver-follow-policy'], undefined);
      for (const provider of ['cn', 'douyin', 'microsoft_cn', 'apple_cn', 'game_platforms_download_cn'])
        assert.equal(policyForRuleSet(config, provider), undefined, `${provider} must not retain a stale policy`);
      assert.deepEqual(policyForRuleSet(config, 'geolocation-cn'), domesticResolvers);
      assert.ok(!config.dns['fake-ip-filter'].includes('rule-set:cn'));
      for (const name of defaultWhitelists) {
        const provider = config['rule-providers'][name];
        assert.ok(provider, `missing default whitelist provider ${name}`);
        assert.equal(provider.type, 'http');
        assert.equal(provider.interval, 86400);
        assert.ok(config.rules.includes(`RULE-SET,${name},直连`), `default ${name} should add a direct route`);
        assert.deepEqual(policyForRuleSet(config, name), domesticResolvers);
      }
    }
  }
  const config = build().config;
  const keys = Object.keys(config.dns['nameserver-policy']);
  const msCdnKey = policyKeyForRuleSet(config, 'dns_microsoft_cdn');
  const gameDownloadCnKey = policyKeyForRuleSet(config, 'game_platforms_download_cn');
  const domesticCdnKey = policyKeyForRuleSet(config, 'dns_domestic_cdn');
  assert.ok(keys.indexOf('+.smoot.apple.com') < keys.indexOf(msCdnKey));
  assert.ok(keys.indexOf(msCdnKey) < keys.indexOf(policyKeyForRuleSet(config, 'microsoft')));
  assert.ok(keys.indexOf(gameDownloadCnKey) < keys.indexOf(policyKeyForRuleSet(config, 'overseas_games')));
  assert.ok(keys.indexOf(policyKeyForRuleSet(config, 'google')) < keys.indexOf(domesticCdnKey));
  assert.ok(keys.indexOf(policyKeyForRuleSet(config, 'ai')) < keys.indexOf(domesticCdnKey));
  assert.ok(keys.indexOf(domesticCdnKey) < keys.indexOf(policyKeyForRuleSet(config, 'geolocation-!cn')));
  assert.ok(
    keys.indexOf(policyKeyForRuleSet(config, 'microsoft')) <
      keys.indexOf(policyKeyForRuleSet(config, 'geolocation-cn')),
  );
  assert.ok(
    keys.indexOf(policyKeyForRuleSet(config, 'overseas_games')) <
      keys.indexOf(policyKeyForRuleSet(config, 'geolocation-cn')),
  );
  for (const key of [
    msCdnKey,
    gameDownloadCnKey,
    domesticCdnKey,
    policyKeyForRuleSet(config, 'geolocation-cn'),
    'rule-set:apple_cn',
    'gdmf.apple.com',
    'mesu.apple.com',
    'updates.cdn-apple.com',
    'assets.cdn-apple.com',
  ])
    assert.deepEqual(
      key.startsWith('rule-set:')
        ? (config.dns['nameserver-policy'][key] ?? policyForRuleSet(config, key.slice('rule-set:'.length)))
        : config.dns['nameserver-policy'][key],
      domesticResolvers,
    );
  const directDomainProviders = new Set();
  for (const rule of config.rules) {
    const match = /^RULE-SET,([^,]+),直连(?:,|$)/.exec(rule);
    if (!match || match[1] === 'private') continue;
    const provider = config['rule-providers'][match[1]];
    if (provider && ['domain', 'classical'].includes(provider.behavior)) directDomainProviders.add(match[1]);
  }
  for (const provider of directDomainProviders)
    assert.deepEqual(policyForRuleSet(config, provider), domesticResolvers, `rule-set:${provider}`);
});

test('every routed domain rule-set uses its configured DNS egress group', () => {
  const config = build().config;
  const expectedPolicies = new Map();
  for (const rule of config.rules) {
    const match = /^RULE-SET,([^,]+),([^,]+)(?:,|$)/.exec(rule);
    if (!match) continue;
    const [, providerName, target] = match;
    const provider = config['rule-providers'][providerName];
    if (!provider || !['domain', 'classical'].includes(provider.behavior)) continue;
    if (['REJECT', 'REJECT-DROP', 'PASS'].includes(target)) continue;
    if (['private', 'cn', 'douyin'].includes(providerName) || providerName.startsWith('domestic_')) continue;
    expectedPolicies.set(providerName, target);
  }
  assert.ok(expectedPolicies.size > 0);
  for (const [providerName, target] of expectedPolicies) {
    const dns = policyForRuleSet(config, providerName);
    assert.ok(dns, `missing DNS egress for rule-set:${providerName} → ${target}`);
    const dnsTarget = target === otherAppleGroup ? siriAiGroup : target;
    const dnsTargetGroup = config['proxy-groups'].find((group) => group.name === dnsTarget);
    if (
      dnsTargetGroup?.proxies.length &&
      dnsTargetGroup.proxies.every((proxy) => ['REJECT', 'REJECT-DROP', 'PASS'].includes(proxy))
    ) {
      assert.equal(dns, 'rcode://name_error');
    } else if (target === '直连' || providerName === 'microsoft' || providerName === 'googlefcm') {
      assert.deepEqual(dns, domesticDnsResolvers);
    } else {
      for (const resolver of Array.isArray(dns) ? dns : [dns]) assert.equal(dnsRouteFor(resolver), dnsTarget);
    }
  }
  assert.ok(config.dns['nameserver-policy']['rule-set:ai'].every((dns) => dnsRouteFor(dns) === 'AI'));
  assert.ok(config.dns['nameserver-policy']['rule-set:google'].every((dns) => dnsRouteFor(dns) === 'Google'));
  assert.ok(config.dns['nameserver-policy']['rule-set:youtube'].every((dns) => dnsRouteFor(dns) === 'YouTube'));
  assert.ok(config.rules.includes('RULE-SET,emby_keyword,Emby'));
  assert.deepEqual(config['rule-providers'].emby_keyword.payload, ['DOMAIN-KEYWORD,emby']);
  assert.ok(policyForRuleSet(config, 'emby_keyword').every((dns) => dnsRouteFor(dns) === 'Emby'));
});

test('Apple real-IP DNS exceptions preserve encrypted route-specific resolvers and narrow iCloud suffix', () => {
  const config = build().config;
  const filters = config.dns['fake-ip-filter'];
  for (const domain of [
    'rule-set:apple_siri_regex',
    '+.smoot.apple.com',
    '+.issuer.apple.com',
    '+.ropes.apple.com',
    '+.app.apple.com',
    'cp4.cloudflare.com',
    'bag.itunes.apple.com',
  ])
    assert.ok(filters.includes(domain), `missing Fake-IP filter ${domain}`);
  assert.ok(!filters.includes('+.icloud-content.com'));
  const policy = config.dns['nameserver-policy'];
  for (const key of ['+.smoot.apple.com', '+.issuer.apple.com', 'cp4.cloudflare.com']) {
    assert.ok(policy[key]);
    for (const resolver of policy[key]) assert.match(resolver, /^(https|tls|quic):\/\//);
  }
  for (const resolver of policyForRuleSet(config, 'apple_siri_regex')) assert.match(resolver, /^(https|tls|quic):\/\//);
  const suffixMatches = (suffix, domain) => domain === suffix || domain.endsWith(`.${suffix}`);
  for (const host of ['icloud-content.com', 'edge.hkg.icloud-content.com', 'a.b.icloud-content.com'])
    assert.equal(suffixMatches('icloud-content.com', host), true);
  for (const host of ['icloud-content.com.cn', 'fakeicloud-content.com', 'icloud-content.com.evil'])
    assert.equal(suffixMatches('icloud-content.com', host), false);
});

test('dynamic AI provider and DNS policy share the AI egress group', () => {
  const config = build().config;
  assert.ok(config.rules.includes('RULE-SET,ai,AI'));
  assert.deepEqual(
    config.rules.filter((rule) => rule.endsWith(',AI')),
    ['RULE-SET,ai,AI'],
  );
  const resolvers = config.dns['nameserver-policy']['rule-set:ai'];
  assert.ok(resolvers?.length > 0, 'missing DNS policy for the AI rule-set');
  assert.ok(resolvers.every((dns) => dnsRouteFor(dns) === 'AI'));
});

test('node UDP declarations pass through unchanged and QUIC blocking stays opt-in', () => {
  for (const udp of [true, false, undefined]) {
    const node = { ...clean().proxies[0], name: '美国 UDP fixture' };
    if (udp !== undefined) node.udp = udp;
    const config = build({ subscription: { proxies: [node] } }).config;
    const actual = config.proxies.find((proxy) => proxy.name.includes('UDP fixture'));
    assert.equal(actual.udp, udp);
  }
  const defaults = build().config;
  assert.equal(load().ruleOptionsEnable['拦截代理QUIC'], false);
  assert.ok(!defaults.rules.some((rule) => rule.startsWith('AND,') && rule.endsWith(',REJECT')));
  const enabled = build({ settings: { options: { 拦截代理QUIC: true } } }).config;
  assert.ok(enabled.rules.some((rule) => rule.startsWith('AND,') && rule.endsWith(',REJECT')));
});
test('provider IP preference and both rate filters preserve ordinary region groups', () => {
  const config = build({
    settings: { options: { 节点IPv4优先: true, 过滤高倍率: true, 过滤低倍率: true } },
  }).config;
  assert.equal(config['proxy-providers'].订阅.override['ip-version'], 'ipv4-prefer');
  assert.ok(config['proxy-groups'].some((g) => g.name === '香港'));
  const both = build({ settings: { options: { 节点IPv4优先: true, 节点IPv6优先: true } } }).config;
  assert.ok(!('ip-version' in both['proxy-providers'].订阅.override));
  assert.ok(both['proxy-providers'].订阅.override['proxy-name']);
});
test('airport fake-IP filters, DNS policies, and extra DNS settings never leak into generated output', () => {
  const subscription = clean();
  subscription.proxies[0].server = 'a.special.nodes.test';
  subscription.dns = {
    'fake-ip-filter': ['+.airport.example', 'airport.example'],
    'fake-ip-filter-mode': 'blacklist',
    nameserver: ['https://airport.test/dns-query'],
    'nameserver-policy': { '+.airport.example': 'https://policy.airport.test/dns-query' },
    'proxy-server-nameserver-policy': {
      '+.nodes.test': 'https://broad.test/dns-query',
      '+.special.nodes.test': 'https://specific.test/dns-query',
    },
  };
  subscription.hosts = { 'airport-host.example': '192.0.2.10' };
  subscription.rules = ['DOMAIN,airport.example,DIRECT'];
  subscription['proxy-groups'] = [{ name: '机场自定义组', type: 'select', proxies: ['DIRECT'] }];
  subscription['rule-providers'] = {
    airport: { type: 'inline', behavior: 'domain', payload: ['DOMAIN,airport.example'] },
  };
  subscription.tun = { enable: false, stack: 'system' };
  subscription['profile'] = { 'store-fake-ip': false };
  subscription['external-controller'] = '0.0.0.0:9999';
  subscription['airport-sentinel'] = { shouldNotSurvive: true };
  const config = build({ subscription }).config;
  assert.ok(!config.dns['fake-ip-filter'].includes('+.airport.example'));
  assert.ok(!config.dns['fake-ip-filter'].includes('airport.example'));
  assert.ok(!('fake-ip-filter-mode' in config.dns));
  assert.deepEqual(config.dns['proxy-server-nameserver-policy'], {});
  assert.ok(!config.dns.nameserver.includes('https://airport.test/dns-query'));
  assert.ok(!config.dns['nameserver-policy']['+.airport.example']);
  assert.ok(!config.hosts['airport-host.example']);
  assert.ok(!config.rules.includes('DOMAIN,airport.example,DIRECT'));
  assert.ok(!config['proxy-groups'].some((group) => group.name === '机场自定义组'));
  assert.ok(!config['rule-providers'].airport);
  assert.equal(config.tun.stack, 'mips');
  assert.equal(config.tun.enable, true);
  assert.equal(config.profile['store-fake-ip'], true);
  assert.equal(config['external-controller'], undefined);
  assert.equal(config['external-ui-url'], undefined);
  assert.ok(!('airport-sentinel' in config));
});
test('CLI applies edited booleans and preserves the subscription URL from a settings YAML', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myproxy-cli-'));
  const settings = YAML.parse(build().text);
  settings['x-myProxyRules'].options[siriAiOption] = false;
  settings['proxy-providers'].订阅.url = 'https://subscription.example.test/fixture';
  const input = path.join(dir, 'settings.yaml');
  const output = path.join(dir, 'output.yaml');
  fs.writeFileSync(input, YAML.stringify(settings));
  const result = spawnSync(process.execPath, ['tools/build.js', '--settings', input, '--output', output], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const generated = YAML.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(generated['proxy-providers'].订阅.url, settings['proxy-providers'].订阅.url);
  assert.ok(generated['proxy-groups'].some((group) => group.name === siriAiGroup));
  assert.ok(generated.dns['nameserver-policy']['rule-set:apple'].every((dns) => dnsRouteFor(dns) === siriAiGroup));
});
test('CLI rejects removed x-myClashRules metadata with a migration message', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myproxylegacy-'));
  const settings = YAML.parse(build().text);
  const legacyMetadata = settings['x-myProxyRules'];
  delete settings['x-myProxyRules'];
  legacyMetadata.options[siriAiOption] = false;
  settings['x-myClashRules'] = legacyMetadata;
  const input = path.join(dir, 'legacy-settings.yaml');
  const output = path.join(dir, 'output.yaml');
  fs.writeFileSync(input, YAML.stringify(settings));
  const result = spawnSync(process.execPath, ['tools/build.js', '--settings', input, '--output', output], {
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /不再支持 x-myClashRules.*x-myProxyRules/);
  assert.ok(!fs.existsSync(output));
});

test('CLI refuses private subscription output inside tracked repository paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myproxy-private-'));
  const subscription = path.join(dir, 'subscription.yaml');
  fs.writeFileSync(subscription, YAML.stringify(clean()));
  const result = spawnSync(
    process.execPath,
    ['tools/build.js', '--subscription', subscription, '--output', 'Config/mihomoConfig.yaml'],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /只能输出到仓库内 .local/);
  const settings = YAML.parse(build().text);
  settings['proxy-providers'].订阅.url = 'https://subscription.example.test/private-fixture';
  const input = path.join(dir, 'private-settings.yaml');
  fs.writeFileSync(input, YAML.stringify(settings));
  const withUrl = spawnSync(
    process.execPath,
    ['tools/build.js', '--settings', input, '--output', 'Config/mihomoConfig.yaml'],
    { encoding: 'utf8' },
  );
  assert.notEqual(withUrl.status, 0);
  assert.match(withUrl.stderr, /只能输出到仓库内 .local/);
});

test('minimal mode keeps apple_ip in the IP section and includes eligible regions in AppleProxy', () => {
  const multiRegionSub = { proxies: [proxy('美国 测试'), proxy('日本 测试')] };
  for (const subscription of [undefined, multiRegionSub]) {
    const config = build({ subscription, settings: { options: { 极简分流: true } } }).config;
    const appleIpIndex = config.rules.indexOf(`RULE-SET,apple_ip,${appleProxyGroup},no-resolve`);
    const privateIpIndex = config.rules.indexOf('RULE-SET,private_ip,直连,no-resolve');
    const geolocationNonCnIndex = config.rules.indexOf('RULE-SET,geolocation-!cn,默认代理');
    const appleProxyIndex = config.rules.indexOf(`RULE-SET,apple_proxy,${appleProxyGroup}`);
    assert.ok(appleIpIndex > appleProxyIndex, 'apple_ip must stay after AppleProxy domain rules');
    assert.ok(appleIpIndex > geolocationNonCnIndex, 'apple_ip must stay in the IP rules section');
    assert.ok(appleIpIndex < privateIpIndex, 'apple_ip must precede private_ip');

    const appleProxy = config['proxy-groups'].find((group) => group.name === appleProxyGroup);
    assert.equal(appleProxy.proxies[0], '美国');
    assert.ok(appleProxy.proxies.includes('日本'));
    assert.ok(appleProxy.proxies.includes('直连'));
  }
});

test('Compatible_With_Bettbox policyGroupOptions align with ruleOptionsEnable keys and DNS arrays do not alias across runs', () => {
  const api = loadScript('Script/mihomoScript.js');
  for (const option of api.Compatible_With_Bettbox.policyGroupOptions) {
    assert.ok(Object.hasOwn(api.ruleOptionsEnable, option), `unknown policyGroupOption ${option}`);
  }
  const first = api.main(clean());
  first.dns.nameserver.push('mutated');
  first.dns['proxy-server-nameserver'].push('mutated');
  const second = api.main(clean());
  assert.ok(!second.dns.nameserver.includes('mutated'));
  assert.ok(!second.dns['proxy-server-nameserver'].includes('mutated'));
});

test('anti-DNS-leak hardening blocks DoT/DoQ 853, Firefox DoH canary, aligns STUN, excludes direct CDN sets and removes load-balance', () => {
  for (const subscription of [undefined, clean()]) {
    const config = build({ subscription }).config;
    assert.ok(!config['proxy-groups'].some((g) => g.name === '负载均衡' || g.type === 'load-balance'));
    assert.equal(config['disable-keep-alive'], true);
    assert.equal(config.dns['cache-algorithm'], 'lru');
    assert.equal(config.dns['cache-max-size'], 1);
    assert.equal(config.sniffer['override-destination'], true);
    assert.ok(!config.dns['fake-ip-filter'].includes('rule-set:googlefcm'));
    assert.equal(config.dns['nameserver-policy']['use-application-dns.net'], 'rcode://name_error');
    assert.ok(config.rules.includes('DST-PORT,853,REJECT'));
    assert.ok(config.rules.indexOf('DST-PORT,853,REJECT') < config.rules.indexOf('RULE-SET,google,Google'));
    assert.ok(!config.rules.some((rule) => rule.includes('stun.l.google.com')));
    assert.ok(!config.rules.some((rule) => rule.includes('DST-PORT,3478') || rule.includes('DST-PORT,19302')));
    assert.ok(!Object.hasOwn(config.dns['nameserver-policy'], '+.stun.l.google.com'));
    assert.ok(config['rule-providers']['category-stun']);
    assert.ok(config.rules.includes('RULE-SET,category-stun,默认代理'));
    assert.ok(
      config.rules.indexOf('DOMAIN-SUFFIX,cn,直连') < config.rules.indexOf('RULE-SET,category-stun,默认代理'),
      'category-stun must stay after domestic domains so mainland STUN stays direct',
    );
    assert.ok(
      config.rules.indexOf('RULE-SET,category-stun,默认代理') <
        config.rules.indexOf('AND,((RULE-SET,geolocation-!cn),(NOT,((RULE-SET,dns_domestic_cdn)))),默认代理'),
      'category-stun must precede geolocation-!cn',
    );
    assert.ok(config.rules.includes('RULE-SET,dns_microsoft_cdn,直连'));
    assert.ok(config.rules.includes('AND,((RULE-SET,microsoft),(NOT,((RULE-SET,dns_microsoft_cdn)))),Microsoft'));
    assert.ok(config.rules.includes('RULE-SET,game_platforms_download_cn,直连'));
    assert.ok(
      config.rules.includes('AND,((RULE-SET,overseas_games),(NOT,((RULE-SET,game_platforms_download_cn)))),海外游戏'),
    );
    assert.ok(config.rules.includes('RULE-SET,tracker,BT/PT'));
    assert.ok(config.rules.includes('RULE-SET,category-ads-all,AdBlock'));
    assert.ok(config.rules.includes('RULE-SET,httpdns,AdBlock'));
    assert.equal(policyForRuleSet(config, 'httpdns'), 'rcode://name_error');
    assert.ok(config.rules.includes('RULE-SET,openai_ip,AI,no-resolve'));
    assert.ok(config.rules.includes('RULE-SET,dns_domestic_cdn,直连'));
    assert.ok(config.rules.includes('DOMAIN-SUFFIX,cn,直连'));
    assert.ok(config.rules.indexOf('RULE-SET,geolocation-cn,直连') < config.rules.indexOf('DOMAIN-SUFFIX,cn,直连'));
    assert.ok(
      config.rules.indexOf('DOMAIN-SUFFIX,cn,直连') <
        config.rules.indexOf('AND,((RULE-SET,geolocation-!cn),(NOT,((RULE-SET,dns_domestic_cdn)))),默认代理'),
    );
    assert.deepEqual(config.dns['nameserver-policy']['+.cn'], domesticDnsResolvers);
    const policyKeys = Object.keys(config.dns['nameserver-policy']);
    assert.ok(
      policyKeys.indexOf(policyKeyForRuleSet(config, 'geolocation-cn')) < policyKeys.indexOf('+.cn'),
      '+.cn DNS policy must stay after geolocation-cn and specific service policies',
    );
    assert.ok(
      policyKeys.indexOf('+.cn') < policyKeys.indexOf(policyKeyForRuleSet(config, 'category-stun')),
      'category-stun DNS policy must stay after +.cn and domestic DNS policies',
    );
    assert.ok(
      policyKeys.indexOf('+.cn') < policyKeys.indexOf(policyKeyForRuleSet(config, 'geolocation-!cn')),
      '+.cn DNS policy must precede geolocation-!cn',
    );
    assert.deepEqual(policyForRuleSet(config, 'category-stun'), policyForRuleSet(config, 'geolocation-!cn'));
    assert.ok(config.rules.includes('AND,((RULE-SET,geolocation-!cn),(NOT,((RULE-SET,dns_domestic_cdn)))),默认代理'));
    assert.ok(config.rules.includes('RULE-SET,cn_ip,直连,no-resolve'));
    assert.deepEqual(policyForRuleSet(config, 'microsoft'), domesticDnsResolvers);
    assert.deepEqual(policyForRuleSet(config, 'googlefcm'), domesticDnsResolvers);
  }
});
