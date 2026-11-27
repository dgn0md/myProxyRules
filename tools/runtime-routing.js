'use strict';
// Local HTTP CONNECT probes against real MRS data. All sockets terminate on loopback.
const net = require('node:net');
const dgram = require('node:dgram');
const assert = require('node:assert/strict');
const { once } = require('node:events');
async function freePort() {
  for (let attempt = 0; attempt < 64; attempt++) {
    const udp = dgram.createSocket('udp4');
    udp.bind(0, '127.0.0.1');
    await once(udp, 'listening');
    const port = udp.address().port;
    const server = net.createServer();
    try {
      server.listen(port, '127.0.0.1');
      await once(server, 'listening');
    } catch (error) {
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      await new Promise((resolve) => udp.close(resolve));
      if (error.code === 'EADDRINUSE') continue;
      throw error;
    }
    await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => udp.close(resolve))]);
    return port;
  }
  throw new Error('Unable to allocate a free loopback TCP/UDP port after 64 attempts');
}
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
async function fixtures() {
  const sockets = new Set();
  let datagrams = 0;
  const track = (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    return socket;
  };
  const sink = net.createServer((s) => {
    track(s);
  });
  const sinkPort = await listen(sink);
  const socks = net.createServer((socket) => {
    track(socket);
    let buffer = Buffer.alloc(0),
      stage = 0;
    socket.on('data', function parse(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === 0) {
        if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
        buffer = buffer.subarray(2 + buffer[1]);
        socket.write(Buffer.from([5, 0]));
        stage = 1;
      }
      if (stage === 1) {
        if (buffer.length < 5) return;
        const end = buffer[3] === 1 ? 10 : buffer[3] === 4 ? 22 : 7 + buffer[4];
        if (buffer.length < end) return;
        if (buffer[1] === 3) {
          const udp = dgram.createSocket('udp4');
          udp.on('message', () => {
            datagrams++;
          });
          socket.once('close', () => {
            udp.close();
          });
          udp.bind(0, '127.0.0.1', () => {
            const port = udp.address().port;
            socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, port >> 8, port & 255]));
          });
          stage = 2;
          socket.removeListener('data', parse);
          return;
        }
        // Deliberately ignore requested destination: no external packets can leave this fixture.
        const rest = buffer.subarray(end);
        buffer = Buffer.alloc(0);
        stage = 2;
        socket.removeListener('data', parse);
        const target = track(
          net.connect(sinkPort, '127.0.0.1', () => {
            socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            if (rest.length) target.write(rest);
            socket.pipe(target);
            target.pipe(socket);
          }),
        );
      }
    });
  });
  const socksPort = await listen(socks);
  return {
    sinkPort,
    socksPort,
    track,
    udpDatagrams: () => datagrams,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await Promise.all([new Promise((r) => sink.close(r)), new Promise((r) => socks.close(r))]);
    },
  };
}
const APPLE_AI_GROUP = 'Siri Ai/Apple Intelligence';
const APPLE_PROXY_GROUP = 'AppleProxy';
const OTHER_APPLE_GROUP = 'Other Apple Service';
// 仅保留精确例外、AND NOT 排除与跨规则集优先级边界用例；普通规则集成员由 native-check.js 动态抽样覆盖。
const CASES = [
  // Apple AI / Siri 精确例外（不依赖外部规则集）
  ['apple-relay.apple.com', APPLE_AI_GROUP],
  ['apple-relay.cloudflare.com', APPLE_AI_GROUP],
  ['cp4.cloudflare.com', APPLE_AI_GROUP],
  ['guzzoni.apple.com', APPLE_AI_GROUP],
  ['guzzoni-apple-com.v.aaplimg.com', APPLE_AI_GROUP],
  ['api-siri-prod.apple.com', APPLE_AI_GROUP],
  ['api.smoot.apple.com', APPLE_AI_GROUP],
  ['gspe1-ssl.ls.apple.com', APPLE_AI_GROUP],
  ['gspe35-ssl.ls.apple.com', APPLE_AI_GROUP],
  // icloud-content.com 后缀及伪后缀边界（同时供 verifyICloudContentDnsPolicy 复用）
  ['icloud-content.com', APPLE_AI_GROUP],
  ['edge-013.hkhkg2.icloud-content.com', APPLE_AI_GROUP],
  ['edge-013.hkhkg2.icloud-content.com.example.test', '直连'],
  // Apple 共享 iCloud 精确主机与子域边界
  ['gateway.icloud.com', OTHER_APPLE_GROUP],
  ['attester.gateway.icloud.com', '直连'],
  ['setup.icloud.com', OTHER_APPLE_GROUP],
  // AppleProxy 精确例外（未收录于 apple_proxy.yaml）
  ['default.fe2.apple-dns.com', APPLE_PROXY_GROUP],
  ['news-client-search.apple.com', APPLE_PROXY_GROUP],
  ['fitness.apple.com', APPLE_PROXY_GROUP],
  ['sports.apple.com', APPLE_PROXY_GROUP],
  ['books.apple.com', APPLE_PROXY_GROUP],
  // Apple 下载直连精确例外 vs 普通 apple 规则集边界
  ['assets.cdn-apple.com', '直连'],
  ['swcdn.apple.com', OTHER_APPLE_GROUP, 'apple'],
  ['music.apple.com', OTHER_APPLE_GROUP, 'apple'],
  // AND NOT 排除边界（Microsoft / 海外游戏国内下载）
  ['www.microsoft.com', 'Microsoft'],
  ['res.cdn.office.net', '直连'],
  ['store.steampowered.com', '海外游戏'],
  ['dl.steam.clngaa.com', '直连', 'game_platforms_download_cn'],
  // category-stun 与 Google / 国内厂商的跨规则集优先级边界
  ['stun.l.google.com', 'Google'],
  ['stun.qq.com', '直连'],
  ['stun.stunprotocol.org', '默认代理'],
];
async function verifyRouting({ port, sinkPort, track, api, cases = CASES, skipMissingConnection = false }) {
  const evidence = [];
  for (const [host, expected, payload, excluded] of cases) {
    const socket = track(net.connect(port, '127.0.0.1'));
    await once(socket, 'connect');
    socket.write(`CONNECT ${host}:${sinkPort} HTTP/1.1\r\nHost: ${host}:${sinkPort}\r\n\r\n`);
    let connectTimer;
    let response;
    try {
      response = await Promise.race([
        once(socket, 'data'),
        new Promise((_, reject) => {
          connectTimer = setTimeout(() => reject(new Error(`CONNECT timeout: ${host}`)), 3000);
        }),
      ]);
    } finally {
      clearTimeout(connectTimer);
    }
    assert.match(response[0].toString(), /200/);
    socket.write('myproxy-routing-probe');
    let connection;
    let active;
    for (let attempt = 0; attempt < 20; attempt++) {
      active = (await api('/connections')).connections || [];
      connection = active.find((c) => String(c.metadata.sourcePort) === String(socket.localPort));
      if (connection) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!connection && skipMissingConnection) {
      socket.destroy();
      evidence.push({ host, skipped: 'no-active-connection' });
      continue;
    }
    assert.ok(connection, `No active connection for ${host}: ${JSON.stringify(active)}`);
    if (expected)
      assert.ok(
        connection.chains.includes(expected),
        `${host}: expected ${expected}; actual ${JSON.stringify(connection)}`,
      );
    if (payload) assert.equal(connection.rulePayload, payload, `${host}: wrong matched rule`);
    if (excluded) assert.ok(!connection.chains.includes(excluded), `${host}: unexpected ${excluded}`);
    evidence.push({
      host,
      expected,
      rule: connection.rule,
      payload: connection.rulePayload,
      chains: connection.chains,
    });
    socket.destroy();
  }
  return evidence;
}
async function verifyICloudContentDnsPolicy(api) {
  // native-check substitutes local RCODE clients: NXDOMAIN marks the content policy, NOERROR the rest.
  const evidence = [];
  const cases = CASES.filter(([host]) => /(^|\.)icloud-content\.com$/.test(host)).map(([host, expected]) => [
    host,
    expected === APPLE_AI_GROUP ? 3 : 0,
  ]);
  cases.push(['edge-013.hkhkg2.icloud-content.com.example.test', 0]);
  for (const [host, status] of cases) {
    for (const type of ['A', 'AAAA']) {
      const response = await api(`/dns/query?name=${encodeURIComponent(host)}&type=${type}`);
      assert.equal(response.Status, status, `${host} ${type}: wrong DNS policy: ${JSON.stringify(response)}`);
      evidence.push({ host, type, status: response.Status });
    }
  }
  return evidence;
}
module.exports = { fixtures, verifyRouting, verifyICloudContentDnsPolicy, CASES, freePort };
