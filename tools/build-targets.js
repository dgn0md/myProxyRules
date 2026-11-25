'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const YAML = require('yaml');
const { build, readYaml } = require('./build');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_CONFIG = path.join(ROOT, 'Config/mihomoConfig.yaml');
const CLIENT_ROOT = path.join(ROOT, 'Config');
const SUBSCRIPTION_PLACEHOLDER = 'https://example.invalid/replace-with-your-subscription';
const PROXY_TEST_URL = 'https://cp.cloudflare.com/generate_204';
const DNS_CLOUDFLARE = 'https://cloudflare-dns.com/dns-query';
const DNS_GOOGLE = 'https://dns.google/dns-query';
const DNS_ALI = 'https://dns.alidns.com/dns-query';
const DNS_TENCENT = 'https://doh.pub/dns-query';

const TARGETS = {
  stash: { dir: 'stash', file: 'profile.yaml', cdnFile: 'profile.cdn.yaml', title: 'Stash' },
  surge: { dir: 'surge', file: 'profile.conf', cdnFile: 'profile.cdn.conf', title: 'Surge' },
  shadowrocket: {
    dir: 'shadowrocket',
    file: 'profile.conf',
    cdnFile: 'profile.cdn.conf',
    title: 'Shadowrocket',
  },
  quantumultx: {
    dir: 'quantumultx',
    file: 'profile.conf',
    cdnFile: 'profile.cdn.conf',
    title: 'Quantumult X',
  },
};

// Source choices are explicit: a target-native file from the Mihomo provider's
// upstream wins when it is known to be readable and semantically suitable. The
// target-specific fallback remains a direct upstream URL; this repository does
// not download, filter, merge, or republish rule members.
const CLIENT_RULE_CATEGORIES = {
  googlefcm: 'GoogleFCM',
  youtube: 'YouTube',
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  apple: 'Apple',
  telegram: 'Telegram',
  steam: 'Steam',
  tiktok: 'TikTok',
  twitter: 'Twitter',
  meta: 'Facebook',
  line: 'Line',
  netflix: 'Netflix',
  pikpak: 'PikPak',
  spotify: 'Spotify',
  cryptocurrency: 'Cryptocurrency',
  paypal: 'PayPal',
  patreon: 'Patreon',
  ehentai: 'EHentai',
  'category-ads': 'Advertising',
  apple_proxy: 'AppleProxy',
};

const SURGE_RULE_OVERRIDES = {
  apple_cn:
    'https://raw.githubusercontent.com/SukkaW/Surge/0afc9c2ee92aadbf79ce1c9caf03f724135073ea/Source/non_ip/apple_cn.conf',
};

const TARGET_SOURCE_NAMES = {
  stash: 'Stash',
  surge: 'Surge',
  shadowrocket: 'Shadowrocket',
  quantumultx: 'QuantumultX',
};

function blackmatrixRuleSource(target, category, selection) {
  const targetName = TARGET_SOURCE_NAMES[target];
  if (!targetName) return undefined;
  return {
    url:
      'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/' +
      targetName +
      '/' +
      category +
      '/' +
      category +
      '.list',
    format: target === 'quantumultx' ? 'quantumultx-filter' : 'rule-set',
    upstream: 'blackmatrix7/ios_rule_script',
    selection,
  };
}

const RULE_SOURCE_REGISTRY = Object.fromEntries(
  Object.entries(CLIENT_RULE_CATEGORIES).map(([providerName, category]) => {
    const sources = Object.fromEntries(
      Object.keys(TARGET_SOURCE_NAMES)
        .filter((target) => target !== 'stash')
        .map((target) => [target, blackmatrixRuleSource(target, category, 'client-native-fallback')]),
    );
    if (providerName === 'apple_proxy') {
      return [
        providerName,
        {
          upstream: 'blackmatrix7/ios_rule_script',
          upstreamFormat: 'Clash YAML',
          sameUpstream: Object.fromEntries(
            Object.entries(sources).map(([target, source]) => [
              target,
              {
                ...source,
                selection: 'same-upstream-unverified',
                compatibilityVerified: false,
                reason:
                  'The target variants contain different rule types and member counts from the Clash YAML source.',
              },
            ]),
          ),
          fallback: sources,
        },
      ];
    }
    return [
      providerName,
      {
        upstream: 'appshubcc/bett-rules',
        upstreamFormat: 'MRS',
        sameUpstream: {},
        sameUpstreamReason:
          'The upstream .list/.yaml variants are generic payload formats; direct client use and matching semantics are not verified.',
        fallback: sources,
      },
    ];
  }),
);

