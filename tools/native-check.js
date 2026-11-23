'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const { build, load } = require('./build');
const { fixtures, verifyRouting, verifyICloudContentDnsPolicy, CASES, freePort } = require('./runtime-routing');
const { verifySniffing } = require('./native-sniffing');
const { verifyDnsWhitelist } = require('./native-dns-whitelist');
async function run() {
  const binary = process.argv[2];
  const rulesDir = process.argv[3];
  if (!binary) throw new Error('用法：node tools/native-check.js /path/to/mihomo [/path/to/downloaded-rules]');
  const args = process.argv.slice(4);
  let probe = null;
  const selections = [];
  for (let i = 0; i < args.length; i++) {
    if (['--probe-domain', '--probe-ip'].includes(args[i]) && args[i + 1]) {
      if (probe) throw new Error('每次只能诊断一个目标');
      probe = { type: args[i].slice(8), value: args[++i] };
    } else if (args[i] === '--select' && args[i + 1]) {
      const value = args[++i];
      const split = value.indexOf('=');
      if (split < 1 || split === value.length - 1) throw new Error('--select 使用 组名=成员名');
      selections.push([value.slice(0, split), value.slice(split + 1)]);
    } else throw new Error(`未知或缺少值的参数：${args[i]}`);
  }
  if (probe?.type === 'domain' && (!/^(?=.{1,253}$)[a-z0-9.-]+$/i.test(probe.value) || !probe.value.includes('.')))
    throw new Error('诊断域名格式无效');
  if (probe?.type === 'ip' && !net.isIP(probe.value)) throw new Error('诊断 IP 格式无效');
  if (selections.length && !probe) throw new Error('--select 需要同时指定诊断目标');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'myproxy-native-'));
  console.log(`Evidence directory: ${temp}`);
  const cases = [{ name: 'default', settings: {} }];
  const node = {
    name: '日本 自建 住宅',
    type: 'ss',
    server: '192.0.2.1',
    port: 443,
    cipher: 'aes-128-gcm',
    password: 'test',
  };
  for (const [key, value] of Object.entries(load().ruleOptionsEnable))
    cases.push({
      name: key,
      settings: { options: { [key]: !value }, ...(key === '链式代理' ? { customProxies: [node] } : {}) },
    });
  cases.push({ name: 'both-rate-filters', settings: { options: { 过滤高倍率: true, 过滤低倍率: true } } });
  cases.push({ name: 'expanded-subscription', settings: {}, subscription: { proxies: [node] } });
  cases.push({
    name: 'expanded-chain',
    settings: { options: { 链式代理: true }, customProxies: [{ ...node, name: '美国 自建' }] },
    subscription: { proxies: [node] },
  });
  for (const entry of cases) {
    const { config } = build({ settings: entry.settings, subscription: entry.subscription });
    const file = path.join(temp, 'config.yaml');
    fs.writeFileSync(file, YAML.stringify(config));
    const result = spawnSync(binary, ['-t', '-d', temp, '-f', file], { encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 0, `${entry.name}: ${result.stdout}\n${result.stderr}`);
  }
  console.log(`Mihomo syntax checks: ${cases.length} cases passed`);
  if (!rulesDir) return;
  const config = build().config;
  const productionDnsPolicy = structuredClone(config.dns['nameserver-policy']);
  for (const [name, spec] of Object.entries(config['rule-providers'])) {
    if (spec.type === 'inline') continue;
    const file = path.resolve(rulesDir, `${name}${path.extname(spec.path)}`);
    assert.ok(fs.existsSync(file) && fs.statSync(file).size > 16, `missing rule ${name}`);
  }
  // Decode the actual snapshots here; no separate sampling API or business-domain list.
  const providers = config['rule-providers'];
  function readDomainSnapshot(name) {
    const spec = providers[name];
    const input = path.resolve(rulesDir, name + path.extname(spec.path));
    assert.ok(spec && ['domain', 'classical'].includes(spec.behavior), `invalid sample provider ${name}`);
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
    } else assert.fail(`unsupported sample provider ${name}: ${spec.format}/${spec.behavior}`);

    const exact = new Set();
    const suffix = new Set();
    for (const rule of rules) {
      if (/^DOMAIN,/i.test(rule)) exact.add(rule.split(',')[1].toLowerCase());
      else if (/^DOMAIN-SUFFIX,/i.test(rule)) suffix.add(rule.split(',')[1].toLowerCase());
      else if (rule.startsWith('+.')) suffix.add(rule.slice(2).toLowerCase());
      else if (!/^(?:PROCESS-NAME|PROCESS-PATH),/i.test(rule) && spec.format === 'mrs') exact.add(rule.toLowerCase());
    }
    assert.ok(exact.size || suffix.size, `${name}: no domain members in snapshot`);
    const members = [...exact].map((domain) => domain).concat([...suffix]);
    return {
      hosts: [...new Set(members)]
        .filter((host) => /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]+$/i.test(host))
        .sort(),
      matches(host) {
        host = host.toLowerCase();
        if (exact.has(host)) return true;
        const labels = host.split('.');
        return labels.some((_, index) => suffix.has(labels.slice(index).join('.')));
      },
    };
  }
  const modules = [];
  for (const name of Object.keys(providers).filter(
    (name) => name.startsWith('domestic_') && !name.endsWith('_noncn') && !name.endsWith('_dns'),
  )) {
    const full = readDomainSnapshot(name);
    const overseasProvider = providers[`${name}_noncn`];
    const overseas = overseasProvider ? readDomainSnapshot(`${name}_noncn`) : null;
    const candidates = full.hosts.filter((host) => !overseas || !overseas.matches(host)).slice(0, 64);
    const excluded = overseas?.hosts.find((host) => full.matches(host)) || null;
    assert.ok(candidates.length, `${name}: no usable vendor snapshot samples`);
    if (overseas) assert.ok(excluded, `${name}: no usable domestic/overseas snapshot samples`);
    modules.push({ source: name.slice('domestic_'.length), candidates, excluded, excludeOverseas: !!overseas });
  }
  assert.ok(modules.length, 'no domestic routing modules found');
  const appleTv = readDomainSnapshot('apple_tv');
  assert.ok(appleTv.hosts.length, 'Apple TV+ provider has no usable snapshot sample');
  const appleTvSample = appleTv.hosts[0];
  const appleProxy = readDomainSnapshot('apple_proxy');
  assert.ok(appleProxy.hosts.length, 'AppleProxy provider has no usable snapshot sample');
  const outside = `routing-probe-${randomBytes(8).toString('hex')}.invalid`;
  const domesticSamples = { modules, outside };
  const local = await fixtures();
  // Offline, isolated smoke test: no TUN, no system routing changes, no external requests.
  const port = await freePort();
  const proxyPort = await freePort();
  config.tun.enable = false;
  // Keep the production policy keys/matchers, but replace upstreams with in-process responses.
  // NXDOMAIN identifies the international content policy; no DNS query leaves this isolated test.
  config.dns.enable = true;
  config.dns.listen = '';
  config.dns['use-hosts'] = false;
  for (const key of ['nameserver', 'direct-nameserver', 'proxy-server-nameserver'])
    config.dns[key] = ['rcode://success'];
  for (const key of Object.keys(config.dns['nameserver-policy']))
    config.dns['nameserver-policy'][key] = [key === '+.icloud-content.com' ? 'rcode://name_error' : 'rcode://success'];
  config.ntp.enable = false;
  config['mixed-port'] = proxyPort;
  config['external-controller'] = `127.0.0.1:${port}`;
  for (const [host] of CASES) config.hosts[host] = '127.0.0.1';
  config.hosts[appleTvSample] = '127.0.0.1';
  for (const host of appleProxy.hosts) config.hosts[host] = '127.0.0.1';
  for (const { candidates, excluded } of domesticSamples.modules)
    for (const host of [...candidates, ...(excluded ? [excluded] : [])]) config.hosts[host] = '127.0.0.1';
  config.hosts[domesticSamples.outside] = '127.0.0.1';
  if (probe?.type === 'domain') config.hosts[probe.value] = '127.0.0.1';
  delete config['external-ui'];
  delete config['external-ui-url'];
  config.profile = { 'store-selected': false, 'store-fake-ip': false };
  const nodes = [
    '香港 1x',
    '日本 1x',
    '美国 1x',
    '新加坡 1x',
    '台湾 1x',
    '🇨🇳 台湾 矛盾 1x',
    '日本 0.5x 家宽',
    '美国 3x',
    '德国 家宽',
  ].map((name) => ({ name, type: 'socks5', server: '127.0.0.1', port: local.socksPort }));
  if (probe)
    config.proxies = config.proxies.map((entry) =>
      entry.type === 'direct'
        ? { name: entry.name, type: 'socks5', server: '127.0.0.1', port: local.socksPort }
        : entry,
    );
  const provider = path.join(temp, 'subscription.yaml');
  fs.writeFileSync(provider, YAML.stringify({ proxies: nodes }));
  const providerOverride = config['proxy-providers'].订阅.override;
  config['proxy-providers'] = {
    订阅: { type: 'file', path: provider, override: providerOverride, 'health-check': { enable: false } },
  };
  for (const [name, spec] of Object.entries(config['rule-providers'])) {
    if (spec.type === 'inline') continue;
    const filename = `${name}${path.extname(spec.path)}`;
    const file = path.resolve(rulesDir, filename);
    assert.ok(fs.existsSync(file) && fs.statSync(file).size > 16, `missing rule ${name}`);
    const localFile = path.join(temp, filename);
    fs.copyFileSync(file, localFile);
    config['rule-providers'][name] = { type: 'file', path: localFile, format: spec.format, behavior: spec.behavior };
  }
  fs.writeFileSync(path.join(temp, 'runtime.yaml'), YAML.stringify(config));
  const child = spawn(binary, ['-d', temp, '-f', path.join(temp, 'runtime.yaml')], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (x) => {
    logs += x;
  });
  child.stderr.on('data', (x) => {
    logs += x;
  });
  const api = async (route) =>
    (await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(2000) })).json();
  async function reloadRules(rules, label) {
    const response = await fetch(`http://127.0.0.1:${port}/configs?force=true`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: YAML.stringify({ ...config, rules }) }),
    });
    assert.equal(response.status, 204, `cannot reload ${label}: ${await response.text()}`);
    for (let attempt = 0; attempt < 50; attempt++) {
      const loaded = (await api('/providers/rules')).providers;
      if (loaded && Object.values(loaded).every((entry) => entry.ruleCount > 0)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail(`${label} providers did not load`);
  }
  try {
    let providers;
    for (let i = 0; i < 50; i++) {
      if (child.exitCode !== null) throw new Error(`Mihomo exited: ${logs}`);
      try {
        providers = (await api('/providers/rules')).providers;
        if (providers && Object.values(providers).every((p) => p.ruleCount > 0)) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(providers, logs);
    for (const [name, p] of Object.entries(providers)) assert.ok(p.ruleCount > 0, `${name} failed to load: ${logs}`);
    if (process.env.MYPROXY_RSS_BENCH === '1') {
      const rss = spawnSync('ps', ['-o', 'rss=', '-p', String(child.pid)], { encoding: 'utf8' });
      assert.equal(rss.status, 0, `cannot read Mihomo RSS: ${rss.stderr}`);
      console.log(`RSS_BENCH_KB ${Number(rss.stdout.trim())}`);
      return;
    }
    const proxies = (await api('/proxies')).proxies;
    for (const name of ['香港', '日本', '美国', '新加坡', '台湾', '低倍率节点', '高倍率节点', '家宽节点'])
      assert.ok(proxies[name].all.length > 0, `${name} empty`);
    assert.ok(proxies['日本'].all.includes('日本 1x'));
    assert.ok(!proxies['日本'].all.includes('美国 1x'));
    const taiwanConflictName = proxies['台湾'].all.find((name) => name.includes('台湾 矛盾 1x'));
    assert.ok(taiwanConflictName, 'Taiwan name with contradictory mainland flag was not classified');
    assert.ok(
      proxies['自动选择ex(大陆&香港)'].all.includes(taiwanConflictName),
      'Taiwan node was excluded by its contradictory flag',
    );
    assert.equal(proxies.AppleProxy.now, '美国');
    assert.equal(proxies['Siri Ai/Apple Intelligence'].now, '美国');
    assert.equal(proxies['Other Apple Service'].now, '直连');
    assert.equal(proxies.Microsoft.now, '直连');
    const routes = await verifyRouting({ port: proxyPort, sinkPort: local.sinkPort, track: local.track, api });
    const appleTvRoute = await verifyRouting({
      port: proxyPort,
      sinkPort: local.sinkPort,
      track: local.track,
      api,
      cases: [[appleTvSample, 'AppleProxy', 'apple_tv']],
    });
    let appleProxyRoute;
    for (const host of appleProxy.hosts) {
      const [route] = await verifyRouting({
        port: proxyPort,
        sinkPort: local.sinkPort,
        track: local.track,
        api,
        cases: [[host, null]],
      });
      if (route.payload === 'apple_proxy' && route.chains.includes('AppleProxy')) {
        appleProxyRoute = [route];
        break;
      }
    }
    assert.ok(appleProxyRoute, 'no AppleProxy snapshot member reached its dynamic provider');
    const downloadsProxied = build({ settings: { options: { Apple下载直连: false } } }).config;
    await reloadRules(downloadsProxied.rules, 'Apple download proxy routing');
    const [downloadRoute] = await verifyRouting({
      port: proxyPort,
      sinkPort: local.sinkPort,
      track: local.track,
      api,
      cases: [['assets.cdn-apple.com', null]],
    });
    assert.equal(downloadRoute.payload, 'apple_proxy', JSON.stringify(downloadRoute));
    assert.ok(downloadRoute.chains.includes('AppleProxy'), JSON.stringify(downloadRoute));
    await reloadRules(config.rules, 'default Apple download routing');
    for (const [group, member] of selections) {
      if (!proxies[group]?.all?.includes(member)) throw new Error(`${group} 不包含 ${member}`);
      const response = await fetch(`http://127.0.0.1:${port}/proxies/${encodeURIComponent(group)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: member }),
      });
      assert.equal(response.status, 204, `无法切换 ${group} 到 ${member}`);
    }
    if (probe) {
      const [result] = await verifyRouting({
        port: proxyPort,
        sinkPort: local.sinkPort,
        track: local.track,
        api,
        cases: [[probe.value, null]],
      });
      const dnsCandidates = [];
      if (probe.type === 'domain') {
        const host = probe.value.toLowerCase();
        for (const [key, resolvers] of Object.entries(productionDnsPolicy)) {
          if (
            key === host ||
            (key.startsWith('+.') && (host === key.slice(2) || host.endsWith(key.slice(1)))) ||
            (key.startsWith('rule-set:') && key.slice(9).split(',').includes(result.payload))
          )
            dnsCandidates.push({ key, resolvers });
        }
      }
      console.log(
        'Routing diagnosis: ' +
          JSON.stringify({
            target: probe,
            rule: result.rule,
            payload: result.payload,
            chains: result.chains,
            dnsPolicyCandidates: dnsCandidates,
            selections,
          }),
      );
    }
    const selected = await fetch(`http://127.0.0.1:${port}/proxies/Other%20Apple%20Service`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '美国' }),
    });
    assert.equal(selected.status, 204, 'cannot select Apple proxy for trial');
    const appleTrial = await verifyRouting({
      port: proxyPort,
      sinkPort: local.sinkPort,
      track: local.track,
      api,
      cases: [
        ['bag.itunes.apple.com', '美国', 'apple'],
        ['fpinit.itunes.apple.com', '美国', 'apple'],
        ['gspe35-ssl.ls.apple.com', '美国', 'apple'],
        ['smp-device-content.apple.com', '美国', 'apple'],
        ['gs-loc-cn.apple.com', '直连', 'apple_cn', 'Other Apple Service'],
      ],
    });
    const dnsPolicies = await verifyICloudContentDnsPolicy(api);
    fs.writeFileSync(path.join(temp, 'routes.json'), JSON.stringify(routes, null, 2));
    fs.writeFileSync(path.join(temp, 'apple-tv.json'), JSON.stringify(appleTvRoute, null, 2));
    fs.writeFileSync(path.join(temp, 'apple-proxy.json'), JSON.stringify(appleProxyRoute, null, 2));
    fs.writeFileSync(path.join(temp, 'apple-trial.json'), JSON.stringify(appleTrial, null, 2));
    fs.writeFileSync(path.join(temp, 'dns-policies.json'), JSON.stringify(dnsPolicies, null, 2));
    fs.writeFileSync(path.join(temp, 'providers.json'), JSON.stringify(providers, null, 2));
    console.log(
      `Offline runtime: ${Object.keys(providers).length} rule providers loaded; region/rate/home filters and Apple defaults verified`,
    );
    console.log(`Loopback routing: ${routes.length} actual CONNECT decisions verified`);
    console.log(`Apple TV+ routing: ${appleTvRoute.length} provider-derived CONNECT decision verified`);
    console.log(`AppleProxy routing: ${appleProxyRoute.length} provider-derived CONNECT decision verified`);
    console.log(`Apple download toggle: AppleProxy fallback verified when direct mode is disabled`);
    console.log(`Apple proxy trial: ${appleTrial.length} actual CONNECT decisions verified`);
    console.log(`Offline DNS: ${dnsPolicies.length} actual A/AAAA policy decisions verified`);
    console.log(`Evidence directory: ${temp}`);
    const domesticEvidence = [];
    const domesticModuleCases = [[domesticSamples.outside, null]];
    // Earlier service rules may take priority or reject a vendor sample. Find a connected
    // witness for each module in the actual snapshot, and require it to survive toggling.
    for (const { source, candidates, excluded, excludeOverseas } of domesticSamples.modules) {
      let witness;
      for (const host of candidates) {
        const [result] = await verifyRouting({
          port: proxyPort,
          sinkPort: local.sinkPort,
          track: local.track,
          api,
          cases: [[host, null]],
          skipMissingConnection: true,
        });
        if (result.skipped) continue;
        const expectedRule = excludeOverseas ? 'AND' : 'RULESET';
        if (result.rule.toUpperCase() === expectedRule && result.payload.includes(`domestic_${source}`)) {
          witness = host;
          break;
        }
      }
      assert.ok(witness, `${source}: no snapshot sample reached the domestic module`);
      domesticModuleCases.push([witness, source]);
      if (excluded) domesticModuleCases.push([excluded, null]);
    }
    const domesticModes = [
      {},
      { 极简分流: true },
      { 国内服务优先直连: false },
      { 极简分流: true, 国内服务优先直连: false },
    ];
    for (const options of domesticModes) {
      // Keep the same local sinks, hosts and file snapshots; reload production routing for each mode.
      const rules = build({ settings: { options } }).config.rules;
      await reloadRules(rules, 'domestic routing');
      const decisions = await verifyRouting({
        port: proxyPort,
        sinkPort: local.sinkPort,
        track: local.track,
        api,
        cases: domesticModuleCases.map(([host]) => [host, null]),
      });
      for (const result of decisions) {
        const source = domesticModuleCases.find(([host]) => host === result.host)[1];
        const enabled = source && options.国内服务优先直连 !== false;
        const matchedModule =
          ['AND', 'RULESET'].includes(result.rule.toUpperCase()) && result.payload.includes('domestic_');
        assert.equal(!!matchedModule, !!enabled, `${result.host}: ${JSON.stringify({ options, result })}`);
        if (enabled) {
          assert.ok(result.payload.includes(`domestic_${source}`), JSON.stringify(result));
          assert.ok(result.chains.includes('直连'), JSON.stringify(result));
        }
        domesticEvidence.push({ options, ...result });
      }
    }
    fs.writeFileSync(path.join(temp, 'domestic-modules.json'), JSON.stringify(domesticEvidence, null, 2));
    console.log(`Domestic vendor routing: ${domesticEvidence.length} actual CONNECT decisions verified`);
  } finally {
    fs.writeFileSync(path.join(temp, 'runtime.log'), logs);
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
    }
    await local.close();
  }
  const sniffing = await verifySniffing({ binary, rulesDir, temp });
  fs.writeFileSync(path.join(temp, 'sniffing.json'), JSON.stringify(sniffing, null, 2));
  console.log(`Offline sniffing: ${sniffing.length} pure-IP HTTP/TLS routing decisions verified`);
  const whitelistDns = await verifyDnsWhitelist({ binary, rulesDir, temp });
  fs.writeFileSync(path.join(temp, 'dns-policy.json'), JSON.stringify(whitelistDns, null, 2));
  console.log('Proxy node bootstrap DNS: mainland resolver verified with a synthetic node');
  console.log(`Offline DNS policy: ${whitelistDns.length - 1} A/AAAA and direct dial decisions verified`);
}
run().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
