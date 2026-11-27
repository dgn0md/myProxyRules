'use strict';
// Production DNS matchers with local instrumented upstreams; no public DNS traffic.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const dgram = require('node:dgram');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const YAML = require('yaml');
const { build } = require('./build');
const { fixtures, freePort } = require('./runtime-routing');
const { createSnapshotReader, matchesDomain } = require('./native-snapshot');

function hasLiteralDnsPolicy(config, host) {
  return Object.keys(config.dns['nameserver-policy']).some((key) => {
    if (key.startsWith('rule-set:')) return false;
    if (key.startsWith('+.')) {
      const suffix = key.slice(2).toLowerCase();
      return host === suffix || host.endsWith(`.${suffix}`);
    }
    return key.toLowerCase() === host;
  });
}

function readDomesticDnsSamples(snapshotReader, config) {
  const providers = config['rule-providers'];
  const modules = Object.keys(providers)
    .filter((name) => name.startsWith('domestic_') && name.endsWith('_dns'))
    .map((policyProvider) => {
      const sourceProvider = policyProvider.slice(0, -'_dns'.length);
      const full = snapshotReader.read(sourceProvider);
      const overseas = snapshotReader.read(`${sourceProvider}_noncn`);
      const included = full.candidates.find((host) => !overseas.matches(host));
      const excludedCandidates = [...new Set([...full.candidates, ...overseas.candidates])].filter(
        (host) => full.matches(host) && overseas.matches(host),
      );
      assert.ok(included, `${sourceProvider}: no member outside its overseas subset`);
      assert.ok(excludedCandidates.length, `${sourceProvider}: no overlap with its overseas subset`);
      return {
        sourceProvider,
        policyProvider,
        included,
        excludedCandidates,
        matches: (host) => full.matches(host) && !overseas.matches(host),
      };
    });
  assert.ok(modules.length, 'no domestic vendor DNS policies found');
  return {
    modules,
    matches: (host) => modules.some((module) => module.matches(host)),
  };
}