RULE_SOURCE_REGISTRY.apple_cn = {
  upstream: 'SukkaW/Surge',
  upstreamFormat: 'Surge rule list',
  sameUpstream: {
    surge: {
      url: SURGE_RULE_OVERRIDES.apple_cn,
      format: 'rule-set',
      upstream: 'SukkaW/Surge',
      selection: 'same-upstream-native-variant',
      compatibilityVerified: true,
    },
    shadowrocket: {
      url: SURGE_RULE_OVERRIDES.apple_cn,
      format: 'rule-set',
      upstream: 'SukkaW/Surge',
      selection: 'same-upstream-native-variant',
      compatibilityVerified: true,
    },
  },
  fallback: {},
};

function sameUpstreamRuleCandidates(target, providerName, config) {
  const entry = RULE_SOURCE_REGISTRY[providerName];
  const explicit = entry && entry.sameUpstream[target];
  if (explicit) return [explicit];

  const provider = config?.['rule-providers']?.[providerName];
  if (
    !provider ||
    provider.format !== 'mrs' ||
    !provider.url?.startsWith('https://fastly.jsdelivr.net/gh/appshubcc/bett-rules@meta/geo/') ||
    !provider.url.endsWith('.mrs')
  ) {
    return [];
  }

  const baseUrl = provider.url.slice(0, -'.mrs'.length);
  const reason =
    'Bett provides generic payload variants; client rule syntax and exact/suffix matching semantics are not verified.';
  return [
    {
      url: baseUrl + '.list',
      format: provider.behavior === 'ipcidr' ? 'mihomo-cidr-list' : 'mihomo-domain-list',
      upstream: 'appshubcc/bett-rules',
      selection: 'same-upstream-unverified',
      compatibilityVerified: false,
      reason,
    },
    {
      url: baseUrl + '.yaml',
      format: 'mihomo-yaml-payload',
      upstream: 'appshubcc/bett-rules',
      selection: 'same-upstream-unverified',
      compatibilityVerified: false,
      reason,
    },
  ];
}

function resolveRuleSource(target, providerName, config) {
  const entry = RULE_SOURCE_REGISTRY[providerName];
  const sameUpstream = sameUpstreamRuleCandidates(target, providerName, config).find(
    (candidate) => candidate.compatibilityVerified,
  );
  if (sameUpstream) return sameUpstream;
  return entry?.fallback[target];
}

function rawRuleUrl(target, providerName, config) {
  return resolveRuleSource(target, providerName, config)?.url;
}

function targetName(name) {
  if (name === 'DIRECT' || name.startsWith('🇨🇳 直连 |') || name === '内置DNS') return 'DIRECT';
  if (name === 'REJECT' || name === 'REJECT-DROP') return 'REJECT';
  if (name === 'PASS') return 'DIRECT';
  return name;
}

function unique(items) {
  return [...new Set(items)];
}

function members(group, target) {
  return unique((group.proxies || []).map(targetName).map((name) => mapPolicy(target, name)));
}

function compileRegex(group) {
  const positive = group.filter ? group.filter.replace(/^\(\?i\)/, '') : '';
  const negative = group['exclude-filter'] ? group['exclude-filter'].replace(/^\(\?i\)/, '') : '';
  if (!positive && !negative) return '';
  const prefix = group.filter && group.filter.startsWith('(?i)') ? '(?i)' : '';
  const positivePart = positive ? '(?=.*(?:' + positive + '))' : '';
  const negativePart = negative ? '(?!.*(?:' + negative + '))' : '';
  return prefix + '^' + negativePart + positivePart + '.*$';
}

