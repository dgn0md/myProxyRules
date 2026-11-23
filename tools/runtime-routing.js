'use strict';
// Local HTTP CONNECT probes against real MRS data. All sockets terminate on loopback.
const net = require('node:net');
const dgram = require('node:dgram');
const assert = require('node:assert/strict');
const { once } = require('node:events');
async function freePort() {
  for (;;) {
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
}
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
async function fixtures() {
  const sockets = new Set();
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
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await Promise.all([new Promise((r) => sink.close(r)), new Promise((r) => socks.close(r))]);
    },
  };
}
const APPLE_AI_GROUP = 'Siri Ai/Apple Intelligence';
const APPLE_PROXY_GROUP = 'AppleProxy';
const OTHER_APPLE_GROUP = 'Other Apple Service';
const CASES = [
  ['apple-relay.apple.com', APPLE_AI_GROUP],
  ['apple-relay.cloudflare.com', APPLE_AI_GROUP],
  ['cp4.cloudflare.com', APPLE_AI_GROUP],
  ['gateway.icloud.com', OTHER_APPLE_GROUP],
  ['edge-013.hkhkg2.icloud-content.com', APPLE_AI_GROUP],
  ['attester.gateway.icloud.com', '直连'],
  ['edge-014.hkhkg2.icloud-content.com', APPLE_AI_GROUP],
  ['edge-013.ussjc2.icloud-content.com', APPLE_AI_GROUP],
  ['edge-9999.region-new9.icloud-content.com', APPLE_AI_GROUP],
  ['content.hkhkg2.icloud-content.com', APPLE_AI_GROUP],
  ['edge-abc.hkhkg2.icloud-content.com', APPLE_AI_GROUP],
  ['edge-013.icloud-content.com', APPLE_AI_GROUP],
  ['x.edge-013.hkhkg2.icloud-content.com', APPLE_AI_GROUP],
  ['edge-051.xactu3.icloud-content.com.cn', '直连'],
  ['gateway.icloud.com.cn', '直连'],
  ['ussjc1.icloud-content.com', APPLE_AI_GROUP],
  ['hkhkg2.icloud-content.com', APPLE_AI_GROUP],
  ['sgsin8.icloud-content.com', APPLE_AI_GROUP],
  ['gbslo5.icloud-content.com', APPLE_AI_GROUP],
  ['ussjc1.icloud-content.com.cn', '直连'],
  ['xactu3.icloud-content.com.cn', '直连'],
  ['x.ussjc1.icloud-content.com', APPLE_AI_GROUP],
  ['content1.icloud-content.com', APPLE_AI_GROUP],
  ['icloud-content.com', APPLE_AI_GROUP],
  ['cvws.icloud-content.com', APPLE_AI_GROUP],
  ['gateway-asset.icloud-content.com', APPLE_AI_GROUP],
  ['icloud-content.com.cn', '直连'],
  ['edge-013.hkhkg2.icloud-content.com.example.test', '直连'],
  ['guzzoni.apple.com', APPLE_AI_GROUP],
  ['api-siri-prod.apple.com', APPLE_AI_GROUP],
  ['setup.icloud.com', OTHER_APPLE_GROUP],
  ['setup.icloud.com.cn', '直连'],
  ['api.smoot.apple.com', APPLE_AI_GROUP],
  ['bag.itunes.apple.com', OTHER_APPLE_GROUP, 'apple'],
  ['fpinit.itunes.apple.com', OTHER_APPLE_GROUP, 'apple'],
  ['gspe35-ssl.ls.apple.com', OTHER_APPLE_GROUP, 'apple'],
  ['smp-device-content.apple.com', OTHER_APPLE_GROUP, 'apple'],
  ['gs-loc-cn.apple.com', '直连', 'apple_cn'],
  ['news-client-search.apple.com', APPLE_PROXY_GROUP],
  ['news-assets.apple.com', APPLE_PROXY_GROUP],
  ['apple.news', APPLE_PROXY_GROUP],
  ['default.fe2.apple-dns.net', APPLE_PROXY_GROUP],
  ['default.fe2.apple-dns.com', APPLE_PROXY_GROUP],
  ['gspe1-ssl.ls.apple.com', APPLE_AI_GROUP],
  ['fitness.apple.com', APPLE_PROXY_GROUP],
  ['sports.apple.com', APPLE_PROXY_GROUP],
  ['books.apple.com', APPLE_PROXY_GROUP],
  ['assets.cdn-apple.com', '直连'],
  ['mesu.apple.com', '直连'],
  ['swcdn.apple.com', OTHER_APPLE_GROUP, 'apple'],
  ['apps.apple.com', APPLE_PROXY_GROUP],
  ['music.apple.com', OTHER_APPLE_GROUP, 'apple'],
  ['www.microsoft.com', '直连'],
  ['youtube.com', 'YouTube'],
  ['github.com', 'GitHub'],
  ['store.steampowered.com', 'Steam'],
  ['qq.com', '直连'],
  ['www.baidu.com', '直连'],
];
async function verifyRouting({ port, sinkPort, track, api, cases = CASES, skipMissingConnection = false }) {
  const evidence = [];
  for (const [host, expected, payload, excluded] of cases) {
    const socket = track(net.connect(port, '127.0.0.1'));
    await once(socket, 'connect');
    socket.write(`CONNECT ${host}:${sinkPort} HTTP/1.1\r\nHost: ${host}:${sinkPort}\r\n\r\n`);
    const response = await Promise.race([
      once(socket, 'data'),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`CONNECT timeout: ${host}`)), 3000)),
    ]);
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
  const cases = CASES.filter(([host]) => /(^|\.)icloud-content\.com(?:\.cn)?$/.test(host)).map(([host, expected]) => [
    host,
    expected === APPLE_AI_GROUP ? 3 : 0,
  ]);
  cases.push(['edge-013.hkhkg2.icloud-content.com.example.test', 0]);
  cases.push(['gateway.icloud.com.cn', 0]);
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
