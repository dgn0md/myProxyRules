'use strict';
// YAML is a static Mihomo document. This compiler applies the JS options before serialization.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const YAML = require('yaml');
const { updateConfigSha256 } = require('./config-sha');
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'Script/mihomoScript.js');
const EXPORT_SUFFIX =
  '\nglobalThis.api = {main, ruleOptionsEnable, customizeProxies, regionDefinitions, rateRegionDefinitions, homeRegionDefinitions, announcementFilter, excludeFilter, groupBaseOption, healthCheckExpectedStatus};';
let cachedScriptEntry = null;

function getCompiledScript() {
  const stat = fs.statSync(SCRIPT);
  if (cachedScriptEntry && cachedScriptEntry.mtimeMs === stat.mtimeMs && cachedScriptEntry.size === stat.size) {
    return cachedScriptEntry;
  }
  const source = fs.readFileSync(SCRIPT, 'utf8');
  const script = new vm.Script(source + EXPORT_SUFFIX, { filename: 'mihomoScript.js' });
  const optionsBlock = /const ruleOptionsEnable = \{([\s\S]*?)\n\};/.exec(source)[1];
  const descriptions = {};
  for (const line of optionsBlock.split('\n')) {
    const m = /^\s*(?:'([^']+)'|"([^"]+)"|(\S+)): (?:true|false),\s*\/\/ (.*)$/.exec(line);
    if (m) descriptions[m[1] || m[2] || m[3]] = m[4];
  }
  cachedScriptEntry = { mtimeMs: stat.mtimeMs, size: stat.size, script, descriptions };
  return cachedScriptEntry;
}