function mapPolicy(target, policy) {
  if (policy === 'DIRECT') return target === 'quantumultx' ? 'direct' : 'DIRECT';
  if (policy === 'REJECT' || policy === 'REJECT-DROP') return target === 'quantumultx' ? 'reject' : 'REJECT';
  if (policy === 'PASS') return target === 'quantumultx' ? 'direct' : 'DIRECT';
  return policy;
}

function parseRule(line) {
  const parts = line.split(',');
  return { parts, type: parts[0], policy: parts[parts.length - 1], options: parts.slice(3) };
}

function finalRule(target, policy) {
  if (target === 'quantumultx') return 'final, ' + policy;
  return 'FINAL,' + policy;
}

function remoteRule(target, source, policy, noResolve) {
  const suffix = noResolve ? ',no-resolve' : '';
  if (source.format === 'quantumultx-filter') return source.url + ', force-policy=' + policy + ', enabled=true';
  if (source.format === 'rule-set') return 'RULE-SET,' + source.url + ',' + policy + suffix;
  throw new Error('Unsupported client rule source format: ' + source.format);
}

function convertInlineRule(target, parsed) {
  const typeMap = {
    DOMAIN: target === 'quantumultx' ? 'host' : 'DOMAIN',
    'DOMAIN-SUFFIX': target === 'quantumultx' ? 'host-suffix' : 'DOMAIN-SUFFIX',
    'DOMAIN-KEYWORD': target === 'quantumultx' ? 'host-keyword' : 'DOMAIN-KEYWORD',
    'IP-CIDR': target === 'quantumultx' ? 'ip-cidr' : 'IP-CIDR',
    'IP-CIDR6': target === 'quantumultx' ? 'ip6-cidr' : 'IP-CIDR6',
    'SRC-IP-CIDR': target === 'quantumultx' ? 'src-ip-cidr' : 'SRC-IP-CIDR',
    'DST-PORT': target === 'quantumultx' ? 'port' : target === 'shadowrocket' ? 'DST-PORT' : 'DEST-PORT',
  };
  const mappedType = typeMap[parsed.type];
  if (!mappedType) return undefined;
  const policy = mapPolicy(target, parsed.policy);
  const value = parsed.parts[1];
  const noResolve = parsed.options.includes('no-resolve') ? ',no-resolve' : '';
  if (target === 'quantumultx') return mappedType + ', ' + value + ', ' + policy + noResolve;
  return mappedType + ',' + value + ',' + policy + noResolve;
}

function appendRule(target, line, config, supported, omitted) {
  const parsed = parseRule(line);
  if (parsed.type === 'MATCH') {
    supported.push(finalRule(target, mapPolicy(target, parsed.parts[1])));
    return;
  }
  if (parsed.type === 'DST-PORT' && parsed.parts[1] === '53') {
    omitted.push('DNS port interception is handled by the target client DNS engine.');
    return;
  }
  if (parsed.type === 'RULE-SET') {
    const providerName = parsed.parts[1];
    if (providerName === 'cn_ip') {
      omitted.push('cn_ip MRS is not replaced by a different client GeoIP database.');
      return;
    }
    if (providerName === 'private_ip') {
      omitted.push('private_ip MRS is not consumed by this client profile.');
      return;
    }
    if (providerName.startsWith('domestic_') && providerName.endsWith('_noncn')) {
      omitted.push('domestic vendor exclusion set is omitted with its paired direct rule.');
      return;
    }
    if (
      providerName.startsWith('domestic_') ||
      providerName === 'geolocation-cn' ||
      providerName === 'geolocation-!cn' ||
      providerName === 'private' ||
      providerName === 'dns_domestic_cdn' ||
      providerName === 'dns_microsoft_cdn' ||
      providerName === 'dns_steam_cn'
    ) {
      omitted.push(providerName + ' has no verified equivalent in this client rule format.');
      return;
    }
    const source = resolveRuleSource(target, providerName, config);
    if (!source) {
      const candidate = sameUpstreamRuleCandidates(target, providerName, config)[0];
      const detail = candidate ? ' Same-upstream variant rejected: ' + candidate.reason : '';
      omitted.push(providerName + ' has no verified same-upstream or client-native replacement.' + detail);
      return;
    }
    supported.push(remoteRule(target, source, mapPolicy(target, parsed.policy), parsed.options.includes('no-resolve')));
    return;
  }
  if (parsed.type === 'AND' || parsed.type === 'OR' || parsed.type === 'NOT') {
    omitted.push(parsed.type + ' rule is not expanded by this adapter.');
    return;
  }
  const converted = convertInlineRule(target, parsed);
  if (converted) {
    supported.push(converted);
    return;
  }
  omitted.push(parsed.type + ' rule type is not mapped by this adapter.');
}