async function dnsStub() {
  const queries = [];
  const server = dgram.createSocket('udp4');
  server.on('message', (query, peer) => {
    let offset = 12;
    const labels = [];
    while (query[offset]) {
      const size = query[offset++];
      labels.push(query.toString('ascii', offset, offset + size));
      offset += size;
    }
    const type = query.readUInt16BE(++offset);
    offset += 4;
    queries.push({ host: labels.join('.').toLowerCase(), type });
    const data =
      type === 1
        ? Buffer.from([127, 0, 0, 1])
        : type === 28
          ? Buffer.from('00000000000000000000000000000001', 'hex')
          : null;
    const header = Buffer.alloc(12);
    query.copy(header, 0, 0, 2);
    header.writeUInt16BE(0x8180, 2);
    header.writeUInt16BE(1, 4);
    header.writeUInt16BE(data ? 1 : 0, 6);
    const parts = [header, query.subarray(12, offset)];
    if (data) {
      const answer = Buffer.alloc(12);
      answer.writeUInt16BE(0xc00c, 0);
      answer.writeUInt16BE(type, 2);
      answer.writeUInt16BE(1, 4);
      answer.writeUInt32BE(60, 6);
      answer.writeUInt16BE(data.length, 10);
      parts.push(answer, data);
    }
    server.send(Buffer.concat(parts), peer.port, peer.address);
  });
  server.bind(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    queries,
    url: `udp://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function verifyProxyNodeBootstrapDns({ binary, temp, domestic, foreign, local }) {
  const nodeHost = 'proxy-node.dns-whitelist-probe.test';
  const nodeName = 'Synthetic DNS Node';
  const groupName = 'DNS Bootstrap Probe';
  const generatedDns = build().config.dns;
  const localResolvers = generatedDns['proxy-server-nameserver'].map((server) =>
    /^https:\/\/(?:dns\.alidns\.com|doh\.pub)\/dns-query(?:#|$)/i.test(server) ? domestic.url : foreign.url,
  );
  const mixedPort = await freePort();
  const controllerPort = await freePort();
  const config = {
    'mixed-port': mixedPort,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'error',
    'external-controller': `127.0.0.1:${controllerPort}`,
    dns: {
      enable: true,
      ipv6: false,
      'use-hosts': false,
      'use-system-hosts': false,
      'enhanced-mode': 'redir-host',
      'default-nameserver': [domestic.url],
      'proxy-server-nameserver': localResolvers,
      'proxy-server-nameserver-policy': {},
      nameserver: [foreign.url],
      'nameserver-policy': {},
    },
    proxies: [{ name: nodeName, type: 'socks5', server: nodeHost, port: local.socksPort }],
    'proxy-groups': [{ name: groupName, type: 'select', proxies: [nodeName] }],
    rules: [`MATCH,${groupName}`],
    tun: { enable: false },
    ntp: { enable: false },
    profile: { 'store-selected': false, 'store-fake-ip': false },
  };
  const filename = path.join(temp, 'proxy-node-bootstrap-dns.yaml');
  fs.writeFileSync(filename, YAML.stringify(config));
  domestic.queries.length = foreign.queries.length = 0;
  const child = spawn(binary, ['-d', temp, '-f', filename], { stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (bytes) => {
    logs += bytes;
  });
  child.stderr.on('data', (bytes) => {
    logs += bytes;
  });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      assert.equal(child.exitCode, null, logs);
      try {
        const response = await fetch(`http://127.0.0.1:${controllerPort}/version`, {
          signal: AbortSignal.timeout(500),
        });
        ready = response.ok;
        if (ready) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `proxy-node DNS probe did not start: ${logs}`);
    const groupUrl = `http://127.0.0.1:${controllerPort}/proxies/${encodeURIComponent(groupName)}`;
    const groupState = await (await fetch(groupUrl)).json();
    if (groupState.now !== nodeName)
      await fetch(groupUrl, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: nodeName }),
      });
    const socket = local.track(net.connect(mixedPort, '127.0.0.1'));
    try {
      await once(socket, 'connect');
      const responsePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('proxy-node DNS probe timed out')), 5000);
        socket.once('data', (response) => {
          clearTimeout(timeout);
          resolve(response);
        });
        socket.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      socket.write('CONNECT 192.0.2.1:443 HTTP/1.1\r\nHost: 192.0.2.1:443\r\n\r\n');
      const response = await responsePromise;
      assert.match(response.toString(), /200 Connection established/i, logs);
      const { connections } = await (await fetch(`http://127.0.0.1:${controllerPort}/connections`)).json();
      const connection = (connections || []).find(
        (entry) => String(entry.metadata.sourcePort) === String(socket.localPort),
      );
      const chains = connection?.chains || [];
      assert.ok(
        domestic.queries.some((query) => query.host === nodeHost),
        `proxy node hostname did not use mainland DNS; domestic=${domestic.queries.length}, foreign=${foreign.queries.length}, chain=${chains.join(',')}`,
      );
      assert.ok(
        !foreign.queries.some((query) => query.host === nodeHost),
        `proxy node hostname leaked to foreign DNS; domestic=${domestic.queries.length}, foreign=${foreign.queries.length}, chain=${chains.join(',')}`,
      );
    } finally {
      socket.destroy();
    }
    return { mode: 'proxy-node-bootstrap', host: nodeHost, type: 'proxy-server-resolution', upstream: 'domestic' };
  } finally {
    fs.writeFileSync(path.join(temp, 'proxy-node-bootstrap-dns.log'), logs);
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
}