function load() {
  const sandbox = {};
  vm.createContext(sandbox);
  getCompiledScript().script.runInContext(sandbox, { timeout: 5000 });
  return sandbox.api;
}
function readYaml(file) {
  const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'), { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  return doc.toJS();
}
function configure(api, settings) {
  const options = settings.options || {};
  const optionAliases = {
    自动选择: '排除大陆香港自动选',
    '自动选择ex(大陆&香港)': '排除大陆香港自动选',
    'Siri Ai/Apple Intelligence': 'Apple智能分流',
    'Other Apple Service': 'Apple其他服务',
    Apple海外媒体: 'Apple媒体代理',
    Apple模型下载直连: 'Apple下载直连',
    Apple服务默认直连: 'Apple其他默认直连',
    Steam: '海外游戏',
    严格加密DNS: '严格DNS校验',
    代理IPV4优先: '节点IPv4优先',
    代理IPV6优先: '节点IPv6优先',
    极简国内外分流模式: '极简分流',
    生成地区自动选择组: '地区测速组',
    隐藏地区手动选择组: '隐藏地区手选组',
    生成高低倍率组: '倍率节点组',
    生成家宽节点组: '家宽节点组',
    分流组添加所有节点: '服务组含全节点',
    过滤低倍率节点: '过滤低倍率',
    过滤高倍率节点: '过滤高倍率',
    过滤非地区节点: '过滤公告信息项',
    屏蔽代理QUIC流量: '拦截代理QUIC',
    Apple: 'Apple其他服务',
    Apple智能: 'Apple智能分流',
    Siri: 'Apple智能分流',
    'Apple Product地区': 'AppleProxy',
    AppleNews: 'AppleProxy',
    AppleTV: 'AppleProxy',
    AppleFitness: 'AppleProxy',
    AppleSports: 'AppleProxy',
    AppleBooks: 'AppleProxy',
    Apple地区检测: 'Apple智能分流',
  };
  const removedOptions = new Set([
    'AppleRelay',
    '负载均衡',
    '微软默认直连',
    '微软服务默认直连',
    '接管DNS53',
    '拦截外部明文DNS',
    '国内CDN解析',
    '国内CDNDNS',
    '微软下载解析',
    '微软下载DNS',
    'Steam下载解析',
    'Steam下载DNS',
  ]);
  const migratedOptions = new Map();
  for (const [key, value] of Object.entries(options)) {
    if (typeof value !== 'boolean') throw new Error(`${key} 必须填写 true 或 false`);
    if (removedOptions.has(key)) continue;
    const target = optionAliases[key];
    if (target) {
      if (!Object.prototype.hasOwnProperty.call(options, target))
        migratedOptions.set(target, Boolean(migratedOptions.get(target) || value));
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(api.ruleOptionsEnable, key)) throw new Error(`未知配置项：${key}`);
    api.ruleOptionsEnable[key] = value;
  }
  for (const [key, value] of migratedOptions) api.ruleOptionsEnable[key] = value;
  if (settings.customProxies) {
    if (!Array.isArray(settings.customProxies)) throw new Error('customProxies 必须为节点数组');
    api.customizeProxies.push(...settings.customProxies);
  }
}
function template(api, settings) {
  // Compile all possible region/rate/home groups, then replace seed members with runtime provider filters.
  // Seeds are never serialized or dialed. Expanded-subscription mode instead uses actual node names.
  const names = api.regionDefinitions
    .flatMap((r) => [`${r.name} 1x`, `${r.name} 0.5x 家宽`, `${r.name} 3x`])
    .concat(['德国 家宽', 'Unclassified fixture']);
  const seeds = names.map((name, i) => ({
    name,
    type: 'ss',
    server: `192.0.2.${i + 1}`,
    port: 443,
    cipher: 'aes-128-gcm',
    password: 'template',
  }));
  const out = api.main({ proxies: seeds });
  const seedNames = new Set(out.proxies.filter((p) => p.password === 'template').map((p) => p.name));
  out.proxies = out.proxies.filter((p) => !seedNames.has(p.name));
  const definitions = [...api.regionDefinitions, ...api.rateRegionDefinitions, ...api.homeRegionDefinitions];
  // Match U+200B between letters of existing region abbreviations without renaming
  // provider nodes or changing their dialer-proxy references.
  const includeZeroWidthAbbreviations = (source) =>
    source.replace(/\\b\(([A-Z]+(?:\|[A-Z]+)*)\)\\b/g, (_match, aliases) => {
      const variants = aliases.split('|').map((alias) => [...alias].join('\u200b*'));
      return `\\b(${variants.join('|')})\\b`;
    });
  const regionFilterSource = (def) =>
    def.exactCodeRegex ? `${def.regex.source}|(?-i:${def.exactCodeRegex.source})` : def.regex.source;
  const filterNonRegion = api.ruleOptionsEnable.过滤公告信息项;
  const announcements = filterNonRegion ? [api.announcementFilter.source] : [];
  const softInfo = filterNonRegion ? [api.excludeFilter.source] : [];
  const excludedRates = [];
  if (api.ruleOptionsEnable.过滤低倍率) excludedRates.push(api.rateRegionDefinitions[0].regex.source);
  if (api.ruleOptionsEnable.过滤高倍率) excludedRates.push(api.rateRegionDefinitions[1].regex.source);
  for (const group of out['proxy-groups']) {
    const members = group.proxies || [];
    if (!members.some((p) => seedNames.has(p))) continue;
    group.proxies = members.filter((p) => !seedNames.has(p));
    group['include-all-providers'] = true;
    group['exclude-type'] = 'DIRECT|REJECT|REMATCH';
    const baseName = group.name.replace(/-自动选择$/, '');
    const def = definitions.find((r) => r.name === baseName);
    if (def) group.filter = `(?i)${includeZeroWidthAbbreviations(regionFilterSource(def))}`;
    const configuredExclude = group['exclude-filter']?.replace(/^\(\?i\)\(([\s\S]*)\)$/, '$1').replace(/^\(\?i\)/, '');
    const excludes = [...(configuredExclude ? [configuredExclude] : []), ...announcements, ...excludedRates];
    if (baseName === '其他节点') {
      excludes.push(...api.regionDefinitions.map(regionFilterSource));
      excludes.push(...softInfo);
    } else if (baseName === '低倍率节点' || baseName === '高倍率节点' || baseName === '家宽节点') {
      excludes.push(...softInfo);
    }
    if (excludes.length) group['exclude-filter'] = `(?i)(${includeZeroWidthAbbreviations(excludes.join('|'))})`;
    if (!group.proxies.length) delete group.proxies;
  }
  const provider = settings.subscription || {};
  // Provider names are filtered by Mihomo at runtime. Remove a contradictory mainland
  // flag before its filters run when the name explicitly identifies Taiwan.
  const taiwanName = '(台湾|台北|高雄|\\b(TW|TWN)\\b|taiwan)';
  const taiwanFlagCorrection = [
    { pattern: `(?i)🇨🇳(.*${taiwanName})`, target: '$1' },
    { pattern: `(?i)(${taiwanName}.*)🇨🇳`, target: '$1' },
  ];
  out['proxy-providers'] = {
    订阅: {
      type: 'http',
      url: provider.url || 'https://example.invalid/replace-with-your-subscription',
      path: './proxy_provider/subscription.yaml',
      interval: 86400,
      proxy: 'DIRECT',
      'exclude-type': 'DIRECT|REJECT|REMATCH',
      'health-check': {
        enable: true,
        url: api.groupBaseOption.url,
        'expected-status': api.healthCheckExpectedStatus,
        interval: 600,
        lazy: true,
      },
      override: {
        'proxy-name': taiwanFlagCorrection,
        ...(api.ruleOptionsEnable.节点IPv4优先 !== api.ruleOptionsEnable.节点IPv6优先
          ? { 'ip-version': api.ruleOptionsEnable.节点IPv4优先 ? 'ipv4-prefer' : 'ipv6-prefer' }
          : {}),
      },
    },
  };
  // Provider mode cannot inspect private DNS/hosts in a remote subscription. Use expanded mode for such providers.
  return out;
}
function render(config, api, settings) {
  const { descriptions } = getCompiledScript();
  const header = [
    '# myProxyRules Mihomo 全量静态配置',
    '# 来源：最初基于 AIsouler/MyClash（commit 4861619be366c7bacabfed6d581bb8c450de1ca1），现由本项目独立维护。',
    '# 许可：MIT License；Copyright (c) 2026 dgn0md、AIsouler。',
    `# 最新 Raw SHA-256：${'0'.repeat(64)}`,
    '# Raw 配置：https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/mihomoConfig.yaml',
    '# CDN 配置：https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/mihomoConfig.cdn.yaml',
    '# 仅适用于 Mihomo。关闭客户端 DNS 覆写。第一次使用请填 proxy-providers.订阅.url。',
    '# 此 YAML 的开关由生成器读取，Mihomo 不执行 x-myProxyRules。修改开关并推送后由 GitHub Actions 重新生成。',
    '# 机场非节点设置不会继承；需处理实际节点与节点 hosts 映射时使用 --subscription .local/subscription.yaml。',
    '# 严格模式无明文上游 DNS；需 TUN/网关接管才覆盖系统流量。不可达时不降级。',
    '# 请勿将真实订阅链接/节点提交到 Git。true 是正确拼写，ture 会被拒绝。',
  ].join('\n');
  const metadata = {
    options: { ...api.ruleOptionsEnable },
    customProxies: JSON.parse(JSON.stringify(api.customizeProxies)),
  };
  const doc = new YAML.Document({ 'x-myProxyRules': metadata, ...JSON.parse(JSON.stringify(config)) });
  const options = doc.getIn(['x-myProxyRules', 'options'], true);
  for (const pair of options.items) pair.value.comment = ' ' + (descriptions[pair.key.value] || '');
  const comments = {
    dns: 'DNS：显式直连域名规则、geolocation-cn、国内服务 AND NOT 海外子集、.cn 后缀直连规则、白名单、代理节点域名引导和 Apple 国内例外使用阿里/腾讯 DoH；服务组目标的 DNS 请求经对应组选择出口；普通默认查询使用 Cloudflare 强制 DoH-H3 和 Google DoH。厂商与 .cn DNS policy 随国内服务优先直连开关启停。default-nameserver 使用阿里/腾讯 IP DoH 仅作域名端点启动解析。',
    tun: 'TUN 接管 TCP/UDP 53；strict-route 在支持的平台防多网卡旁路。关闭 TUN 需上级 DNS 接管。',
    'proxy-providers': '填入 Clash/Mihomo 订阅 URL；静态 provider 模式不能读取机场的顶层 DNS/hosts。',
    proxies: '自定义节点与五种直连出口；链式落地须在 x-myProxyRules.customProxies 配置并重新生成。',
    'proxy-groups': '全量服务/地区/倍率/家宽组。静态地区无节点时回退 REJECT；脚本只生成有节点的组。',
    'rule-providers': '远程 MRS/文本规则每日更新；DNS 白名单独立于路由；本地 inline 规则随配置更新。',
    rules:
      '顺序：DNS 接管 → Apple 精确域名例外 → 广告/国内服务 → 服务域名 → 海外域名 → Apple IP → 私网 IP → 其他服务 IP → CN IP → 兜底。',
  };
  for (const [key, comment] of Object.entries(comments)) {
    const value = doc.get(key, true);
    if (value) value.commentBefore = ' ' + comment;
  }
  return updateConfigSha256(header + '\n\n' + doc.toString({ lineWidth: 120 })).text;
}
function build({ settings = {}, subscription } = {}) {
  const api = load();
  configure(api, settings);
  const config = subscription ? api.main(subscription) : template(api, settings);
  return { config: JSON.parse(JSON.stringify(config)), text: render(config, api, settings) };
}
function cli(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === '--check') flags.check = true;
    else if (
      ['--settings', '--subscription', '--output'].includes(name) &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    )
      flags[name.slice(2)] = args[++i];
    else throw new Error(`未知或缺少值的参数：${name}`);
  }
  const input = flags.settings ? readYaml(flags.settings) : {};
  if (Object.hasOwn(input, 'x-myClashRules')) {
    throw new Error('不再支持 x-myClashRules，请迁移为 x-myProxyRules');
  }
  const settings = input['x-myProxyRules'] || input;
  if (input['proxy-providers']?.订阅?.url) settings.subscription = { url: input['proxy-providers'].订阅.url };
  const result = build({ settings, subscription: flags.subscription ? readYaml(flags.subscription) : undefined });
  const output = path.resolve(
    flags.output || path.join(ROOT, flags.subscription ? '.local/expanded.yaml' : 'Config/mihomoConfig.yaml'),
  );
  const relativeOutput = path.relative(ROOT, output);
  const insideRepository =
    relativeOutput !== '' && !relativeOutput.startsWith('..' + path.sep) && !path.isAbsolute(relativeOutput);
  const privateInput = Boolean(
    flags.subscription ||
    settings.customProxies?.length ||
    (settings.subscription?.url &&
      settings.subscription.url !== 'https://example.invalid/replace-with-your-subscription'),
  );
  if (
    privateInput &&
    insideRepository &&
    relativeOutput !== '.local' &&
    !relativeOutput.startsWith('.local' + path.sep)
  )
    throw new Error('订阅、真实节点或私有 URL 只能输出到仓库内 .local/，或显式指定仓库外路径');
  if (flags.check) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== result.text)
      throw new Error('生成配置与脚本不一致；请等待或手动运行 GitHub Actions：Sync script and generate config');
    console.log('Generated YAML is up to date.');
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, result.text, { mode: 0o600 });
    console.log(`Generated ${output}`);
  }
}
module.exports = { load, build, readYaml, configure };
if (require.main === module) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