function buildRules(target, config) {
  const supported = [];
  const omitted = [];
  for (const line of config.rules || []) appendRule(target, line, config, supported, omitted);
  return {
    lines: unique(supported),
    omitted: unique(omitted),
    mappedRemoteProviders: (config.rules || [])
      .map(parseRule)
      .filter((rule) => rule.type === 'RULE-SET' && resolveRuleSource(target, rule.parts[1], config))
      .map((rule) => rule.parts[1]),
  };
}

function groupRegex(group) {
  return compileRegex(group).replaceAll(',', '\\,');
}

function surgeGroup(group, subscriptionUrl) {
  const values = [group.type === 'load-balance' ? 'load-balance' : group.type === 'url-test' ? 'url-test' : 'select'];
  values.push(...members(group, 'surge'));
  if (group['include-all-providers'] || group.filter) {
    values.push('policy-path=' + subscriptionUrl);
    const regex = groupRegex(group);
    if (regex) values.push('policy-regex-filter=' + regex);
  }
  if (group.type === 'url-test' || group.type === 'load-balance') {
    if (group.interval) values.push('interval=' + group.interval);
    if (group.tolerance !== undefined) values.push('tolerance=' + group.tolerance);
    if (group.url) values.push('url=' + group.url);
  }
  return group.name + ' = ' + values.join(', ');
}

function shadowrocketGroup(group) {
  const values = [group.type === 'load-balance' ? 'load-balance' : group.type === 'url-test' ? 'url-test' : 'select'];
  values.push(...members(group, 'shadowrocket'));
  const regex = groupRegex(group);
  if (regex) values.push('policy-regex-filter=' + regex);
  if (group.type === 'url-test' || group.type === 'load-balance') {
    if (group.interval) values.push('interval=' + group.interval);
    if (group.tolerance !== undefined) values.push('tolerance=' + group.tolerance);
    if (group.url) values.push('url=' + group.url);
  }
  return group.name + ' = ' + values.join(', ');
}

function quantumultPolicy(group) {
  const candidates = members(group, 'quantumultx');
  const regex = groupRegex(group);
  if (group['include-all-providers'] || group.filter) {
    const common = 'resource-tag-regex=订阅' + (regex ? ', server-tag-regex=' + regex : '');
    if (group.type === 'url-test') {
      // Quantumult X only supports tag-regex selectors on static, available,
      // and round-robin policies. Preserve the candidate filter rather than
      // emitting an unsupported selector on url-latency-benchmark.
      return 'available = ' + group.name + ', ' + common;
    }
    if (group.type === 'load-balance') return 'round-robin = ' + group.name + ', ' + common;
    return 'static = ' + group.name + ', ' + common;
  }
  if (group.type === 'url-test') {
    return (
      'url-latency-benchmark = ' +
      group.name +
      ', ' +
      candidates.join(', ') +
      ', check-interval=' +
      (group.interval || 600) +
      ', alive-checking=false, tolerance=' +
      (group.tolerance || 50)
    );
  }
  if (group.type === 'load-balance') return 'round-robin = ' + group.name + ', ' + candidates.join(', ');
  return 'static = ' + group.name + ', ' + candidates.join(', ');
}

