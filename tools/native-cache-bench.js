'use strict';
// Optional synthetic comparison; all DNS traffic stays on loopback.
const fs = require('node:fs');
const path = require('node:path');
const dgram = require('node:dgram');
const { Resolver } = require('node:dns/promises');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const YAML = require('yaml');
const { freePort } = require('./runtime-routing');

async function cacheBench({ binary, temp }) {
  let queries = 0;
  const stub = dgram.createSocket('udp4');
  stub.on('message', (request, peer) => {
    queries++;
    let end = 12;
    while (request[end]) end += request[end] + 1;
    end += 5;
    const header = Buffer.alloc(12);
    request.copy(header, 0, 0, 2);
    header.writeUInt16BE(0x8180, 2);
    header.writeUInt16BE(1, 4);
    header.writeUInt16BE(1, 6);
    const answer = Buffer.alloc(16);
    answer.writeUInt16BE(0xc00c, 0);
    answer.writeUInt16BE(1, 2);
    answer.writeUInt16BE(1, 4);
    answer.writeUInt32BE(3600, 6);
    answer.writeUInt16BE(4, 10);
    Buffer.from([127, 0, 0, 1]).copy(answer, 12);
    stub.send(Buffer.concat([header, request.subarray(12, end), answer]), peer.port, peer.address);
  });
  stub.bind(0, '127.0.0.1');
  await once(stub, 'listening');
  const upstream = `udp://127.0.0.1:${stub.address().port}`;
  const results = [];
  try {
    for (const algorithm of ['lru', 'arc']) {
      const dir = path.join(temp, `cache-${algorithm}`);
      fs.mkdirSync(dir);
      const port = await freePort();
      const config = {
        'mixed-port': 0,
        'log-level': 'error',
        dns: {
          enable: true,
          listen: `127.0.0.1:${port}`,
          ipv6: false,
          'use-hosts': false,
          'use-system-hosts': false,
          'enhanced-mode': 'redir-host',
          'cache-algorithm': algorithm,
          nameserver: [upstream],
          'default-nameserver': [upstream],
        },
        rules: ['MATCH,DIRECT'],
      };
      const file = path.join(dir, 'config.yaml');
      fs.writeFileSync(file, YAML.stringify(config));
      const child = spawn(binary, ['-d', dir, '-f', file], { stdio: ['ignore', 'ignore', 'pipe'] });
      let logs = '';
      child.stderr.on('data', (chunk) => (logs += chunk));
      const resolver = new Resolver({ timeout: 500, tries: 1 });
      resolver.setServers([`127.0.0.1:${port}`]);
      const get = (host) => resolver.resolve4(`${host}.cache-benchmark.invalid`);
      try {
        let ready = false;
        for (let i = 0; i < 30; i++) {
          if (child.exitCode !== null) throw new Error(logs);
          try {
            await get('ready');
            ready = true;
            break;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!ready) throw new Error('cache benchmark DNS did not start: ' + logs);
        for (let repeat = 0; repeat < 3; repeat++) for (let i = 0; i < 64; i++) await get(`hot-${i}`);
        for (let i = 0; i < 4200; i++) await get(`scan-${i}`);
        const before = queries;
        const start = process.hrtime.bigint();
        for (let i = 0; i < 64; i++) await get(`hot-${i}`);
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
        const rss = spawnSync('ps', ['-o', 'rss=', '-p', String(child.pid)], { encoding: 'utf8' });
        results.push({
          algorithm,
          hotRequests: 64,
          upstreamRequests: queries - before,
          elapsedMs: +elapsedMs.toFixed(1),
          rssKiB: Number(rss.stdout.trim()) || null,
        });
      } finally {
        resolver.cancel();
        if (child.exitCode === null) {
          const end = once(child, 'exit');
          child.kill('SIGTERM');
          await end;
        }
      }
    }
  } finally {
    await new Promise((resolve) => stub.close(resolve));
  }
  return results;
}
module.exports = { cacheBench };
