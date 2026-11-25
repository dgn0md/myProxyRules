'use strict';
// Exercise the generated provider health-check policy against a local HTTP proxy.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const YAML = require('yaml');
const { build } = require('./build');
const { freePort } = require('./runtime-routing');

async function verifyHealth({ binary, temp }) {
  let status = 200;
  const requests = [];
  const sockets = new Set();
  const proxy = http.createServer((req, res) => {
    requests.push({ method: req.method, target: req.url, host: req.headers.host });
    if (status === 0) return;
    res.writeHead(status, status === 302 ? { location: '/redirected' } : {});
    res.end();
  });
  proxy.on('connect', (req, socket) => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    let buffer = '';
    socket.on('data', (data) => {
      buffer += data.toString('latin1');
      let end;
      while ((end = buffer.indexOf('\r\n\r\n')) !== -1) {
        const request = buffer.slice(0, end + 4);
        buffer = buffer.slice(end + 4);
        requests.push({ tunnel: req.url, request });
        if (status === 0) continue;
        const location = status === 302 ? 'Location: /redirected\r\n' : '';
        socket.write(`HTTP/1.1 ${status} Test\r\n${location}Content-Length: 0\r\nConnection: keep-alive\r\n\r\n`);
      }
    });
  });
  proxy.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const controller = await freePort();
  const dir = path.join(temp, 'health');
  fs.mkdirSync(dir);
  const provider = path.join(dir, 'provider.yaml');
  fs.writeFileSync(
    provider,
    YAML.stringify({
      proxies: ['probe'].map((name) => ({
        name,
        type: 'http',
        server: '127.0.0.1',
        port: proxy.address().port,
      })),
    }),
  );
  const generated = build().config;
  const generatedAutomatic = generated['proxy-groups'].find((group) => group.type === 'url-test');
  const namesFile = path.join(dir, 'names.yaml');
  fs.writeFileSync(
    namesFile,
    YAML.stringify({
      proxies: [
        { name: 'anchor', type: 'http', server: '127.0.0.1', port: proxy.address().port },
        {
          name: 'H\u200bK sample',
          type: 'http',
          server: '127.0.0.1',
          port: proxy.address().port,
          'dialer-proxy': 'anchor',
        },
      ],
    }),
  );
  const findFilter = (name, field) => generated['proxy-groups'].find((group) => group.name === name)[field];
  const health = {
    ...generated['proxy-providers'].订阅['health-check'],
    timeout: 500,
    lazy: true,
  };
  const config = {
    'mixed-port': 0,
    'unified-delay': generated['unified-delay'],
    'external-controller': `127.0.0.1:${controller}`,
    'proxy-providers': {
      fixture: { type: 'file', path: provider, 'health-check': health },
      names: { type: 'file', path: namesFile, 'health-check': { enable: false } },
    },
    'proxy-groups': [
      {
        name: 'automatic',
        type: 'url-test',
        use: ['fixture'],
        url: health.url,
        interval: 600,
        'expected-status': generatedAutomatic['expected-status'],
      },
      { name: 'hong-kong', type: 'select', use: ['names'], filter: findFilter('香港', 'filter') },
      { name: 'other', type: 'select', use: ['names'], 'exclude-filter': findFilter('其他节点', 'exclude-filter') },
      {
        name: 'exclude-hk',
        type: 'select',
        use: ['names'],
        'exclude-filter': findFilter('自动选择ex(大陆&香港)', 'exclude-filter'),
      },
    ],
    rules: ['MATCH,automatic'],
  };
  const file = path.join(dir, 'config.yaml');
  fs.writeFileSync(file, YAML.stringify(config));
  const child = spawn(binary, ['-d', dir, '-f', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (chunk) => (logs += chunk));
  child.stderr.on('data', (chunk) => (logs += chunk));
  const endpoint = `http://127.0.0.1:${controller}`;
  const api = async (route) => fetch(endpoint + route, { signal: AbortSignal.timeout(3000) });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try {
        const response = await api('/providers/proxies/fixture');
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const group = await (await api('/proxies/automatic')).json();
    assert.equal(String(group.expectedStatus), '200');
    const candidate = 'H\u200bK sample';
    assert.ok((await (await api('/proxies/hong-kong')).json()).all.includes(candidate));
    assert.ok(!(await (await api('/proxies/other')).json()).all.includes(candidate));
    assert.ok(!(await (await api('/proxies/exclude-hk')).json()).all.includes(candidate));
    const names = await (await api('/providers/proxies/names')).json();
    assert.equal(names.proxies.find((entry) => entry.name === candidate)['dialer-proxy'], 'anchor');
    const outcomes = [];
    for (const value of [200, 204, 500, 302, 0]) {
      // Mihomo coalesces repeated provider checks for one second.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      status = value;
      const requestCount = requests.length;
      const before = await (await api('/providers/proxies/fixture')).json();
      const last = before.proxies.find((entry) => entry.name === 'probe').history?.at(-1)?.time;
      const response = await api('/providers/proxies/fixture/healthcheck');
      assert.equal(response.status, 204);
      let state;
      for (let i = 0; i < 60; i++) {
        state = (await (await api('/providers/proxies/fixture')).json()).proxies.find(
          (entry) => entry.name === 'probe',
        );
        if (state.history?.at(-1)?.time && state.history.at(-1).time !== last) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.notEqual(
        state.history?.at(-1)?.time,
        last,
        `missing health result for ${value}: ${JSON.stringify(state)}`,
      );
      const alive = state.extra[health.url].alive;
      assert.equal(alive, value === 200, `unexpected health state for ${value}: ${JSON.stringify(state)}`);
      if (value === 200) assert.ok(requests.length - requestCount >= 2, 'unified delay did not send two requests');
      outcomes.push({ status: value || 'timeout', alive });
    }
    assert.ok(
      requests.some(
        (request) =>
          request.tunnel === 'www.apple.com:80' &&
          /^HEAD \/library\/test\/success\.html HTTP\/1\.[01]\r\n/i.test(request.request),
      ),
      `health check did not use the configured Apple host and HEAD path: ${JSON.stringify(requests)}`,
    );
    return outcomes;
  } finally {
    fs.writeFileSync(path.join(dir, 'runtime.log'), logs);
    if (child.exitCode === null) {
      const end = once(child, 'exit');
      child.kill('SIGTERM');
      await end;
    }
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => proxy.close(resolve));
  }
}
module.exports = { verifyHealth };