async function verifyDnsWhitelist({ binary, rulesDir, temp, snapshotReader }) {
  const domestic = await dnsStub();
  const foreign = await dnsStub();
  const local = await fixtures();
  const defaultConfig = build().config;
  const configProviders = defaultConfig['rule-providers'];
  const reader = snapshotReader || createSnapshotReader({ binary, rulesDir, temp, providers: configProviders });
  const geolocationCn = reader.read('geolocation-cn');
  const gameDownloadCn = reader.read('game_platforms_download_cn');
  const domesticDnsSamples = readDomesticDnsSamples(reader, defaultConfig);
  const copiedRulesDir = path.join(temp, 'dns-rules');
  fs.mkdirSync(copiedRulesDir, { recursive: true });
  const copiedRuleFiles = new Map();
  const getCopiedRuleFile = (key, spec) => {
    const filename = key + path.extname(spec.path);
    if (!copiedRuleFiles.has(filename)) {
      const dest = path.join(copiedRulesDir, filename);
      fs.copyFileSync(path.resolve(rulesDir, filename), dest);
      copiedRuleFiles.set(filename, dest);
    }
    return copiedRuleFiles.get(filename);
  };
  const evidence = [];
  const node = { name: '美国 DNS 测试', type: 'socks5', server: '127.0.0.1', port: local.socksPort };
  const modes = [
    { name: 'provider', options: {} },
    { name: 'expanded', options: {}, expanded: true },
    { name: 'minimal', options: { 极简分流: true } },
    { name: 'overseas-games-off', options: { 海外游戏: false } },
    { name: 'domestic-route-off', options: { 国内服务优先直连: false } },
    {
      name: 'domestic-vendor-alibaba-policy',
      options: {},
      domesticPolicyProvider: 'domestic_alibaba_dns',
    },
  ];
  try {
    evidence.push(await verifyProxyNodeBootstrapDns({ binary, temp, domestic, foreign, local }));
    for (const { name, options, expanded, domesticPolicyProvider } of modes) {
      const config = build({
        settings: { options },
        ...(expanded ? { subscription: { proxies: [node] } } : {}),
      }).config;
      const port = await freePort();
      const proxyPort = await freePort();
      config.tun.enable = false;
      config.ntp.enable = false;
      config.dns.listen = '';
      config.dns['use-hosts'] = false;
      config.dns['use-system-hosts'] = false;
      // The omission of direct-nameserver is intentional: test actual direct dial resolution too.
      assert.equal(config.dns['direct-nameserver'], undefined);
      if (domesticPolicyProvider) {
        config.dns['nameserver-policy'] = {
          [`rule-set:${domesticPolicyProvider}`]: [
            'https://dns.alidns.com/dns-query#DIRECT',
            'https://doh.pub/dns-query#DIRECT',
          ],
        };
      }
      const instrument = (value) => {
        if (typeof value === 'string' && value.startsWith('rcode://')) return value;
        return value.map((server) => {
          const isDomesticResolver =
            /^https:\/\/(?:dns\.alidns\.com|doh\.pub)\/dns-query(?:#|$)/i.test(server) ||
            /^https:\/\/(?:223\.5\.5\.5|1\.12\.12\.12)\/dns-query#DIRECT&name-cert-verify=(?:dns\.alidns\.com|doh\.pub)$/i.test(
              server,
            );
          return isDomesticResolver ? domestic.url : foreign.url;
        });
      };
      for (const key of ['nameserver', 'default-nameserver', 'proxy-server-nameserver'])
        config.dns[key] = instrument(config.dns[key]);
      for (const key of Object.keys(config.dns['nameserver-policy']))
        config.dns['nameserver-policy'][key] = instrument(config.dns['nameserver-policy'][key]);
      config['mixed-port'] = proxyPort;
      config['external-controller'] = `127.0.0.1:${port}`;
      config.profile = { 'store-selected': false, 'store-fake-ip': false };
      config.proxies = config.proxies.map((proxy) =>
        ['direct', 'dns'].includes(proxy.type)
          ? proxy
          : { name: proxy.name, type: 'socks5', server: '127.0.0.1', port: local.socksPort },
      );
      if (!expanded) {
        const file = path.join(temp, `dns-${name}-nodes.yaml`);
        fs.writeFileSync(file, YAML.stringify({ proxies: [node] }));
        config['proxy-providers'] = { 订阅: { type: 'file', path: file, 'health-check': { enable: false } } };
      }
      for (const [key, spec] of Object.entries(config['rule-providers'])) {
        if (spec.type === 'inline') continue;
        config['rule-providers'][key] = {
          type: 'file',
          behavior: spec.behavior,
          format: spec.format,
          path: getCopiedRuleFile(key, spec),
        };
      }
      // Synthetic direct rules verify mainland DNS selection and the direct dial path.
      const directDns = config.dns['nameserver-policy']['mesu.apple.com'] || [domestic.url, domestic.url];
      assert.deepEqual(directDns, [domestic.url, domestic.url]);
      const directHosts = ['unknown-direct.dns-whitelist-probe.net', 'cdn-direct.hdslb.com'];
      config.rules.unshift(...directHosts.map((host) => `DOMAIN,${host},直连`));
      for (const host of directHosts) config.dns['nameserver-policy'][host] = directDns;
      const filename = path.join(temp, `dns-${name}.yaml`);
      fs.writeFileSync(filename, YAML.stringify(config));
      const child = spawn(binary, ['-d', temp, '-f', filename], { stdio: ['ignore', 'pipe', 'pipe'] });
      let logs = '';
      child.stdout.on('data', (bytes) => {
        logs += bytes;
      });
      child.stderr.on('data', (bytes) => {
        logs += bytes;
      });
      const api = async (route) =>
        (await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(3000) })).json();
      try {
        const expectedProviders = Object.keys(config['rule-providers']).length;
        let ready = false;
        for (let i = 0; i < 50; i++) {
          assert.equal(child.exitCode, null, logs);
          try {
            const { providers } = await api('/providers/rules');
            const entries = Object.values(providers || {});
            ready = entries.length >= expectedProviders && entries.every((provider) => provider.ruleCount > 0);
            if (ready) break;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(ready, logs);
        if (!domesticPolicyProvider) {
          let geolocationCnSample;
          for (const host of geolocationCn.candidates.slice(0, 256)) {
            domestic.queries.length = foreign.queries.length = 0;
            const response = await api(`/dns/query?name=${host}&type=A`);
            assert.equal(response.Status, 0, `${name}: ${host} A: ${JSON.stringify(response)}`);
            if (
              domestic.queries.some((query) => query.host === host) &&
              !foreign.queries.some((query) => query.host === host)
            ) {
              geolocationCnSample = host;
              break;
            }
          }
          assert.ok(geolocationCnSample, `${name}: no geolocation-cn member used domestic DNS`);
          evidence.push({ mode: name, host: geolocationCnSample, type: 'A-snapshot-sample', upstream: 'domestic' });
        }
        const vendorCases = [];
        if (domesticPolicyProvider) {
          const module = domesticDnsSamples.modules.find((entry) => entry.policyProvider === domesticPolicyProvider);
          assert.ok(module, `${domesticPolicyProvider}: missing DNS match samples`);
          vendorCases.push([module.included, true], [module.excludedCandidates[0], false]);
        }
        const cases = domesticPolicyProvider
          ? vendorCases
          : [
              ['i0.hdslb.com', true],
              ['qhimgs7.com', true],
              ['res.cdn.office.net', true],
              [
                'dl.steam.clngaa.com',
                (!options.极简分流 &&
                  options.海外游戏 !== false &&
                  matchesDomain(gameDownloadCn, 'dl.steam.clngaa.com')) ||
                  matchesDomain(geolocationCn, 'dl.steam.clngaa.com'),
              ],
              [
                'alibaba.cdn.steampipe.steamcontent.com',
                (!options.极简分流 &&
                  options.海外游戏 !== false &&
                  matchesDomain(gameDownloadCn, 'alibaba.cdn.steampipe.steamcontent.com')) ||
                  matchesDomain(geolocationCn, 'alibaba.cdn.steampipe.steamcontent.com'),
              ],
              ['ugc.steamusercontent.com', false],
              ['api.steamserver.net', false],
              ['store.steampowered.com', false],
              ['steamcommunity.com', false],
              ['www.baidu.com', matchesDomain(geolocationCn, 'www.baidu.com')],
              ['www.qq.com', matchesDomain(geolocationCn, 'www.qq.com')],
              ['www.bilibili.com', matchesDomain(geolocationCn, 'www.bilibili.com')],
              ['download.dns-whitelist-probe.net', matchesDomain(geolocationCn, 'download.dns-whitelist-probe.net')],
              ['fsend.cn', options.国内服务优先直连 !== false || matchesDomain(geolocationCn, 'fsend.cn')],
              ['chatgpt.com', false],
              ['guzzoni.apple.com', false],
              ['mesu.apple.com', true],
              ['gs-loc-cn.apple.com', options.国内服务优先直连 !== false],
            ];
        for (const [host, allowed] of cases) {
          const domesticVendorPolicy =
            !domesticPolicyProvider &&
            options.国内服务优先直连 !== false &&
            domesticDnsSamples.matches(host) &&
            !hasLiteralDnsPolicy(config, host);
          const shouldUseDomestic = allowed || domesticVendorPolicy;
          for (const type of ['A', 'AAAA']) {
            domestic.queries.length = foreign.queries.length = 0;
            const response = await api(`/dns/query?name=${host}&type=${type}`);
            assert.equal(response.Status, 0, `${name}: ${host} ${type}: ${JSON.stringify(response)}`);
            const selected = shouldUseDomestic ? domestic : foreign;
            const excluded = shouldUseDomestic ? foreign : domestic;
            assert.ok(
              selected.queries.some((query) => query.host === host),
              `${name}: ${host} ${type}: expected ${shouldUseDomestic ? 'domestic' : 'foreign'} DNS; ${logs}`,
            );
            assert.ok(
              !excluded.queries.some((query) => query.host === host),
              `${name}: ${host} ${type}: query leaked to wrong upstream`,
            );
            evidence.push({ mode: name, host, type, upstream: shouldUseDomestic ? 'domestic' : 'foreign' });
          }
        }
        if (!domesticPolicyProvider)
          for (const [host, allowed] of [
            ['unknown-direct.dns-whitelist-probe.net', true],
            ['cdn-direct.hdslb.com', true],
          ]) {
            const domesticVendorPolicy =
              options.国内服务优先直连 !== false &&
              domesticDnsSamples.matches(host) &&
              !hasLiteralDnsPolicy(config, host);
            const shouldUseDomestic = allowed || domesticVendorPolicy;
            domestic.queries.length = foreign.queries.length = 0;
            const socket = local.track(net.connect(proxyPort, '127.0.0.1'));
            try {
              await once(socket, 'connect');
              socket.write(`CONNECT ${host}:${local.sinkPort} HTTP/1.1\r\nHost: ${host}\r\n\r\n`);
              const [response] = await Promise.race([
                once(socket, 'data'),
                new Promise((_, reject) => {
                  socket.setTimeout(5000, () => reject(new Error(`${name}: direct CONNECT timeout: ${host}`)));
                }),
              ]);
              socket.setTimeout(0);
              assert.match(response.toString(), /200 Connection established/i);
              socket.write(`GET / HTTP/1.1\r\nHost: ${host}\r\n\r\n`);
              for (let i = 0; i < 50; i++) {
                if ([...domestic.queries, ...foreign.queries].some((query) => query.host === host)) break;
                await new Promise((resolve) => setTimeout(resolve, 50));
              }
              let connection;
              for (let i = 0; i < 30; i++) {
                const active = (await api('/connections')).connections || [];
                connection = active.find((entry) => String(entry.metadata.sourcePort) === String(socket.localPort));
                if (connection) break;
                await new Promise((resolve) => setTimeout(resolve, 25));
              }
              assert.ok(connection?.chains.includes('直连'), `${name}: ${host}: missing actual direct connection`);
              const selected = shouldUseDomestic ? domestic : foreign;
              const excluded = shouldUseDomestic ? foreign : domestic;
              assert.ok(
                selected.queries.some((query) => query.host === host),
                `${name}: direct ${host}: wrong DNS`,
              );
              assert.ok(!excluded.queries.some((query) => query.host === host), `${name}: direct ${host}: DNS leak`);
              evidence.push({
                mode: name,
                host,
                type: 'direct-CONNECT',
                upstream: shouldUseDomestic ? 'domestic' : 'foreign',
              });
            } finally {
              socket.destroy();
            }
          }
      } finally {
        fs.writeFileSync(path.join(temp, `dns-${name}.log`), logs);
        if (child.exitCode === null) {
          const exited = once(child, 'exit');
          child.kill('SIGTERM');
          await exited;
        }
      }
    }
  } finally {
    await Promise.all([domestic.close(), foreign.close(), local.close()]);
  }
  return evidence;
}

module.exports = { verifyDnsWhitelist };