function getSubscription() {
  return SUBSCRIPTION_PLACEHOLDER;
}

function assertSafeProfileConfig(config) {
  // The only inline entries in the shared template are built-in DIRECT/DNS adapters.
  const builtInNames = new Set([
    '🇨🇳 直连 | 双栈',
    '🇨🇳 直连 | IPv4优先',
    '🇨🇳 直连 | IPv6优先',
    '🇨🇳 直连 | 仅IPv4',
    '🇨🇳 直连 | 仅IPv6',
    '内置DNS',
  ]);
  const inlineNodes = (config.proxies || []).filter((proxy) => {
    const expectedType = proxy.name === '内置DNS' ? 'dns' : 'direct';
    return !builtInNames.has(proxy.name) || proxy.type !== expectedType;
  });
  if (inlineNodes.length) {
    throw new Error('Refusing to generate tracked client profiles with inline proxy nodes.');
  }
  for (const [name, provider] of Object.entries(config['proxy-providers'] || {})) {
    if (provider.url && provider.url !== SUBSCRIPTION_PLACEHOLDER) {
      throw new Error(
        'Refusing to generate tracked client profiles with a non-placeholder URL in proxy provider ' + name + '.',
      );
    }
  }
}

function addDnsMappings(config) {
  const policy = (config.dns && config.dns['nameserver-policy']) || {};
  const lines = [];
  for (const [pattern, value] of Object.entries(policy)) {
    if (pattern.startsWith('rule-set:')) continue;
    const values = Array.isArray(value) ? value : [value];
    const urls = unique(
      values
        .filter((item) => typeof item === 'string' && item.startsWith('https://'))
        .map((item) => item.split('#')[0].replace(/&h3=true$/, '')),
    );
    if (!urls.length) continue;
    const mappedPattern = pattern.startsWith('+.') ? '/*.' + pattern.slice(2) : '/' + pattern;
    lines.push('doh-server = ' + mappedPattern + '/' + urls.join(','));
  }
  return unique(lines);
}

function renderStash(config) {
  const clean = JSON.parse(JSON.stringify(config));
  return [
    '# myProxyRules Stash full profile',
    '# Generated from the shared Mihomo configuration model. Stash-only scripts/modules are not included.',
    '# Replace proxy-providers.订阅.url with a Stash-compatible Clash subscription before use.',
    YAML.stringify(clean, { lineWidth: 120 }),
  ].join('\n');
}

function renderSurge(config, compiled) {
  const subscriptionUrl = getSubscription();
  const groups = config['proxy-groups'] || [];
  const rules = compiled.lines.filter((line) => !line.startsWith('FINAL,'));
  const final = compiled.lines.find((line) => line.startsWith('FINAL,')) || 'FINAL,漏网之鱼';
  const comments = compiled.omitted.map((line) => '# COMPATIBILITY: omitted: ' + line);
  return [
    '# myProxyRules Surge profile',
    '# Proxy subscription must be in Surge-compatible format; replace the example URL in policy-path.',
    '# DNS is encrypted by default; per-provider Mihomo nameserver-policy is not portable.',
    '[General]',
    'dns-server = 223.5.5.5',
    'encrypted-dns-server = ' + DNS_CLOUDFLARE + ', ' + DNS_GOOGLE,
    'encrypted-dns-follow-outbound-mode = true',
    'encrypted-dns-skip-cert-verification = false',
    'hijack-dns = *:53',
    'ipv6 = true',
    '',
    '[Proxy]',
    '',
    '[Proxy Group]',
    ...groups.map((group) => surgeGroup(group, subscriptionUrl)),
    '',
    '[Rule]',
    ...comments,
    ...rules,
    final,
    '',
  ].join('\n');
}

