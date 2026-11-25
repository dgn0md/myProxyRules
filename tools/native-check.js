'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { execFile, spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { promisify } = require('node:util');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const { build, load } = require('./build');
const { fixtures, verifyRouting, verifyICloudContentDnsPolicy, CASES, freePort } = require('./runtime-routing');
const { verifySniffing } = require('./native-sniffing');
const { verifyHealth } = require('./native-health');
const { cacheBench } = require('./native-cache-bench');
const { verifyDnsWhitelist } = require('./native-dns-whitelist');
const { createSnapshotReader } = require('./native-snapshot');
const execFileAsync = promisify(execFile);

async function terminateChild(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  let timer;
  try {
    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(true), 2000);
      }),
    ]);
    if (timedOut && child.exitCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
  } finally {
    clearTimeout(timer);
  }
}
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
  const keepEvidence = process.env.MYPROXY_KEEP_EVIDENCE === '1';
  let succeeded = false;
  if (keepEvidence) console.log(`Evidence directory: ${temp}`);
  try {
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
    const concurrency = Math.min(os.availableParallelism ? os.availableParallelism() : 4, 6);
    let nextCase = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, cases.length) }, async (_, workerIndex) => {
        const workerDir = path.join(temp, `syntax-${workerIndex}`);
        fs.mkdirSync(workerDir, { recursive: true });
        const file = path.join(workerDir, 'config.yaml');
        while (nextCase < cases.length) {
          const entry = cases[nextCase++];
          const { config } = build({ settings: entry.settings, subscription: entry.subscription });
          fs.writeFileSync(file, YAML.stringify(config));
          try {
            await execFileAsync(binary, ['-t', '-d', workerDir, '-f', file], { encoding: 'utf8', timeout: 20000 });
          } catch (error) {
            assert.fail(`${entry.name}: ${error.stdout || ''}\n${error.stderr || error.message}`);
          }
        }
      }),
    );
    console.log(`Mihomo syntax checks: ${cases.length} cases passed`);
    if (!rulesDir) {
      succeeded = true;
      return;
    }
    const config = build().config;
    const productionDnsPolicy = structuredClone(config.dns['nameserver-policy']);
    for (const [name, spec] of Object.entries(config['rule-providers'])) {
      if (spec.type === 'inline') continue;
      const file = path.resolve(rulesDir, `${name}${path.extname(spec.path)}`);
      assert.ok(fs.existsSync(file) && fs.statSync(file).size > 16, `missing rule ${name}`);
    }
    // Decode the actual snapshots here; no separate sampling API or business-domain list.
    const providers = config['rule-providers'];
    const snapshotReader = createSnapshotReader({ binary, rulesDir, temp, providers });
    const modules = [];
    for (const name of Object.keys(providers).filter(
      (name) => name.startsWith('domestic_') && !name.endsWith('_noncn') && !name.endsWith('_dns'),
    )) {
      const full = snapshotReader.read(name);
      const overseasProvider = providers[`${name}_noncn`];
      const overseas = overseasProvider ? snapshotReader.read(`${name}_noncn`) : null;
      const candidates = full.hosts.filter((host) => !overseas || !overseas.matches(host)).slice(0, 64);
      const excluded = overseas?.hosts.find((host) => full.matches(host)) || null;
      assert.ok(candidates.length, `${name}: no usable vendor snapshot samples`);
      if (overseas) assert.ok(excluded, `${name}: no usable domestic/overseas snapshot samples`);
      modules.push({ source: name.slice('domestic_'.length), candidates, excluded, excludeOverseas: !!overseas });
    }
    assert.ok(modules.length, 'no domestic routing modules found');
    const appleTv = snapshotReader.read('apple_tv');
    assert.ok(appleTv.hosts.length, 'Apple TV+ provider has no usable snapshot sample');
    const appleTvSample = appleTv.hosts[0];
    const appleProxy = snapshotReader.read('apple_proxy');
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
      config.dns['nameserver-policy'][key] = [
        key === '+.icloud-content.com' ? 'rcode://name_error' : 'rcode://success',
      ];
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
    const copiedRulesDir = path.join(temp, 'rules-copy');
    fs.mkdirSync(copiedRulesDir, { recursive: true });
    for (const [name, spec] of Object.entries(config['rule-providers'])) {
      if (spec.type === 'inline') continue;
      const filename = `${name}${path.extname(spec.path)}`;
      const file = path.resolve(rulesDir, filename);
      assert.ok(fs.existsSync(file) && fs.statSync(file).size > 16, `missing rule ${name}`);
      const localFile = path.join(copiedRulesDir, filename);
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
    const expectedProviders = Object.keys(config['rule-providers']).length;
    async function reloadRules(rules, label) {
      const response = await fetch(`http://127.0.0.1:${port}/configs?force=true`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: YAML.stringify({ ...config, rules }) }),
      });
      assert.equal(response.status, 204, `cannot reload ${label}: ${await response.text()}`);
      for (let attempt = 0; attempt < 50; attempt++) {
        const loaded = (await api('/providers/rules')).providers;
        const entries = Object.values(loaded || {});
        if (entries.length >= expectedProviders && entries.every((entry) => entry.ruleCount > 0)) return;
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
          const entries = Object.values(providers || {});
          if (entries.length >= expectedProviders && entries.every((p) => p.ruleCount > 0)) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(providers, logs);
      for (const [name, p] of Object.entries(providers)) assert.ok(p.ruleCount > 0, `${name} failed to load: ${logs}`);
      if (process.env.MYPROXY_RSS_BENCH === '1') {
        const rss = spawnSync('ps', ['-o', 'rss=', '-p', String(child.pid)], { encoding: 'utf8' });
        assert.equal(rss.status, 0, `cannot read Mihomo RSS: ${rss.stderr}`);
        console.log(`RSS_BENCH_KB ${Number(rss.stdout.trim())}`);
        succeeded = true;
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
      await terminateChild(child);
      await local.close();
    }
    const sniffing = await verifySniffing({ binary, rulesDir: copiedRulesDir, temp });
    fs.writeFileSync(path.join(temp, 'sniffing.json'), JSON.stringify(sniffing, null, 2));
    console.log(`Offline sniffing: ${sniffing.length} pure-IP HTTP/TLS/QUIC routing decisions verified`);
    const health = await verifyHealth({ binary, temp });
    fs.writeFileSync(path.join(temp, 'health.json'), JSON.stringify(health, null, 2));
    console.log(`Offline health check: ${health.length} response and timeout cases verified`);
    if (process.env.MYPROXY_CACHE_BENCH === '1') {
      const cache = await cacheBench({ binary, temp });
      fs.writeFileSync(path.join(temp, 'cache-benchmark.json'), JSON.stringify(cache, null, 2));
      console.log(`Synthetic cache comparison: ${JSON.stringify(cache)}`);
    }
    const whitelistDns = await verifyDnsWhitelist({
      binary,
      rulesDir: copiedRulesDir,
      temp,
      snapshotReader,
    });
    fs.writeFileSync(path.join(temp, 'dns-policy.json'), JSON.stringify(whitelistDns, null, 2));
    console.log('Proxy node bootstrap DNS: mainland resolver verified with a synthetic node');
    console.log(`Offline DNS policy: ${whitelistDns.length - 1} A/AAAA and direct dial decisions verified`);
    succeeded = true;
  } finally {
    if (succeeded && !keepEvidence) {
      fs.rmSync(temp, { recursive: true, force: true });
    } else {
      console.log(`Evidence directory retained: ${temp}`);
    }
  }
}
run().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
