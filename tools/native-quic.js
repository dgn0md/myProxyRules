'use strict';
// Build QUIC Initial packets locally; they are sent only to Mihomo's loopback SOCKS listener.
const net = require('node:net');
const tls = require('node:tls');
const dgram = require('node:dgram');
const crypto = require('node:crypto');
const { Duplex } = require('node:stream');
const { once } = require('node:events');
const assert = require('node:assert/strict');

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
function expand(secret, label, length) {
  const name = Buffer.from(`tls13 ${label}`);
  const info = Buffer.concat([Buffer.from([0, length, name.length]), name, Buffer.from([0, 1])]);
  return hmac(secret, info).subarray(0, length);
}
function varint(value) {
  if (value < 64) return Buffer.from([value]);
  assert.ok(value < 16384);
  return Buffer.from([0x40 | (value >> 8), value & 255]);
}
async function clientHello(host) {
  let resolve;
  const ready = new Promise((done) => (resolve = done));
  const chunks = [];
  const transport = new Duplex({
    read() {},
    write(chunk, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
      resolve();
    },
  });
  const secure = tls.connect({ socket: transport, servername: host });
  secure.on('error', () => {});
  await ready;
  const records = Buffer.concat(chunks);
  assert.equal(records[0], 22);
  const length = records.readUInt16BE(3);
  assert.ok(records.length >= 5 + length);
  secure.destroy();
  return records.subarray(5, 5 + length);
}
async function initial(host, version) {
  const hello = await clientHello(host);
  const v2 = version === 2;
  const salt = Buffer.from(
    v2 ? '0dede3def700a6db819381be6e269dcbf9bd2ed9' : '38762cf7f55934b34d179ae6a4c80cadccbb7f0a',
    'hex',
  );
  const dcid = Buffer.from('8394c8f03e515708', 'hex');
  const secret = expand(hmac(salt, dcid), 'client in', 32);
  const key = expand(secret, v2 ? 'quicv2 key' : 'quic key', 16);
  const iv = expand(secret, v2 ? 'quicv2 iv' : 'quic iv', 12);
  const hp = expand(secret, v2 ? 'quicv2 hp' : 'quic hp', 16);
  const cryptoFrame = Buffer.concat([Buffer.from([6, 0]), varint(hello.length), hello]);
  // The fixed header, four-byte packet number and authentication tag occupy 38 bytes.
  const plaintext = Buffer.concat([cryptoFrame, Buffer.alloc(Math.max(0, 1200 - 38 - cryptoFrame.length))]);
  const versionBytes = v2 ? Buffer.from('6b3343cf', 'hex') : Buffer.from('00000001', 'hex');
  const prefix = Buffer.concat([
    Buffer.from([v2 ? 0xd3 : 0xc3]),
    versionBytes,
    Buffer.from([dcid.length]),
    dcid,
    Buffer.from([0, 0]),
    varint(4 + plaintext.length + 16),
  ]);
  const header = Buffer.concat([prefix, Buffer.alloc(4)]);
  const cipher = crypto.createCipheriv('aes-128-gcm', key, iv);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const packet = Buffer.concat([header, body]);
  const maskCipher = crypto.createCipheriv('aes-128-ecb', hp, null);
  maskCipher.setAutoPadding(false);
  const mask = maskCipher.update(packet.subarray(prefix.length + 4, prefix.length + 20));
  packet[0] ^= mask[0] & 0x0f;
  for (let i = 0; i < 4; i++) packet[prefix.length + i] ^= mask[i + 1];
  return packet;
}
async function probeQuic({ port, api, enabled, version, local }) {
  const control = net.connect(port, '127.0.0.1');
  control.on('error', () => {});
  const udp = dgram.createSocket('udp4');
  udp.bind(0, '127.0.0.1');
  await once(udp, 'listening');
  try {
    await once(control, 'connect');
    control.write(Buffer.from([5, 1, 0]));
    const [greeting] = await once(control, 'data');
    assert.equal(greeting[1], 0);
    control.write(Buffer.from([5, 3, 0, 1, 127, 0, 0, 1, 0, 0]));
    const [reply] = await once(control, 'data');
    assert.equal(reply[1], 0);
    assert.equal(reply[3], 1);
    const relayPort = reply.readUInt16BE(8);
    const payload = await initial('github.com', version);
    const envelope = Buffer.concat([Buffer.from([0, 0, 0, 1, 20, 205, 243, 166, 1, 187]), payload]);
    const before = local.udpDatagrams();
    udp.send(envelope, relayPort, '127.0.0.1');
    let connection;
    for (let i = 0; i < 50; i++) {
      connection = (await api('/connections')).connections?.find(
        (entry) => entry.metadata.network === 'udp' && String(entry.metadata.sourcePort) === String(udp.address().port),
      );
      if (connection) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(connection, `missing QUIC v${version} connection`);
    if (enabled) assert.equal(connection.metadata.host, 'github.com');
    else assert.equal(connection.metadata.destinationIP, '20.205.243.166');
    assert.ok(connection.chains.includes(enabled ? 'GitHub' : 'Microsoft'), JSON.stringify(connection));
    assert.equal(connection.rulePayload, enabled ? 'github' : 'microsoft_ip');
    if (enabled) assert.equal(connection.metadata.sniffHost, 'github.com');
    for (let i = 0; i < 50 && local.udpDatagrams() === before; i++)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(local.udpDatagrams() > before, 'QUIC datagram did not reach the loopback UDP sink');
    return { enabled, version, rule: connection.rulePayload, sniffHost: connection.metadata.sniffHost };
  } finally {
    control.destroy();
    udp.close();
  }
}
module.exports = { probeQuic };