function renderShadowrocket(config, compiled) {
  const groups = config['proxy-groups'] || [];
  const rules = compiled.lines.filter((line) => !line.startsWith('FINAL,'));
  const final = compiled.lines.find((line) => line.startsWith('FINAL,')) || 'FINAL,漏网之鱼';
  const comments = compiled.omitted.map((line) => '# COMPATIBILITY: omitted: ' + line);
  return [
    '# myProxyRules Shadowrocket profile',
    '# Import/update the proxy subscription in Shadowrocket first; groups filter imported nodes by name.',
    '# DNS uses encrypted DoH endpoints and does not fall back to system DNS.',
    '[General]',
    'dns-server = ' + DNS_CLOUDFLARE + '#proxy=默认代理,' + DNS_GOOGLE + '#proxy=默认代理',
    'fallback-dns-server = ' + DNS_TENCENT + ',' + DNS_ALI,
    'dns-direct-system = false',
    'dns-direct-fallback-proxy = false',
    'hijack-dns = 8.8.8.8:53,8.8.4.4:53',
    'ipv6 = true',
    '',
    '[Proxy]',
    '',
    '[Proxy Group]',
    ...groups.map(shadowrocketGroup),
    '',
    '[Rule]',
    ...comments,
    ...rules,
    final,
    '',
  ].join('\n');
}

function renderQuantumultX(config, compiled) {
  const subscriptionUrl = getSubscription();
  const policies = (config['proxy-groups'] || []).map(quantumultPolicy);
  const remoteRules = compiled.lines.filter((line) => line.includes(', force-policy='));
  const localRules = compiled.lines.filter((line) => !line.includes(', force-policy=') && !line.startsWith('final,'));
  const final = compiled.lines.find((line) => line.startsWith('final,')) || 'final, 漏网之鱼';
  const comments = compiled.omitted.map((line) => '; COMPATIBILITY: omitted: ' + line);
  return [
    '# myProxyRules Quantumult X full profile',
    '# Server subscription must be a Quantumult X server snippet. Rule resources use native QX format.',
    '[general]',
    'server_check_url = ' + PROXY_TEST_URL,
    'fallback_udp_policy = reject',
    '; Dynamic url-test groups use available to retain tag filters; QX cannot combine tag regex with url-latency-benchmark.',
    '',
    '[dns]',
    'no-system',
    'doh-server = ' + DNS_CLOUDFLARE + ', ' + DNS_GOOGLE,
    ...addDnsMappings(config),
    '',
    '[policy]',
    ...policies,
    '',
    '[server_remote]',
    subscriptionUrl + ', tag=订阅, opt-parser=true, update-interval=86400',
    '',
    '[filter_remote]',
    ...remoteRules,
    '',
    '[filter_local]',
    ...comments,
    ...localRules,
    final,
    '',
  ].join('\n');
}

function renderTarget(target, config) {
  assertSafeProfileConfig(config);
  if (target === 'stash') {
    return { text: renderStash(config), report: { omitted: [], mappedRemoteProviders: [] } };
  }
  const compiled = buildRules(target, config);
  const text =
    target === 'surge'
      ? renderSurge(config, compiled)
      : target === 'shadowrocket'
        ? renderShadowrocket(config, compiled)
        : renderQuantumultX(config, compiled);
  return { text, report: compiled };
}

function setHash(text, marker, value) {
  const regex = new RegExp('(^# ' + marker + ': )[0-9a-f]{64}$', 'gm');
  let count = 0;
  const result = text.replace(regex, (_line, prefix) => {
    count++;
    return prefix + value;
  });
  if (count !== 1) throw new Error('Expected exactly one ' + marker + ' hash marker.');
  return result;
}

