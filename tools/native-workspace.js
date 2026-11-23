'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { build } = require('./build');

const ROOT = path.resolve(__dirname, '..');
const NODE_VERSION = fs.readFileSync(path.join(ROOT, '.node-version'), 'utf8').trim();
const NPM_VERSION = fs.readFileSync(path.join(ROOT, '.npm-version'), 'utf8').trim();
const MIHOMO_LOCK = JSON.parse(fs.readFileSync(path.join(__dirname, 'mihomo.lock.json'), 'utf8'));
const LOCAL = path.join(ROOT, '.local');
const TOOLCHAIN = path.join(LOCAL, 'toolchain');
const RULES_DIR = path.join(LOCAL, 'rules');
const OS = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : process.platform;
const ARCH = process.arch === 'x64' ? 'x64' : process.arch;
const PLATFORM = OS + '-' + ARCH;
const NODE_DIR = path.join(TOOLCHAIN, 'node-v' + NODE_VERSION + '-' + PLATFORM);
const EXPECTED_NODE = path.join(NODE_DIR, 'bin', 'node');
const NATIVE_DIR = path.join(LOCAL, 'native', 'mihomo', 'v' + MIHOMO_LOCK.version);
const MIHOMO_BIN = path.join(NATIVE_DIR, 'mihomo');
const ARCHIVE_DIR = path.join(LOCAL, 'native', 'downloads');
const SPEC = MIHOMO_LOCK.platforms[PLATFORM];

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertLocalToolchain() {
  if (process.env.MYPROXY_LOCAL_RUNTIME !== '1') {
    fail('请通过 ./tools/npmw 运行项目命令，避免调用系统 Node/npm。');
  }
  if (process.version !== 'v' + NODE_VERSION) {
    fail('Node 版本不匹配：项目固定 v' + NODE_VERSION + '，当前为 ' + process.version + '。');
  }
  if (path.resolve(process.execPath) !== path.resolve(EXPECTED_NODE)) {
    fail('当前 Node 不在项目隔离区：' + process.execPath);
  }
  const userAgent = process.env.npm_config_user_agent || '';
  const npmMatch = /^npm\/([^ ]+)/.exec(userAgent);
  if (npmMatch && npmMatch[1] !== NPM_VERSION) {
    fail('npm 版本不匹配：项目固定 ' + NPM_VERSION + '，当前为 ' + npmMatch[1] + '。');
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  if (pkg.engines?.node !== NODE_VERSION || pkg.engines?.npm !== NPM_VERSION) {
    fail('package.json 与本地工具链版本文件不一致。');
  }
}

function checkBinary() {
  if (!fs.existsSync(MIHOMO_BIN)) return false;
  const result = spawnSync(MIHOMO_BIN, ['-v'], { encoding: 'utf8', timeout: 10000 });
  return result.status === 0 && ((result.stdout || '') + (result.stderr || '')).includes('v' + MIHOMO_LOCK.version);
}

function writeBinary(compressed) {
  if (sha256(compressed) !== SPEC.sha256) fail('Mihomo 归档 SHA-256 不匹配。');
  const binary = gunzipSync(compressed);
  fs.mkdirSync(NATIVE_DIR, { recursive: true });
  const temp = MIHOMO_BIN + '.tmp';
  fs.writeFileSync(temp, binary, { mode: 0o755 });
  fs.chmodSync(temp, 0o755);
  fs.renameSync(temp, MIHOMO_BIN);
  if (!checkBinary()) fail('Mihomo v' + MIHOMO_LOCK.version + ' 二进制校验失败。');
}

async function ensureBinary() {
  if (!SPEC) fail('项目本地原生校验暂不支持 ' + PLATFORM + '。');
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const archivePath = path.join(ARCHIVE_DIR, SPEC.archive);
  let compressed;
  if (fs.existsSync(archivePath)) {
    compressed = fs.readFileSync(archivePath);
    if (sha256(compressed) !== SPEC.sha256) {
      fs.rmSync(archivePath);
      compressed = undefined;
    }
  }
  if (
    compressed &&
    fs.existsSync(MIHOMO_BIN) &&
    sha256(fs.readFileSync(MIHOMO_BIN)) === sha256(gunzipSync(compressed)) &&
    checkBinary()
  ) {
    console.log('复用摘要已校验的本地 Mihomo v' + MIHOMO_LOCK.version);
    return;
  }
  if (!compressed) {
    const url = MIHOMO_LOCK.release + '/' + SPEC.archive;
    console.log('下载并校验项目固定的 Mihomo v' + MIHOMO_LOCK.version + '...');
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) fail('Mihomo 下载失败：HTTP ' + response.status);
    compressed = Buffer.from(await response.arrayBuffer());
    if (sha256(compressed) !== SPEC.sha256) fail('Mihomo 归档 SHA-256 不匹配。');
    fs.writeFileSync(archivePath, compressed);
  }
  writeBinary(compressed);
}

function expectedRuleFiles() {
  const providers = build().config['rule-providers'];
  return Object.entries(providers)
    .filter((entry) => entry[1].type !== 'inline')
    .map(([name, spec]) => ({
      name,
      url: spec.url,
      file: path.join(RULES_DIR, name + path.extname(spec.path)),
    }));
}

function rulesAreComplete() {
  const manifestPath = path.join(RULES_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return false;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return false;
  }
  const recorded = new Map((manifest.providers || []).map((entry) => [entry.name, entry]));
  const files = expectedRuleFiles();
  return (
    files.length > 0 &&
    files.every((entry) => {
      if (!fs.existsSync(entry.file)) return false;
      const data = fs.readFileSync(entry.file);
      const item = recorded.get(entry.name);
      return (
        data.length > 16 && item?.url === entry.url && item?.bytes === data.length && item?.sha256 === sha256(data)
      );
    })
  );
}

function runNodeScript(script, args) {
  const result = spawnSync(process.execPath, [path.join(ROOT, script)].concat(args || []), {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    fail(script + ' 失败，退出码 ' + (result.status ?? result.error?.message ?? 'unknown'));
  }
}

async function ensureRules(refresh) {
  if (!refresh && rulesAreComplete()) {
    console.log('复用已校验的本地规则快照：' + RULES_DIR);
    return;
  }
  runNodeScript('tools/download-rules.js', [RULES_DIR]);
  if (!rulesAreComplete()) fail('本地规则快照校验失败。');
}

function runNativeCheck() {
  runNodeScript('tools/native-check.js', [MIHOMO_BIN, RULES_DIR]);
}

async function main() {
  const args = process.argv.slice(2);
  const diagnose = args[0] === '--diagnose';
  if (diagnose && !args.slice(1).some((value) => value === '--probe-domain' || value === '--probe-ip'))
    fail('诊断需要 --probe-domain 域名 或 --probe-ip 地址');
  const flags = new Set(diagnose ? [] : args);
  for (const flag of flags) {
    if (flag !== '--check' && flag !== '--refresh-rules') fail('未知参数：' + flag);
  }
  assertLocalToolchain();
  fs.mkdirSync(LOCAL, { recursive: true });
  await ensureBinary();
  await ensureRules(flags.has('--refresh-rules'));
  if (diagnose) runNodeScript('tools/native-check.js', [MIHOMO_BIN, RULES_DIR, ...args.slice(1)]);
  else if (flags.has('--check')) runNativeCheck();
  else console.log('项目本地 Mihomo 与规则快照已就绪。');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