function createArtifact(target, sourceText) {
  const info = TARGETS[target];
  const rawUrl = 'https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/' + info.dir + '/' + info.file;
  const cdnUrl = 'https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/' + info.dir + '/' + info.cdnFile;
  const bodyLines = sourceText.split('\n');
  while (bodyLines.length && bodyLines[0].startsWith('#')) bodyLines.shift();
  const body = bodyLines.join('\n').replace(/^\n/, '');
  const header = [
    '# myProxyRules ' + info.title + ' profile',
    '# Raw profile: ' + rawUrl,
    '# CDN profile: ' + cdnUrl,
    '# Raw SHA-256: ' + '0'.repeat(64),
  ].join('\n');
  let rawText = header + '\n' + body;
  const rawHash = createHash('sha256')
    .update(setHash(rawText, 'Raw SHA-256', '0'.repeat(64)), 'utf8')
    .digest('hex');
  rawText = setHash(rawText, 'Raw SHA-256', rawHash);
  let cdnText = rawText.replace(
    /^# Raw SHA-256: [0-9a-f]{64}$/m,
    (line) => line + '\n# CDN SHA-256: ' + '0'.repeat(64),
  );
  const cdnHash = createHash('sha256')
    .update(setHash(cdnText, 'CDN SHA-256', '0'.repeat(64)), 'utf8')
    .digest('hex');
  cdnText = setHash(cdnText, 'CDN SHA-256', cdnHash);
  return { rawText, cdnText, rawHash, cdnHash };
}

function loadSettings() {
  const input = readYaml(SOURCE_CONFIG);
  if (Object.hasOwn(input, 'x-myClashRules')) {
    throw new Error('不再支持 x-myClashRules，请迁移为 x-myProxyRules');
  }
  const settings = JSON.parse(JSON.stringify(input['x-myProxyRules'] || {}));
  if (settings.customProxies && settings.customProxies.length) {
    throw new Error(
      'Target profiles are generated without custom node definitions; keep private nodes out of tracked files.',
    );
  }
  return settings;
}

function generateTarget(target, config, { check = false } = {}) {
  const info = TARGETS[target];
  const dir = path.join(CLIENT_ROOT, info.dir);
  const rawPath = path.join(dir, info.file);
  const cdnPath = path.join(dir, info.cdnFile);
  const rendered = renderTarget(target, config);
  const artifact = createArtifact(target, rendered.text);
  if (check) {
    if (
      !fs.existsSync(rawPath) ||
      fs.readFileSync(rawPath, 'utf8') !== artifact.rawText ||
      !fs.existsSync(cdnPath) ||
      fs.readFileSync(cdnPath, 'utf8') !== artifact.cdnText
    ) {
      throw new Error('Generated ' + info.title + ' profiles are stale; run npm run build:targets.');
    }
    return { target, ...rendered.report, rawHash: artifact.rawHash, cdnHash: artifact.cdnHash };
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(rawPath, artifact.rawText, { mode: 0o600 });
  fs.writeFileSync(cdnPath, artifact.cdnText, { mode: 0o600 });
  return { target, ...rendered.report, rawHash: artifact.rawHash, cdnHash: artifact.cdnHash };
}

function parseArgs(args) {
  let target = 'all';
  let check = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--check') {
      check = true;
      continue;
    }
    if (args[index] === '--target' && args[index + 1]) {
      target = args[index + 1];
      index++;
      continue;
    }
    throw new Error('Usage: build-targets.js [--target all|stash|surge|shadowrocket|quantumultx] [--check]');
  }
  if (target !== 'all' && !Object.prototype.hasOwnProperty.call(TARGETS, target)) {
    throw new Error('Unknown target: ' + target);
  }
  return { targets: target === 'all' ? Object.keys(TARGETS) : [target], check };
}

function cli(args) {
  const parsed = parseArgs(args);
  const config = build({ settings: loadSettings() }).config;
  for (const target of parsed.targets) {
    const result = generateTarget(target, config, { check: parsed.check });
    console.log(
      (parsed.check ? 'Verified ' : 'Generated ') +
        TARGETS[target].title +
        ' profile; mapped remote providers: ' +
        (result.mappedRemoteProviders || []).length +
        '; documented omissions: ' +
        (result.omitted || []).length +
        '; raw SHA-256: ' +
        result.rawHash,
    );
  }
}

module.exports = {
  TARGETS,
  RULE_SOURCE_REGISTRY,
  buildRules,
  generateTarget,
  parseArgs,
  rawRuleUrl,
  renderTarget,
  resolveRuleSource,
  sameUpstreamRuleCandidates,
};

if (require.main === module) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
