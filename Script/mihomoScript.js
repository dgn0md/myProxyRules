/**
 * myProxyRules Mihomo 配置全量覆写脚本
 * 项目地址：dgn0md/myProxyRules
 * 来源：最初基于 AIsouler/MyClash（commit 4861619be366c7bacabfed6d581bb8c450de1ca1），现由本项目独立维护。
 * 许可：MIT License；Copyright (c) 2026 dgn0md、AIsouler。
 *
 * 最新 Raw SHA-256：7974fc5bc7297488082f2e71d09ecae90ee5519bdb8a0d3ab50a8840e0f66c51
 * Raw 脚本：https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Script/mihomoScript.js
 * CDN 脚本：https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Script/mihomoScript.cdn.js
 */

// --- 静态配置区域 ---

// 适配 Bettbox 自定义配置参数
const Compatible_With_Bettbox = { ruleOptionsEnable: true };
const appleAiGroupName = 'Siri Ai/Apple Intelligence';
const appleProxyGroupName = 'AppleProxy';
const appleOtherGroupName = 'Other Apple Service';
const autoSelectExMainlandHongKongGroupName = '自动选择ex(大陆&香港)';
const autoSelectExMainlandHongKongOptionName = '排除大陆香港自动选';

/**
 * 自定义配置选项
 * true = 启用
 * false = 禁用
 */
const ruleOptionsEnable = {
  // 基础策略组
  手动选择: true, // 是否启用手动选择策略组
  排除大陆香港自动选: true, // 是否启用排除大陆和香港节点的自动选择策略组

  // 以下为分流策略配置
  FCM: true, // GoogleFCM服务
  YouTube: true, // YouTube视频平台
  Google: true, // Google服务
  AI: true, // 国外AI服务
  GitHub: true, // GitHub代码托管平台
  Microsoft: true, // Microsoft服务
  Apple其他服务: true, // 普通 Apple 服务
  Telegram: true, // Telegram通讯软件
  海外游戏: true, // 海外游戏平台与服务（含国内下载直连集）
  TikTok: true, // TikTok视频平台
  Twitter: true, // Twitter社交平台
  Meta: true, // Meta服务
  Line: true, // Line通讯软件
  Netflix: true, // Netflix视频平台
  Emby: true, // Emby媒体服务
  PikPak: true, // PikPak网盘服务
  'BT/PT': true, // BT/PT Tracker服务
  Spotify: true, // Spotify音乐服务
  Crypto: true, // 加密货币相关服务
  PayPal: true, // PayPal支付服务
  Patreon: true, // Patreon创作者赞助平台
  EHentai: true, // E-Hentai网站
  AdBlock: true, // 广告拦截

  // Apple 精细分流组：AI/Siri 与产品地区服务各自共用一个出口选择器。
  Apple智能分流: true, // PCC、Apple Intelligence、Siri、地区检测及部分共享端点，默认美国；无允许地区候选时拒绝
  AppleProxy: true, // AppleProxy 动态集合、产品入口与 Apple IP，默认美国并可选直连
  Apple媒体代理: false, // iTunes/App Store/Arcade 共用购买与媒体接口；会增加 Music/商店代理流量
  Apple下载直连: true, // 模型/系统资源下载保持国内 CDN；关闭后交给 Apple 其他服务组
  严格DNS校验: true, // 校验脚本生成的加密 DNS；不从机场配置继承 DNS
  国内服务优先直连: true, // 保留国内服务/CDN 例外；不将整个 cn 域名库强制直连
  Apple其他默认直连: true, // Other Apple Service 默认直连；AI/Siri 和产品地区组独立优先
  TUN: true, // 接管 DNS 所必需；关闭仅适合上级路由器已经接管 DNS 的环境
  域名嗅探: true, // 从 HTTP/TLS/QUIC 补充缺失域名，避免纯 IP 入站误走服务 IP 规则
  IPv6: true, // DNS AAAA 与全局 IPv6 同步；关闭后不返回 AAAA
  局域网访问: false, // 是否将 mixed-port 暴露给局域网
  PCDN拦截: true, // 将 Bilibili PCDN hosts 加入黑洞规则

  // 以下为非分流策略配置
  极简分流: false, // 是否启用精简的国内外分流模式
  地区测速组: true, // 是否生成地区自动选择策略组
  隐藏地区手选组: false, // 是否隐藏地区手动选择策略组
  倍率节点组: true, // 是否生成低倍率/高倍率策略组
  家宽节点组: true, // 是否生成家宽（住宅/原生 IP）节点策略组
  服务组含全节点: false, // 是否为分流策略组添加所有节点
  过滤低倍率: false, // 是否过滤低倍率节点
  过滤高倍率: false, // 是否过滤高倍率节点
  过滤公告信息项: true, // 是否过滤公告、信息和无地区节点
  拦截代理QUIC: false, // 是否屏蔽非国内目标的 QUIC 流量
  节点IPv4优先: false, // 是否将订阅节点统一为 IPv4 优先（与“节点IPv6优先”同时开启时不生效）
  节点IPv6优先: false, // 是否将订阅节点统一为 IPv6 优先（与“节点IPv4优先”同时开启时不生效）
  链式代理: false, // 是否启用链式代理（自定义节点作为落地节点，经“链式中转”策略组中转）
};

// 定义前置规则
const prefixRules = [
  // 私有网络直连
  'RULE-SET,private,直连',

  // 国内专用直连
  'RULE-SET,synology,直连',
  'RULE-SET,nvidia_cn,直连',
  'RULE-SET,apple_cn,直连',
  'RULE-SET,microsoft_cn,直连',
  'DOMAIN,fsend.cn,直连',
  'DOMAIN,international-gfe.download.nvidia.com,直连',
  'DOMAIN-SUFFIX,ctaiot.com,直连',
];
const geolocationCnRule = 'RULE-SET,geolocation-cn,直连';
const cnSuffixDirectRule = 'DOMAIN-SUFFIX,cn,直连';

// 此处添加自定义节点，填入下方[]内（可选，留空则不生成“自建节点”策略组）
// 自定义节点不参与节点过滤与 hosts 改写；与订阅节点（标准化后）重名时自动添加“自建-”前缀
// 示例：
// const customizeProxies = [
//   {
//     name: '自建-日本-01',
//     type: 'vmess',
//     server: '5.6.7.8',
//     port: 443,
//     uuid: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
//     alterId: 0,
//     cipher: 'auto',
//     tls: true,
//     servername: 'example.com',
//     network: 'ws',
//     'ws-opts': {
//       path: '/path',
//       headers: { Host: 'example.com' },
//     },
//   },
// ];
const customizeProxies = [];

// 链式代理启用时，自定义节点的 dialer-proxy 引用目标
const dialerProxyName = '链式中转';

// 识别公告、面板和网址。该过滤优先于地区识别，避免带国家名的公告行进入地区组。
// 保持为 Mihomo Go regexp 兼容语法（不使用 lookaround 或非捕获组）。
const announcementFilter =
  /(官网|官方网站|官网地址|网址|网站|订阅地址|面板|panel|公告|宣传|延迟\s*≠\s*速度|无脑选|https?:\/\/\S+|www\.\S+|(^|[^A-Za-z0-9_-])([A-Za-z0-9-]+\.)+[A-Za-z][A-Za-z]+(\/\S*)?)/i;

// 定义全局软排除节点的正则表达式，用于排除非地区信息节点。
const excludeFilter =
  /群|返利|循环|官网|客服|网站|网址|获取|订阅|流量|到期|机场|下次|版本|官址|过期|已用|联系|邮箱|工单|贩卖|通知|倒卖|防止|国内|地址|频道|电报|无法|说明|提示|访问|支持|教程|关注|更新|作者|加入|超时|收藏|优惠|福利|邀请|好友|失联|选择|剩余|公益|发布|DIZTNA|通路|登录|禁止|定时|渠道|牢记|永久|余额|阁下|本站|刷新|导航|建议|重置|以下|过滤|⚠️|@|t\.me\/\+|\bexpire\b|\bhttps?:\/\/|\.com|\btraffic\b/iu;

// 拦截代理QUIC
const blockForeignQuic = [
  'AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((OR,((RULE-SET,cn),(RULE-SET,cn_ip,no-resolve)))))),REJECT',
];

// 直连节点
const directProxies = [
  {
    name: '🇨🇳 直连 | 双栈',
    type: 'direct',
  },
  {
    name: '🇨🇳 直连 | IPv4优先',
    type: 'direct',
    'ip-version': 'ipv4-prefer',
  },
  {
    name: '🇨🇳 直连 | IPv6优先',
    type: 'direct',
    'ip-version': 'ipv6-prefer',
  },
  {
    name: '🇨🇳 直连 | 仅IPv4',
    type: 'direct',
    'ip-version': 'ipv4',
  },
  {
    name: '🇨🇳 直连 | 仅IPv6',
    type: 'direct',
    'ip-version': 'ipv6',
  },
];
const directProxyNames = directProxies.map(({ name }) => name);

// 图标 URL 公共前缀
const iconBaseUrl = 'https://fastly.jsdelivr.net/gh/dgn0md/myProxyRules@main/Icons/svg/';

// 规则集 URL 公共前缀
const ruleSetBaseUrl = 'https://fastly.jsdelivr.net/gh/appshubcc/bett-rules@meta/geo/';

// 定义地区策略组。regex 只使用 Mihomo Go regexp 支持的语法；
// nameRegex 用于名称文字与国旗冲突时选择正确国旗；exactCodeRegex 用于区分大小写的短国家码（避免 in/id/no 等英文词误匹配）。
function defineRegion(name, flag, nameRegex, icon = `${iconBaseUrl}common/World_Map.svg`, exactCodeRegex = null) {
  return {
    name,
    flag,
    nameRegex,
    exactCodeRegex,
    regex: new RegExp(`${flag}|${nameRegex.source}`, 'i'),
    icon,
  };
}

const regionDefinitions = [
  defineRegion('香港', '🇭🇰', /香港|\b(HK|HKG)\b|hong\s*kong/i, `${iconBaseUrl}flag/Hong_Kong.svg`),
  defineRegion('日本', '🇯🇵', /日本|东京|大阪|京都|\b(JP|JPN)\b|japan/i, `${iconBaseUrl}flag/Japan.svg`),
  defineRegion(
    '美国',
    '🇺🇸',
    /美国|纽约|洛杉矶|旧金山|芝加哥|休斯顿|迈阿密|西雅图|波士顿|华盛顿|拉斯维加斯|圣何塞|\b(US|USA)\b|america|united\s*states/i,
    `${iconBaseUrl}flag/United_States.svg`,
  ),
  defineRegion('新加坡', '🇸🇬', /新加坡|狮城|\b(SG|SGP)\b|singapore/i, `${iconBaseUrl}flag/Singapore.svg`),
  defineRegion('台湾', '🇹🇼', /台湾|台北|高雄|\b(TW|TWN)\b|taiwan/i, `${iconBaseUrl}flag/China_Taiwan.svg`),
  defineRegion('韩国', '🇰🇷', /韩国|首尔|釜山|\b(KR|KOR)\b|south\s*korea|korea/i, `${iconBaseUrl}flag/South_Korea.svg`),
  defineRegion(
    '澳大利亚',
    '🇦🇺',
    /澳大利亚|澳洲|悉尼|墨尔本|珀斯|\b(AU|AUS)\b|australia/i,
    `${iconBaseUrl}flag/Australia.svg`,
  ),
  defineRegion(
    '印度尼西亚',
    '🇮🇩',
    /印度尼西亚|印尼|雅加达|\b(IDN)\b|indonesia/i,
    `${iconBaseUrl}flag/Indonesia.svg`,
    /\b(ID)\b/,
  ),
  defineRegion('印度', '🇮🇳', /印度($|[^尼])|孟买|新德里|\b(IND)\b|india/i, `${iconBaseUrl}flag/India.svg`, /\b(IN)\b/),
  defineRegion('加拿大', '🇨🇦', /加拿大|多伦多|温哥华|蒙特利尔|\b(CA|CAN)\b|canada/i, `${iconBaseUrl}flag/Canada.svg`),
  defineRegion('德国', '🇩🇪', /德国|法兰克福|柏林|\b(DE|DEU)\b|germany/i, `${iconBaseUrl}flag/Germany.svg`),
  defineRegion(
    '英国',
    '🇬🇧',
    /英国|伦敦|曼彻斯特|\b(UK|GB|GBR)\b|united\s*kingdom|britain|england/i,
    `${iconBaseUrl}flag/United_Kingdom.svg`,
  ),
  defineRegion('法国', '🇫🇷', /法国|巴黎|\b(FR|FRA)\b|france/i, `${iconBaseUrl}flag/France.svg`),
  defineRegion('荷兰', '🇳🇱', /荷兰|阿姆斯特丹|\b(NL|NLD)\b|netherlands|holland/i, `${iconBaseUrl}flag/Netherlands.svg`),
  defineRegion('西班牙', '🇪🇸', /西班牙|马德里|\b(ES|ESP)\b|spain/i, `${iconBaseUrl}flag/Spain.svg`),
  defineRegion('俄罗斯', '🇷🇺', /俄罗斯|莫斯科|\b(RU|RUS)\b|russia/i, `${iconBaseUrl}flag/Russia.svg`),
  defineRegion('乌克兰', '🇺🇦', /乌克兰|基辅|\b(UA|UKR)\b|ukraine/i, `${iconBaseUrl}flag/Ukraine.svg`),
  defineRegion('土耳其', '🇹🇷', /土耳其|伊斯坦布尔|\b(TR|TUR)\b|turkey|türkiye/i, `${iconBaseUrl}flag/Turkey.svg`),
  defineRegion('挪威', '🇳🇴', /挪威|奥斯陆|\b(NOR)\b|norway/i, `${iconBaseUrl}flag/Norway.svg`, /\b(NO)\b/),
  defineRegion('瑞士', '🇨🇭', /瑞士|苏黎世|\b(CH|CHE)\b|switzerland|swiss/i, `${iconBaseUrl}flag/Switzerland.svg`),
  defineRegion('瑞典', '🇸🇪', /瑞典|斯德哥尔摩|\b(SE|SWE)\b|sweden/i, `${iconBaseUrl}flag/Sweden.svg`),
  defineRegion('爱尔兰', '🇮🇪', /爱尔兰|都柏林|\b(IE|IRL)\b|ireland/i, `${iconBaseUrl}flag/Ireland.svg`),
  defineRegion('菲律宾', '🇵🇭', /菲律宾|马尼拉|\b(PH|PHL)\b|philippines/i, `${iconBaseUrl}flag/Philippines.svg`),
  defineRegion('越南', '🇻🇳', /越南|河内|胡志明|\b(VN|VNM)\b|vietnam/i, `${iconBaseUrl}flag/Vietnam.svg`),
  defineRegion('泰国', '🇹🇭', /泰国|曼谷|\b(TH|THA)\b|thailand/i, `${iconBaseUrl}flag/Thailand.svg`),
  defineRegion('马来西亚', '🇲🇾', /马来西亚|吉隆坡|\b(MY|MYS)\b|malaysia/i, `${iconBaseUrl}flag/Malaysia.svg`),
];

// 按节点名称排除大陆与香港候选；不匹配“中国台湾”，以保留台湾节点。
// 该表达式同时用于展开订阅与静态 provider，语法保持 Mihomo Go regexp 兼容。
const autoSelectExMainlandHongKongNodeNameRegex =
  /🇭🇰|香港|\b(HK|HKG)\b|hong\s*kong|🇨🇳|大陆|内地|\b(CN|CHN|PRC)\b|\bChina\b|\bMainland\b/i;

// 定义倍率策略组
const lowRateRegionName = '低倍率节点';
const highRateRegionName = '高倍率节点';

const rateRegionDefinitions = [
  {
    name: lowRateRegionName,
    regex: new RegExp(
      '(^|[^A-Za-z0-9.])([*×✕✖⨯⨉xX] *(0(\\.[0-5][0-9]*)?|\\.[0-5][0-9]*)|(0(\\.[0-5][0-9]*)?|\\.[0-5][0-9]*) *(倍(率)?|[*×✕✖⨯⨉xX]))($|[^A-Za-z0-9.])|低倍|免费|\\bfree\\b',
      'i',
    ),
    icon: `${iconBaseUrl}common/Available.svg`,
  },
  {
    name: highRateRegionName,
    regex: new RegExp(
      '(^|[^A-Za-z0-9.])([*×✕✖⨯⨉xX] *(([2-9][0-9]*|[1-9][0-9]+)(\\.[0-9]+)?|1\\.[0-9]*[1-9][0-9]*)|(([2-9][0-9]*|[1-9][0-9]+)(\\.[0-9]+)?|1\\.[0-9]*[1-9][0-9]*) *(倍(率)?|[*×✕✖⨯⨉xX]))($|[^A-Za-z0-9.])',
      'i',
    ),
    icon: `${iconBaseUrl}common/Airport.svg`,
  },
];

// 定义家宽（住宅/原生 IP）节点策略组
const homeRegionName = '家宽节点';

const homeRegionDefinitions = [
  {
    name: homeRegionName,
    regex: /家宽|住宅|原生(\s*IP)?|家庭宽带|家庭网络|\bISP\b|\bRES\b|residential|home\s*broadband|native\s*IP/i,
    icon: `${iconBaseUrl}common/Home.svg`,
  },
];

// This group is selected from proxy names only. It is a candidate set, not proof of egress country.
const unitedStatesRegion = regionDefinitions.find(({ name }) => name === '美国');
// Match exact region-group names: keep 台湾 eligible even when a proxy name contains “中国台湾”.
const excludedServiceRegionNames = new Set([
  '香港',
  '澳门',
  '大陆',
  '中国大陆',
  '俄罗斯',
  '白俄罗斯',
  '古巴',
  '伊朗',
  '朝鲜',
  '朝鲜民主主义人民共和国',
  '克里米亚',
  '顿涅茨克',
  '顿涅茨克人民共和国',
  '卢甘斯克',
  '卢甘斯克人民共和国',
]);
const serviceRegionNames = new Set(
  regionDefinitions.filter(({ name }) => !excludedServiceRegionNames.has(name)).map(({ name }) => name),
);
const regionRestrictedServiceNames = new Set(['Google', 'AI', 'TikTok', 'Meta', appleAiGroupName]);
// Mihomo `+.` 后缀同时匹配根域主机，避免重复列举精确域名；Siri 正则族通过内联规则集 apple_siri_regex 注入。
const appleRealIpEndpoints = [
  'dejavu.apple.com',
  'sequoia.apple.com',
  '+.smoot.apple.com',
  '+.issuer.apple.com',
  '+.ropes.apple.com',
  '+.app.apple.com',
  'cp4.cloudflare.com',
];

// 全部策略组定义（地区 + 倍率 + 家宽），统一用于节点匹配与归类
const allRegionDefinitions = [...regionDefinitions, ...rateRegionDefinitions, ...homeRegionDefinitions];
const countryRegionSet = new Set(regionDefinitions);
const countryRegionNameSet = new Set(regionDefinitions.map(({ name }) => name));
const rateRegionSet = new Set(rateRegionDefinitions);
const homeRegionSet = new Set(homeRegionDefinitions);

// Rule Providers 通用配置
const ruleProviderCommonDomain = {
  type: 'http',
  format: 'mrs',
  interval: 86400,
  behavior: 'domain',
};
const ruleProviderCommonIpcidr = {
  type: 'http',
  format: 'mrs',
  interval: 86400,
  behavior: 'ipcidr',
};

function geositeProvider(source, localName = source) {
  return {
    ...ruleProviderCommonDomain,
    url: `${ruleSetBaseUrl}geosite/${source}.mrs`,
    path: `./ruleset/${localName}.mrs`,
    'path-in-bundle': `geo/geosite/${source}.mrs`,
  };
}

function geoipProvider(source, localName = `${source}_ip`) {
  return {
    ...ruleProviderCommonIpcidr,
    url: `${ruleSetBaseUrl}geoip/${source}.mrs`,
    path: `./ruleset/${localName}.mrs`,
    'path-in-bundle': `geo/geoip/${source}.mrs`,
  };
}

// 大陆核心服务与基础设施厂商动态集合；无 @!cn 的国内厂商/大类已由 geolocation-cn 覆盖，
// 此处仅保留带同源 @!cn 海外子集的 13 组核心厂商，按 domestic AND NOT domestic_noncn 路由与 DNS 解析。
const domesticServiceModules = [
  'alibaba',
  'bilibili',
  'bytedance',
  'chinamobile',
  'chinatelecom',
  'chinaunicom',
  'huaweicloud',
  'jd',
  'netease',
  'sina',
  'tencent',
  'xiaomi',
  'xiaohongshu',
];

function buildDomesticServiceRoutes(providers) {
  const routesEnabled = ruleOptionsEnable.国内服务优先直连;
  if (!routesEnabled) return [];
  const rules = [];
  for (const source of domesticServiceModules) {
    const name = `domestic_${source}`;
    const overseas = `${name}_noncn`;
    const overseasFile = `${source}@!cn`;
    providers[name] = geositeProvider(source, name);
    providers[overseas] = geositeProvider(overseasFile, overseas);
    providers[`${name}_dns`] = {
      type: 'inline',
      format: 'text',
      behavior: 'classical',
      payload: [`AND,((RULE-SET,${name}),(NOT,((RULE-SET,${overseas}))))`],
    };
    rules.push(`AND,((RULE-SET,${name}),(NOT,((RULE-SET,${overseas})))),直连`);
  }
  return rules;
}

// 定义基础 Rule Providers
const baseRuleProviders = {
  // --- 直连规则集 ---

  private: geositeProvider('private'),
  private_ip: geoipProvider('private'),
  synology: geositeProvider('synology'),
  nvidia_cn: geositeProvider('nvidia@cn'),
  apple_cn: {
    type: 'http',
    format: 'text',
    interval: 86400,
    behavior: 'classical',
    // 仅保留大陆专用 Apple 主机；固定版本使 Siri 诊断可重复。
    url: 'https://fastly.jsdelivr.net/gh/SukkaW/Surge@0afc9c2ee92aadbf79ce1c9caf03f724135073ea/Source/non_ip/apple_cn.conf',
    path: './ruleset/apple_cn.list',
  },
  microsoft_cn: geositeProvider('microsoft@cn'),
  'geolocation-cn': geositeProvider('geolocation-cn'),
  cn_ip: geoipProvider('cn'),

  // --- 代理规则集 ---

  'category-stun': geositeProvider('category-stun'),
  'geolocation-!cn': geositeProvider('geolocation-!cn'),

  // --- 其他规则集 ---

  fakeip_filter: geositeProvider('fakeip-filter'),
  cn: geositeProvider('cn'),
  douyin: geositeProvider('douyin'),
};

const healthCheckExpectedStatus = 200;

// 策略组公共配置
const groupBaseOption = {
  timeout: 5000,
  url: 'https://www.apple.com/library/test/success.html',
  'max-failed-times': 3,
  'empty-fallback': 'REJECT',
};

// select策略组通用配置
const selectBaseOption = {
  ...groupBaseOption,
  type: 'select',
};

// url-test策略组通用配置
const urlTestBaseOption = {
  ...groupBaseOption,
  type: 'url-test',
  'expected-status': healthCheckExpectedStatus,
  interval: 600,
  lazy: true,
  tolerance: 50,
  'exclude-type': 'DIRECT',
  icon: `${iconBaseUrl}common/Auto.svg`,
  hidden: true,
};

// 定义基础策略组
const baseGroups = [
  {
    name: '手动选择',
    baseOption: selectBaseOption,
    includeAll: true,
    icon: `${iconBaseUrl}common/Static.svg`,
  },
  {
    name: autoSelectExMainlandHongKongGroupName,
    option: autoSelectExMainlandHongKongOptionName,
    baseOption: urlTestBaseOption,
    includeAll: true,
    excludeProxyNameRegex: autoSelectExMainlandHongKongNodeNameRegex,
    excludeFilter: autoSelectExMainlandHongKongNodeNameRegex.source,
    icon: `${iconBaseUrl}common/Auto.svg`,
  },
];

// 定义分流策略组配置
const serviceConfigs = [
  ...baseGroups,
  {
    name: 'FCM',
    baseOption: selectBaseOption,
    direct: true,
    providers: { googlefcm: geositeProvider('googlefcm') },
    icon: `${iconBaseUrl}common/FCM.svg`,
    rules: ['RULE-SET,googlefcm,FCM'],
  },
  {
    name: 'YouTube',
    baseOption: selectBaseOption,
    providers: { youtube: geositeProvider('youtube') },
    icon: `${iconBaseUrl}common/YouTube.svg`,
    rules: ['RULE-SET,youtube,YouTube'],
  },
  {
    name: 'Google',
    baseOption: selectBaseOption,
    defaultSelected: '美国',
    providers: {
      google: geositeProvider('google'),
      google_ip: geoipProvider('google'),
    },
    icon: `${iconBaseUrl}common/Google.svg`,
    rules: ['RULE-SET,google,Google'],
    proxyIpRequired: true,
    ipRules: ['RULE-SET,google_ip,Google,no-resolve'],
  },
  {
    name: 'AI',
    baseOption: selectBaseOption,
    defaultSelected: '美国',
    providers: {
      ai: geositeProvider('category-ai-!cn', 'ai'),
      openai_ip: geoipProvider('openai'),
    },
    icon: `${iconBaseUrl}common/ChatGPT.svg`,
    rules: ['RULE-SET,ai,AI'],
    proxyIpRequired: true,
    ipRules: ['RULE-SET,openai_ip,AI,no-resolve'],
  },
  {
    name: 'GitHub',
    baseOption: selectBaseOption,
    providers: { github: geositeProvider('github') },
    icon: `${iconBaseUrl}common/GitHub.svg`,
    rules: ['RULE-SET,github,GitHub'],
  },
  {
    name: 'Microsoft',
    baseOption: selectBaseOption,
    direct: true,
    providers: {
      microsoft: geositeProvider('microsoft'),
      microsoft_ip: geoipProvider('microsoft'),
    },
    icon: `${iconBaseUrl}common/Microsoft.svg`,
    rules: ['RULE-SET,microsoft,Microsoft'],
    ipRules: ['RULE-SET,microsoft_ip,Microsoft,no-resolve'],
  },
  {
    name: appleOtherGroupName,
    option: 'Apple其他服务',
    baseOption: selectBaseOption,
    direct: true,
    providers: { apple: geositeProvider('apple') },
    icon: `${iconBaseUrl}common/Apple.svg`,
    rules: [`RULE-SET,apple,${appleOtherGroupName}`],
  },
  {
    name: 'Telegram',
    baseOption: selectBaseOption,
    providers: {
      telegram: geositeProvider('telegram'),
      telegram_ip: geoipProvider('telegram'),
    },
    icon: `${iconBaseUrl}common/Telegram.svg`,
    rules: ['RULE-SET,telegram,Telegram'],
    proxyIpRequired: true,
    ipRules: ['RULE-SET,telegram_ip,Telegram,no-resolve'],
  },
  {
    name: '海外游戏',
    baseOption: selectBaseOption,
    direct: true,
    providers: {
      overseas_games: geositeProvider('category-games-!cn', 'overseas_games'),
      game_platforms_download_cn: geositeProvider('category-game-platforms-download@cn', 'game_platforms_download_cn'),
    },
    icon: `${iconBaseUrl}common/Game.svg`,
    rules: [
      'RULE-SET,game_platforms_download_cn,直连',
      'AND,((RULE-SET,overseas_games),(NOT,((RULE-SET,game_platforms_download_cn)))),海外游戏',
    ],
  },
  {
    name: 'TikTok',
    baseOption: selectBaseOption,
    defaultSelected: '美国',
    providers: {
      tiktok: geositeProvider('tiktok'),
      tiktok_ip: geoipProvider('tiktok'),
    },
    icon: `${iconBaseUrl}common/TikTok.svg`,
    rules: ['RULE-SET,tiktok,TikTok'],
    proxyIpRequired: true,
    ipRules: ['RULE-SET,tiktok_ip,TikTok,no-resolve'],
  },
  {
    name: 'Twitter',
    baseOption: selectBaseOption,
    providers: {
      twitter: geositeProvider('twitter'),
      twitter_ip: geoipProvider('twitter'),
    },
    icon: `${iconBaseUrl}common/X.svg`,
    rules: ['RULE-SET,twitter,Twitter'],
    proxyIpRequired: true,
    ipRules: ['RULE-SET,twitter_ip,Twitter,no-resolve'],
  },
  {
    name: 'Meta',
    baseOption: selectBaseOption,
    defaultSelected: '美国',
    providers: {
      meta: geositeProvider('meta'),
      facebook_ip: geoipProvider('facebook'),
    },
    icon: `${iconBaseUrl}common/Meta.svg`,
    rules: ['RULE-SET,meta,Meta'],
    proxyIpRequired: true,
    ipRules: ['RULE-SET,facebook_ip,Meta,no-resolve'],
  },
  {
    name: 'Line',
    baseOption: selectBaseOption,
    providers: { line: geositeProvider('line') },
    icon: `${iconBaseUrl}common/Line.svg`,
    rules: ['RULE-SET,line,Line'],
  },
  {
    name: 'Netflix',
    baseOption: selectBaseOption,
    providers: {
      netflix: geositeProvider('netflix'),
      netflix_ip: geoipProvider('netflix'),
    },
    icon: `${iconBaseUrl}common/Netflix.svg`,
    rules: ['RULE-SET,netflix,Netflix'],
    ipRules: ['RULE-SET,netflix_ip,Netflix,no-resolve'],
  },
  {
    name: 'Emby',
    baseOption: selectBaseOption,
    direct: true,
    providers: {
      emby: geositeProvider('category-emby', 'emby'),
      emby_keyword: {
        type: 'inline',
        format: 'text',
        behavior: 'classical',
        payload: ['DOMAIN-KEYWORD,emby'],
      },
    },
    icon: `${iconBaseUrl}common/Emby.svg`,
    rules: [
      'RULE-SET,emby,Emby',
      'DOMAIN-SUFFIX,mb3admin.com,Emby',
      'DOMAIN-SUFFIX,nubebelle.com,Emby',
      'RULE-SET,emby_keyword,Emby',
    ],
  },
  {
    name: 'PikPak',
    baseOption: selectBaseOption,
    direct: true,
    providers: { pikpak: geositeProvider('pikpak') },
    icon: `${iconBaseUrl}common/PikPak.svg`,
    rules: ['RULE-SET,pikpak,PikPak'],
  },
  {
    name: 'BT/PT',
    baseOption: selectBaseOption,
    direct: true,
    providers: { tracker: geositeProvider('tracker') },
    icon: `${iconBaseUrl}common/QBittorrent.svg`,
    rules: ['RULE-SET,tracker,BT/PT'],
  },
  {
    name: 'Spotify',
    baseOption: selectBaseOption,
    direct: true,
    providers: {
      spotify: geositeProvider('spotify'),
      spotify_ip: geoipProvider('spotify'),
    },
    icon: `${iconBaseUrl}common/Spotify.svg`,
    rules: ['RULE-SET,spotify,Spotify'],
    ipRules: ['RULE-SET,spotify_ip,Spotify,no-resolve'],
  },
  {
    name: 'Crypto',
    baseOption: selectBaseOption,
    defaultSelected: '日本',
    providers: { cryptocurrency: geositeProvider('category-cryptocurrency', 'cryptocurrency') },
    icon: `${iconBaseUrl}common/Bitcoin.svg`,
    rules: ['RULE-SET,cryptocurrency,Crypto'],
  },
  {
    name: 'PayPal',
    baseOption: selectBaseOption,
    defaultSelected: '美国',
    providers: { paypal: geositeProvider('paypal') },
    icon: `${iconBaseUrl}common/PayPal.svg`,
    rules: ['RULE-SET,paypal,PayPal'],
  },
  {
    name: 'Patreon',
    baseOption: selectBaseOption,
    defaultSelected: '香港',
    providers: { patreon: geositeProvider('patreon') },
    icon: `${iconBaseUrl}common/Patreon.svg`,
    rules: ['RULE-SET,patreon,Patreon'],
  },
  {
    name: 'EHentai',
    baseOption: selectBaseOption,
    direct: true,
    defaultSelected: '美国',
    providers: { ehentai: geositeProvider('ehentai') },
    icon: `${iconBaseUrl}common/EHentai.svg`,
    rules: ['RULE-SET,ehentai,EHentai'],
  },
  {
    name: 'AdBlock',
    baseOption: selectBaseOption,
    reject: true,
    priority: true,
    providers: {
      'category-ads-all': geositeProvider('category-ads-all'),
      httpdns: geositeProvider('httpdns'),
    },
    icon: `${iconBaseUrl}common/AdBlock.svg`,
    rules: ['RULE-SET,category-ads-all,AdBlock', 'RULE-SET,httpdns,AdBlock'],
  },
];

// 来源：Apple 企业网络文档 https://support.apple.com/en-us/101555（2026-11-13 核对）。
// 按用户选择覆盖国际 icloud-content.com 的全部主机；共享内容并非 AI 专用。
// DOMAIN-SUFFIX 不匹配 icloud-content.com.cn，不靠地区代码推断大陆，也不按 IP 地理位置判断。
// 同时覆盖地区根域、edge 以及其他命名结构；照片/文件等普通国际 iCloud 内容也会代理。
// 不代理整个 apple.com / cloudflare.com / icloud.com 或 17/8。
const appleEndpointDefinitions = [
  {
    name: appleAiGroupName,
    option: 'Apple智能分流',
    domains: [
      '+.issuer.apple.com',
      '+.ropes.apple.com',
      // app.apple.com 后缀规则已覆盖 Apple 清理代理主机。
      '+.app.apple.com',
      'cp4.cloudflare.com',
      // 国际内容域整体覆盖，中国站内容域保留原规则；gateway 单独归入 Other Apple Service。
      '+.icloud-content.com',
      'dejavu.apple.com',
      'sequoia.apple.com',
      '+.smoot.apple.com',
    ],
  },
  {
    name: appleProxyGroupName,
    option: appleProxyGroupName,
    domains: [
      // Apple DNS service namespace not covered by the AppleProxy provider.
      '+.apple-dns.com',
      'news-client-search.apple.com',
      // TV+ domain membership is supplied by the daily apple-tvplus rule provider below.
      '+.fitness.apple.com',
      '+.sports.apple.com',
      '+.books.apple.com',
    ],
  },
];
const appleSiriRegexRuleProvider = {
  type: 'inline',
  format: 'text',
  behavior: 'classical',
  payload: [
    'DOMAIN-REGEX,^mask(-[a-z0-9]+)?\\.icloud\\.com$',
    'DOMAIN-REGEX,(^|\\.)apple-relay\\.(apple\\.com|cloudflare\\.com|fastly-edge\\.com|akamaized\\.net)$',
    'DOMAIN-REGEX,(^|\\.)guzzoni\\.apple\\.com$|^guzzoni-apple-com\\.v\\.aaplimg\\.com$',
    'DOMAIN-REGEX,(^|[.-])siri(-[a-z0-9]+)*\\.apple\\.com$',
    'DOMAIN-REGEX,ssl\\.ls\\.apple\\.com$',
  ],
};
const appleMediaRegexRuleProvider = {
  type: 'inline',
  format: 'text',
  behavior: 'classical',
  payload: ['DOMAIN-REGEX,^(?:(?:p\\d+-)?buy|play|se\\d*)\\.itunes\\.apple\\.com$'],
};
const appleProxyRuleProvider = {
  type: 'http',
  format: 'yaml',
  interval: 86400,
  behavior: 'classical',
  url: 'https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/AppleProxy/AppleProxy.yaml',
  path: './ruleset/apple_proxy.yaml',
};
const appleIpRuleProvider = geoipProvider('apple');
const appleTvRuleProvider = geositeProvider('apple-tvplus', 'apple_tv');
const appleOtherExactEndpoints = ['gateway.icloud.com', 'setup.icloud.com'];
for (const { name, option } of appleEndpointDefinitions) {
  serviceConfigs.push({
    name,
    option,
    baseOption: selectBaseOption,
    direct: true,
    defaultSelected: '美国',
    icon: `${iconBaseUrl}common/Apple.svg`,
    ...(name === appleProxyGroupName
      ? {
          providers: {
            apple_proxy: appleProxyRuleProvider,
            apple_ip: appleIpRuleProvider,
          },
          ipRules: [`RULE-SET,apple_ip,${appleProxyGroupName},no-resolve`],
        }
      : {}),
  });
}

/**
 * 适配 Bettbox 策略组开关
 * 声明哪些开关属于策略组：基础策略组 + 全部分流策略组。
 */
Compatible_With_Bettbox.policyGroupOptions = serviceConfigs.map((svc) => svc.option || svc.name);

// ---节点过滤、重命名及验证---

/**
 * 零宽/不可见字符：部分机场会在节点名中逐字符插入这类字符（如 H\u200BK），会打断地区、倍率等正则匹配。
 *
 * 刻意排除三类「有语义」的字符，避免误伤：
 * - U+200C / U+200D（ZWNJ / ZWJ）：参与连字与 emoji 组合，删掉会改变字形；
 * - U+FE00–U+FE0F 及 U+E0100–U+E01EF（变体选择符）：控制 emoji 呈现方式。
 * 其余零宽/不可见字符不含任何语义，只用于干扰匹配，可安全忽略。
 */
const invisibleCharsRegex = /[\u00AD\u180E\u200B\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF\u115F\u1160\u3164\uFFA0]/g;

/**
 * 取节点名「可用于匹配」的形式：剥离零宽/不可见字符
 */
function toMatchableName(name) {
  return typeof name === 'string' ? name.replace(invisibleCharsRegex, '') : name;
}

/**
 * 节点匹配缓存，避免重复执行正则
 */
const regionMatchCache = new Map();
const flagRegex = /[\u{1F1E6}-\u{1F1FF}]{2}/u;
function getMatchedRegions(proxyName, cache = regionMatchCache, precomputedMatchableName) {
  if (cache.has(proxyName)) {
    return cache.get(proxyName);
  }

  const matchableName = precomputedMatchableName ?? toMatchableName(proxyName);
  const regions = [];
  for (const region of regionDefinitions) {
    if (region.nameRegex.test(matchableName) || region.exactCodeRegex?.test(matchableName)) regions.push(region);
  }

  if (!regions.length && flagRegex.test(matchableName)) {
    for (const region of regionDefinitions) if (matchableName.includes(region.flag)) regions.push(region);
  }
  for (const region of rateRegionDefinitions) if (region.regex.test(matchableName)) regions.push(region);
  for (const region of homeRegionDefinitions) if (region.regex.test(matchableName)) regions.push(region);
  cache.set(proxyName, regions);

  return regions;
}

/**
 * 标准化节点名称：补全地区国旗、折叠多余空格，并预缓存匹配结果
 */
function normalizeProxyName(proxy, cache = regionMatchCache, precomputedMatchableName) {
  const originalName = proxy.name;

  const flag = originalName.match(flagRegex)?.[0];

  const nameWithoutFlag = (flag ? originalName.replace(flag, '') : originalName).replace(/\s+/g, ' ').trim();

  const matchedRegions = getMatchedRegions(originalName, cache, precomputedMatchableName);

  const regionFlag = matchedRegions.find((region) => region.flag)?.flag || flag;

  const normalizedName = regionFlag ? `${regionFlag} ${nameWithoutFlag}` : nameWithoutFlag;

  if (normalizedName !== originalName) {
    cache.set(normalizedName, matchedRegions);
  }

  return normalizedName === originalName ? proxy : { ...proxy, name: normalizedName };
}

/**
 * 修复 dialer-proxy 引用：目标被重命名则更新，被移除或不存在则删除引用
 */
function fixDialerProxy(proxy, renameMap, normalizedProxyNames) {
  const target = proxy['dialer-proxy'];
  if (!target) return proxy;

  if (renameMap.has(target)) {
    return { ...proxy, 'dialer-proxy': renameMap.get(target) };
  }

  if (normalizedProxyNames.has(target)) {
    return proxy;
  }

  const copy = { ...proxy };
  delete copy['dialer-proxy'];
  return copy;
}

/**
 * 读取代理 IP 版本偏好：仅其中一个开关开启时返回对应偏好，
 * 同时开启或同时关闭时返回 null（不应用任何偏好，节点保持原样）
 */
function getIpVersionPreference() {
  const ipv4PreferEnabled = ruleOptionsEnable.节点IPv4优先;
  const ipv6PreferEnabled = ruleOptionsEnable.节点IPv6优先;

  if (ipv4PreferEnabled && !ipv6PreferEnabled) return 'ipv4-prefer';
  if (ipv6PreferEnabled && !ipv4PreferEnabled) return 'ipv6-prefer';
  return null;
}

/**
 * 过滤并标准化节点：剔除内置/信息节点、按配置过滤、去重、修复 dialer-proxy 引用，空列表时抛错
 */
function filterAndNormalizeProxies(config, classificationCache = new Map()) {
  classificationCache.clear();

  const filterLowRateProxiesEnabled = ruleOptionsEnable.过滤低倍率;
  const filterHighRateProxiesEnabled = ruleOptionsEnable.过滤高倍率;
  const filterNonRegionProxiesEnabled = ruleOptionsEnable.过滤公告信息项;

  const lowRateRegex = filterLowRateProxiesEnabled
    ? rateRegionDefinitions.find((r) => r.name === lowRateRegionName)?.regex
    : null;
  const highRateRegex = filterHighRateProxiesEnabled
    ? rateRegionDefinitions.find((r) => r.name === highRateRegionName)?.regex
    : null;

  const originalProxies = config.proxies || [];
  const hasDialerProxy = originalProxies.some((proxy) => proxy['dialer-proxy']);
  const renameMap = hasDialerProxy ? new Map() : null;
  const normalizedProxies = [];
  const uniqueNames = new Set();

  for (const rawProxy of originalProxies) {
    const type = String(rawProxy.type ?? '').toLowerCase();
    if (type === 'direct' || type === 'reject' || type === 'rematch') continue;

    const matchableName = toMatchableName(rawProxy.name);
    if (lowRateRegex?.test(matchableName) || highRateRegex?.test(matchableName)) continue;

    if (filterNonRegionProxiesEnabled) {
      if (announcementFilter.test(matchableName)) continue;
      const isRegionProxy = getMatchedRegions(rawProxy.name, classificationCache, matchableName).some((region) =>
        countryRegionSet.has(region),
      );
      if (!isRegionProxy && excludeFilter.test(matchableName)) continue;
    }

    const normalized = normalizeProxyName(rawProxy, classificationCache, matchableName);
    if (renameMap && normalized.name !== rawProxy.name) {
      renameMap.set(rawProxy.name, normalized.name);
    }
    if (!uniqueNames.has(normalized.name)) {
      uniqueNames.add(normalized.name);
      normalizedProxies.push(normalized);
    }
  }

  let filteredProxies = normalizedProxies;
  if (renameMap) {
    filteredProxies = normalizedProxies.map((proxy) => fixDialerProxy(proxy, renameMap, uniqueNames));
  }

  if (!filteredProxies.length) {
    throw new Error('配置文件中未找到任何代理节点，请使用机场提供的配置文件进行覆写');
  }

  const ipVersionPreference = getIpVersionPreference();
  if (ipVersionPreference) {
    return filteredProxies.map((proxy) =>
      proxy['ip-version'] === ipVersionPreference ? proxy : { ...proxy, 'ip-version': ipVersionPreference },
    );
  }

  return filteredProxies;
}

// ---构建地区组和倍率组---

/**
 * 构建地区策略组，可附带自动选择组
 */
function createRegionGroup(name, icon, proxies) {
  const generateRegionAutoSelectEnabled = ruleOptionsEnable.地区测速组;
  const hideManualSelectGroupEnabled = ruleOptionsEnable.隐藏地区手选组;

  if (generateRegionAutoSelectEnabled) {
    const urlTestName = `${name}-自动选择`;
    const isCountryRegion = countryRegionNameSet.has(name);
    return [
      {
        ...selectBaseOption,
        name,
        icon,
        proxies: isCountryRegion ? [urlTestName, ...proxies] : [...proxies, urlTestName],
        hidden: hideManualSelectGroupEnabled,
      },
      {
        ...urlTestBaseOption,
        name: urlTestName,
        proxies,
      },
    ];
  }
  return [
    {
      ...selectBaseOption,
      name,
      icon,
      proxies,
      hidden: hideManualSelectGroupEnabled,
    },
  ];
}

/**
 * 将节点按地区/倍率归类，构建地区策略组、倍率策略组与“其他节点”组
 */
function buildRegionGroups(filteredProxies, customProxies, classificationCache = regionMatchCache) {
  const generateRateGroupEnabled = ruleOptionsEnable.倍率节点组;
  const generateHomeGroupEnabled = ruleOptionsEnable.家宽节点组;

  const regionGroups = Object.fromEntries(allRegionDefinitions.map(({ name }) => [name, []]));
  const otherProxies = [];

  const addProxy = (proxy) => {
    const matchedRegions = getMatchedRegions(proxy.name, classificationCache);
    const isRegionProxy = matchedRegions.some((region) => countryRegionSet.has(region));

    for (const region of matchedRegions) {
      regionGroups[region.name].push(proxy.name);
    }

    if (!isRegionProxy) {
      otherProxies.push(proxy.name);
    }
  };
  for (const proxy of filteredProxies) addProxy(proxy);
  for (const proxy of customProxies) addProxy(proxy);

  const generatedRegionGroups = allRegionDefinitions
    .filter(
      (r) =>
        regionGroups[r.name].length > 0 &&
        (generateRateGroupEnabled || !rateRegionSet.has(r)) &&
        (generateHomeGroupEnabled || !homeRegionSet.has(r)),
    )
    .flatMap((r) => createRegionGroup(r.name, r.icon, regionGroups[r.name]));

  if (otherProxies.length > 0) {
    generatedRegionGroups.push(...createRegionGroup('其他节点', `${iconBaseUrl}common/World_Map.svg`, otherProxies));
  }

  return generatedRegionGroups;
}

/** Keep eligible country selectors in minimal mode for the region-restricted service groups. */
function buildMinimalServiceRegionGroups(filteredProxies, customProxies, classificationCache = regionMatchCache) {
  const candidatesByRegion = new Map([...serviceRegionNames].map((name) => [name, []]));
  const addProxy = (proxy) => {
    for (const region of getMatchedRegions(proxy.name, classificationCache)) {
      if (candidatesByRegion.has(region.name)) candidatesByRegion.get(region.name).push(proxy.name);
    }
  };
  for (const proxy of filteredProxies) addProxy(proxy);
  for (const proxy of customProxies) addProxy(proxy);

  return regionDefinitions
    .filter(({ name }) => serviceRegionNames.has(name) && candidatesByRegion.get(name).length > 0)
    .flatMap(({ name, icon }) => createRegionGroup(name, icon, candidatesByRegion.get(name)));
}

// ---构建自定义节点组---

/**
 * 处理自定义节点：标准化名称、与订阅节点重名时添加“自建-”前缀、内部去重，
 * 并构建“自建节点”策略组。
 * 自定义节点不参与订阅节点过滤，也不参与 hosts 改写及 DNS 域名处理。
 */
function buildCustomizeGroups(
  filteredProxies,
  customizeList = customizeProxies,
  classificationCache = regionMatchCache,
) {
  const chainEnabled = ruleOptionsEnable.链式代理;

  if (!customizeList.length) {
    if (chainEnabled) {
      throw new Error('启用失败，请在脚本中添加自定义节点后尝试');
    }
    return { customProxies: [], customProxyNames: [], customGroup: null };
  }

  const usedNames = new Set();
  for (const proxy of filteredProxies) usedNames.add(proxy.name);
  const customPrefix = '自建-';
  const customProxies = [];
  const customProxyNames = [];

  for (const proxy of customizeList) {
    const normalized = normalizeProxyName(proxy, classificationCache);
    let name = normalized.name;
    if (usedNames.has(name)) {
      const flag = name.match(flagRegex)?.[0];
      let body = (flag ? name.replace(flag, '') : name).trim();
      while (usedNames.has(name)) {
        body = `${customPrefix}${body}`;
        name = flag ? `${flag} ${body}` : body;
      }
      classificationCache.set(name, getMatchedRegions(normalized.name, classificationCache));
    }
    usedNames.add(name);

    let customProxy = name === normalized.name ? normalized : { ...normalized, name };
    if (chainEnabled && customProxy['dialer-proxy'] !== dialerProxyName) {
      customProxy = { ...customProxy, 'dialer-proxy': dialerProxyName };
    }
    customProxies.push(customProxy);
    customProxyNames.push(name);
  }

  const customGroup = {
    ...selectBaseOption,
    name: chainEnabled ? '链式落地' : '自建节点',
    proxies: customProxyNames,
    icon: `${iconBaseUrl}common/Server.svg`,
  };

  return {
    customProxies,
    customProxyNames,
    customGroup,
  };
}

// ---构建基础策略组和分流策略组---

/** 构建功能分流规则、IP 兜底规则与实际使用的规则集。 */
function buildFunctionalRulesAndProviders(minimalModeEnabled) {
  const functionalRules = [];
  const functionalIpRules = [];
  const priorityRules = [];
  const finalRuleProviders = { ...baseRuleProviders };
  const fallbackProxyIpRules = [];

  // 必须代理的服务 IP 不随服务组开关消失；组关闭时使用默认代理。
  for (const svc of serviceConfigs) {
    if (!svc.proxyIpRequired || (!minimalModeEnabled && ruleOptionsEnable[svc.option || svc.name])) continue;
    for (const rule of svc.ipRules) {
      const [, provider] = rule.split(',');
      finalRuleProviders[provider] = svc.providers[provider];
      fallbackProxyIpRules.push(`RULE-SET,${provider},默认代理,no-resolve`);
    }
  }

  functionalIpRules.push(...fallbackProxyIpRules);
  if (!minimalModeEnabled) {
    for (const svc of serviceConfigs) {
      if (!ruleOptionsEnable[svc.option || svc.name]) continue;

      (svc.priority ? priorityRules : functionalRules).push(...(svc.rules || []));
      functionalIpRules.push(...(svc.ipRules || []));
      Object.assign(finalRuleProviders, svc.providers || {});
    }
  }

  return { functionalRules, functionalIpRules, priorityRules, finalRuleProviders };
}

/**
 * 构建基础/分流策略组/部分节点组、GLOBAL 组与规则集，并汇总分流规则
 */
function buildFunctionalGroups(filteredProxies, generatedRegionGroups, customizeInfo) {
  const minimalModeEnabled = ruleOptionsEnable.极简分流;
  const addAllNodesToServiceGroupsEnabled = ruleOptionsEnable.服务组含全节点;
  const chainEnabled = ruleOptionsEnable.链式代理;
  const hideManualSelectGroupEnabled = ruleOptionsEnable.隐藏地区手选组;

  const functionalGroups = [];
  const { functionalRules, functionalIpRules, priorityRules, finalRuleProviders } =
    buildFunctionalRulesAndProviders(minimalModeEnabled);

  const { customProxyNames = [], customGroup = null } = customizeInfo || {};
  const filteredProxyNames = filteredProxies.map((p) => p.name);
  const allProxiesNames = [...filteredProxyNames, ...customProxyNames];
  const groupNamesOfSelect = generatedRegionGroups.filter((g) => g.type === 'select').map((g) => g.name);
  const serviceRegionGroupNames = groupNamesOfSelect.filter((name) => serviceRegionNames.has(name));
  const baseGroupNames = baseGroups.filter((g) => ruleOptionsEnable[g.option || g.name]).map((g) => g.name);
  const customGroupNames = customGroup ? [customGroup.name] : [];

  const chainGroup =
    chainEnabled && customGroup
      ? {
          ...selectBaseOption,
          name: dialerProxyName,
          proxies: filteredProxyNames,
          icon: `${iconBaseUrl}common/Bypass.svg`,
        }
      : null;

  if (minimalModeEnabled) {
    const autoSelectExMainlandHongKongEnabled = ruleOptionsEnable[autoSelectExMainlandHongKongOptionName];

    const defaultGroup = {
      ...selectBaseOption,
      name: '默认代理',
      proxies: [
        ...allProxiesNames,
        ...(autoSelectExMainlandHongKongEnabled ? [autoSelectExMainlandHongKongGroupName] : []),
      ],
      icon: `${iconBaseUrl}common/Proxy.svg`,
    };

    const autoSelectExMainlandHongKongGroup = {
      ...urlTestBaseOption,
      name: autoSelectExMainlandHongKongGroupName,
      proxies: allProxiesNames.filter((name) => !autoSelectExMainlandHongKongNodeNameRegex.test(toMatchableName(name))),
      'exclude-filter': `(?i)(${autoSelectExMainlandHongKongNodeNameRegex.source})`,
      hidden: true,
    };

    const directGroup = {
      ...selectBaseOption,
      name: '直连',
      proxies: [...directProxyNames],
      icon: `${iconBaseUrl}flag/China.svg`,
      hidden: true,
    };

    const globalGroup = {
      ...selectBaseOption,
      name: 'GLOBAL',
      proxies: [
        '默认代理',
        ...customGroupNames,
        ...(chainGroup ? [chainGroup.name] : []),
        ...(autoSelectExMainlandHongKongEnabled ? [autoSelectExMainlandHongKongGroup.name] : []),
        '直连',
      ],
      icon: `${iconBaseUrl}common/Global.svg`,
    };

    return {
      globalGroup,
      functionalGroups: [
        defaultGroup,
        ...(autoSelectExMainlandHongKongEnabled ? [autoSelectExMainlandHongKongGroup] : []),
      ],
      functionalRules,
      functionalIpRules,
      priorityRules,
      finalRuleProviders,
      chainGroup,
      directGroup,
    };
  }

  functionalGroups.push({
    ...selectBaseOption,
    name: '默认代理',
    proxies: [...groupNamesOfSelect, ...baseGroupNames, ...customGroupNames],
    icon: `${iconBaseUrl}common/Proxy.svg`,
  });

  for (const svc of serviceConfigs) {
    if (!ruleOptionsEnable[svc.option || svc.name]) continue;

    const groupProxies = regionRestrictedServiceNames.has(svc.name)
      ? serviceRegionGroupNames.length
        ? [...serviceRegionGroupNames]
        : ['REJECT']
      : svc.includeAll
        ? allProxiesNames.filter((name) => !svc.excludeProxyNameRegex?.test(toMatchableName(name)))
        : svc.reject
          ? ['REJECT', 'REJECT-DROP', 'PASS']
          : [
              '默认代理',
              ...customGroupNames,
              ...baseGroupNames,
              ...groupNamesOfSelect,
              ...(addAllNodesToServiceGroupsEnabled ? allProxiesNames : []),
              ...(svc.direct ? ['直连'] : []),
            ];

    const selected = groupProxies.includes(svc.defaultSelected) ? svc.defaultSelected : undefined;
    const orderedProxies =
      selected !== undefined ? [selected, ...groupProxies.filter((entry) => entry !== selected)] : groupProxies;

    functionalGroups.push({
      ...svc.baseOption,
      name: svc.name,
      ...(svc.icon && { icon: svc.icon }),
      proxies: orderedProxies,
      ...(svc.excludeFilter && { 'exclude-filter': `(?i)(${svc.excludeFilter})` }),
    });
  }

  functionalGroups.push({
    ...selectBaseOption,
    name: '漏网之鱼',
    proxies: ['默认代理', '直连', ...groupNamesOfSelect],
    icon: `${iconBaseUrl}common/Stack.svg`,
  });

  const directGroup = {
    ...selectBaseOption,
    name: '直连',
    proxies: [...directProxyNames],
    icon: `${iconBaseUrl}flag/China.svg`,
    hidden: hideManualSelectGroupEnabled,
  };

  const globalGroup = {
    ...selectBaseOption,
    name: 'GLOBAL',
    proxies: [
      ...functionalGroups.map((g) => g.name),
      ...customGroupNames,
      ...(chainGroup ? [chainGroup.name] : []),
      directGroup.name,
      ...generatedRegionGroups.map((g) => g.name),
    ],
    icon: `${iconBaseUrl}common/Global.svg`,
  };

  return {
    globalGroup,
    functionalGroups,
    functionalRules,
    functionalIpRules,
    priorityRules,
    finalRuleProviders,
    chainGroup,
    directGroup,
  };
}

// ---dns和hosts相关处理---

// 国内外 DNS 定义
// 国内 DNS 白名单与代理节点引导：阿里与腾讯 DoH；普通默认查询使用 Cloudflare DoH-H3 与 Google DoH。
// 节点域名必须在代理可用前解析，因此使用可直连的国内 DoH；不可达时失败，不降级为明文。
const chinaDNS = ['https://dns.alidns.com/dns-query#DIRECT', 'https://doh.pub/dns-query#DIRECT'];
const foreignDNS = ['https://cloudflare-dns.com/dns-query#默认代理&h3=true', 'https://dns.google/dns-query#默认代理'];
// Mihomo 的 default-nameserver 要求 IP 字面量；以阿里和腾讯 IP DoH 端点启动解析并校验证书域名。
const bootstrapDNS = [
  'https://223.5.5.5/dns-query#DIRECT&name-cert-verify=dns.alidns.com',
  'https://1.12.12.12/dns-query#DIRECT&name-cert-verify=doh.pub',
];
// Other Apple Service connections keep their own group, while Apple DNS uses the Siri selector.
const appleOtherDnsEgressGroupName = appleAiGroupName;
const defaultDNS = [...bootstrapDNS];
const proxyServerDNS = [...chinaDNS];
function dnsForGroup(groupName) {
  const encodedGroupName = groupName.replace(/&/g, '%26');
  return foreignDNS.map((dns) => dns.replace('#默认代理', `#${encodedGroupName}`));
}

/**
 * hosts 匹配优先级：精确 > +. > . > *（同级按出现顺序）
 */
function hostSpecificity(pattern) {
  if (pattern.startsWith('+.')) return 2;
  if (pattern.startsWith('.')) return 1;
  if (pattern.includes('*')) return 0;
  return 3;
}

/**
 * 判断域名规则（精确/通配）是否匹配节点域名集合，忽略大小写
 */
function matchDomainPattern(pattern, domains) {
  pattern = pattern.toLowerCase();

  // 精确匹配
  if (!pattern.includes('*') && !pattern.startsWith('+.') && !pattern.startsWith('.')) {
    return typeof domains === 'string'
      ? domains.toLowerCase() === pattern
      : [...domains].some((d) => d.toLowerCase() === pattern);
  }

  const domainList = typeof domains === 'string' ? [domains.toLowerCase()] : [...domains].map((d) => d.toLowerCase());

  // +.example.com
  if (pattern.startsWith('+.')) {
    const suffix = pattern.slice(2);
    return domainList.some((domain) => domain === suffix || domain.endsWith(`.${suffix}`));
  }

  // .example.com
  if (pattern.startsWith('.')) {
    const suffix = pattern.slice(1);
    return domainList.some((domain) => domain !== suffix && domain.endsWith(`.${suffix}`));
  }

  // *.example.com、example.*.com 等
  const patternParts = pattern.split('.');
  return domainList.some((domain) => {
    const domainParts = domain.split('.');
    return (
      patternParts.length === domainParts.length &&
      patternParts.every((part, index) => part === '*' || part === domainParts[index])
    );
  });
}

/**
 * 预编译 hosts 条目，返回「域名 → 命中条目」的查找函数。
 * 精确 / `+.` / `.` 三类按模式建索引，通配模式按标签段数分桶比对；
 * 同类型命中时取 hosts 中靠前者，与「按优先级排序后线性查找」的结果保持一致。
 * 入参需已按 hostSpecificity 降序排列（同一键只保留最先出现的一条）
 */
function createHostFinder(hostEntries) {
  const exact = new Map();
  const plus = new Map();
  const dot = new Map();
  const wildcardsByLength = new Map();

  hostEntries.forEach((entry, index) => {
    const pattern = entry[0].toLowerCase();
    const level = hostSpecificity(pattern);
    if (level === 0) {
      const parts = pattern.split('.');
      let bucket = wildcardsByLength.get(parts.length);
      if (!bucket) {
        bucket = [];
        wildcardsByLength.set(parts.length, bucket);
      }
      bucket.push({ parts, entry });
      return;
    }
    const [map, key] =
      level === 3 ? [exact, pattern] : level === 2 ? [plus, pattern.slice(2)] : [dot, pattern.slice(1)];
    if (!map.has(key)) map.set(key, { entry, index });
  });

  const hasSuffixMaps = plus.size > 0 || dot.size > 0;
  const hasWildcards = wildcardsByLength.size > 0;

  return (domain) => {
    const exactEntry = exact.get(domain)?.entry;
    if (exactEntry) return exactEntry;

    if (hasSuffixMaps) {
      let bestPlus = null;
      let bestDot = null;
      for (let pos = 0; ;) {
        const suffix = pos === 0 ? domain : domain.slice(pos);
        if (plus.size > 0) {
          const item = plus.get(suffix);
          if (item && (!bestPlus || item.index < bestPlus.index)) bestPlus = item;
        }
        if (pos > 0 && dot.size > 0) {
          const item = dot.get(suffix);
          if (item && (!bestDot || item.index < bestDot.index)) bestDot = item;
        }
        const nextDot = domain.indexOf('.', pos);
        if (nextDot === -1) break;
        pos = nextDot + 1;
      }
      if (bestPlus) return bestPlus.entry;
      if (bestDot) return bestDot.entry;
    }

    if (hasWildcards) {
      const domainParts = domain.split('.');
      const bucket = wildcardsByLength.get(domainParts.length);
      if (bucket) {
        for (const { parts, entry } of bucket) {
          let matched = true;
          for (let i = 0; i < parts.length; i++) {
            if (parts[i] !== '*' && parts[i] !== domainParts[i]) {
              matched = false;
              break;
            }
          }
          if (matched) return entry;
        }
      }
    }

    return undefined;
  };
}

/**
 * 根据订阅 hosts 映射改写节点 server，改写后无需再复制 hosts 进新配置。
 * 支持链式映射（如 a: b、b: c 时节点 a 改写为 c）；
 * 回环映射（a: b、b: a）由内核校验拒绝，此处仅以已访问集合防御性终止
 */
function applyHostsToProxies(proxies, hosts) {
  if (!hosts || typeof hosts !== 'object') return proxies;

  const hostEntries = Object.entries(hosts)
    .filter(
      ([, value]) => (typeof value === 'string' && value.length > 0) || (Array.isArray(value) && value.length > 0),
    )
    .sort((a, b) => hostSpecificity(b[0]) - hostSpecificity(a[0]));

  if (hostEntries.length === 0) return proxies;

  const targetOf = (value) => {
    if (Array.isArray(value)) value = value.find((v) => typeof v === 'string' && v.length > 0);
    return typeof value === 'string' && value.length > 0 ? value : null;
  };

  const findHost = createHostFinder(hostEntries);
  const resolveCache = new Map();
  const resolve = (server) => {
    const lowerServer = server.toLowerCase();
    if (resolveCache.has(lowerServer)) {
      const cached = resolveCache.get(lowerServer);
      return cached === null ? server : cached;
    }

    const seen = new Set();
    let current = lowerServer;
    let resolved = null;
    while (!seen.has(current)) {
      seen.add(current);
      const entry = findHost(current);
      const target = entry && targetOf(entry[1]);
      if (!target) break;
      resolved = target;
      current = target.toLowerCase();
    }
    resolveCache.set(lowerServer, resolved);
    return resolved === null ? server : resolved;
  };

  return proxies.map((proxy) => {
    if (typeof proxy.server !== 'string') return proxy;
    const server = resolve(proxy.server);
    return server === proxy.server ? proxy : { ...proxy, server };
  });
}

/**
 * 构建脚本拥有的 DNS 与 hosts，并按机场 hosts 映射改写节点 server。
 * 输入配置中除节点及用于改写节点地址的 hosts 映射外，其余设置都不进入输出。
 * hosts改写条件（满足任意一个条件即可）：
 * 1. proxy-server-nameserver 有且仅有一个 DNS 并且该 DNS 包含非空的 listen 值
 * 2. proxy-server-nameserver 有且仅有一个 DNS 并且该 DNS 包含 127.0.0.1 并且 listen 包含 0.0.0.0
 */
function buildDnsAndHostsConfig(config, filteredProxies) {
  const minimalModeEnabled = ruleOptionsEnable.极简分流;

  const originalDnsConfig = config.dns || {};

  const proxyServerNameservers = originalDnsConfig['proxy-server-nameserver'] || [];
  const listenValue = originalDnsConfig['listen'];

  const shouldRewriteByHosts =
    proxyServerNameservers.length === 1 &&
    typeof listenValue === 'string' &&
    listenValue.length > 0 &&
    (proxyServerNameservers.some((dns) => String(dns).toLowerCase().includes(listenValue.toLowerCase())) ||
      (listenValue.includes('0.0.0.0') &&
        proxyServerNameservers.some((dns) => String(dns).toLowerCase().includes('127.0.0.1'))));

  const mappedProxies = shouldRewriteByHosts ? applyHostsToProxies(filteredProxies, config.hosts) : filteredProxies;

  const defaultNameserverGroup =
    !minimalModeEnabled && ruleOptionsEnable[autoSelectExMainlandHongKongOptionName]
      ? autoSelectExMainlandHongKongGroupName
      : '默认代理';

  const dns = {
    enable: true,
    ipv6: true,
    'use-hosts': true,
    'cache-algorithm': 'lru',
    'cache-max-size': 1,
    'use-system-hosts': true,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/15',
    'fake-ip-range6': '2001:2::1/48',
    'fake-ip-filter': ['rule-set:private', 'rule-set:fakeip_filter', ...appleRealIpEndpoints],
    'default-nameserver': [...defaultDNS],
    'proxy-server-nameserver': [...proxyServerDNS],
    'proxy-server-nameserver-policy': {},
    nameserver: dnsForGroup(defaultNameserverGroup),
    'nameserver-policy': {
      'rule-set:private': 'system',
    },
    // 显式直连域名规则使用国内加密 DNS；未命中显式 policy 的普通查询走默认国外 DNS。
  };

  const hosts = {
    'dns.alidns.com': ['223.5.5.5', '223.6.6.6'],
    'doh.pub': ['1.12.12.12', '120.53.53.53'],
    'cloudflare-dns.com': ['1.1.1.1', '1.0.0.1'],
    'dns.google': ['8.8.8.8', '8.8.4.4'],

    // 解决谷歌商店无法下载的问题
    'services.googleapis.cn': 'services.googleapis.com',

    // 屏蔽哔哩哔哩PCDN，解决访问视频/直播卡顿问题
    '+.mcdn.bilivideo.com': ['0.0.0.0'],
    '+.mcdn.bilivideo.cn': ['0.0.0.0'],
    '+.edge.mountaintoys.cn': ['0.0.0.0'],
    '+.h2.smtcdns.net': ['0.0.0.0'],
  };

  return { dns, hosts, proxies: mappedProxies };
}

// --- 主入口 ---

/**
 * 主入口：覆写机场订阅配置，生成完整 mihomo 配置
 */
function main(config) {
  const newConfig = {};

  const classificationCache = new Map();
  const filteredProxies = filterAndNormalizeProxies(config, classificationCache);

  const { customProxies, customProxyNames, customGroup } = buildCustomizeGroups(
    filteredProxies,
    customizeProxies,
    classificationCache,
  );

  const generatedRegionGroups = ruleOptionsEnable.极简分流
    ? buildMinimalServiceRegionGroups(filteredProxies, customProxies, classificationCache)
    : buildRegionGroups(filteredProxies, customProxies, classificationCache);

  const {
    globalGroup,
    functionalGroups,
    functionalRules,
    functionalIpRules,
    priorityRules,
    finalRuleProviders,
    chainGroup,
    directGroup,
  } = buildFunctionalGroups(filteredProxies, generatedRegionGroups, { customProxyNames, customGroup });

  const { dns, hosts, proxies: mappedProxies } = buildDnsAndHostsConfig(config, filteredProxies);

  newConfig['dns'] = dns;
  newConfig['hosts'] = hosts;
  newConfig['mixed-port'] = 7890;
  newConfig['allow-lan'] = true;
  newConfig['ipv6'] = true;
  newConfig['mode'] = 'rule';
  newConfig['log-level'] = 'info';
  newConfig['bind-address'] = '*';
  newConfig['unified-delay'] = true;
  newConfig['tcp-concurrent'] = true;
  newConfig['disable-keep-alive'] = true;
  newConfig['find-process-mode'] = 'strict';

  newConfig['profile'] = {
    'store-selected': true,
    'store-fake-ip': true,
  };

  newConfig['ntp'] = {
    enable: true,
    'write-to-system': false,
    server: 'ntp.aliyun.com',
    port: 123,
    interval: 60,
  };

  newConfig['tun'] = {
    enable: true,
    stack: 'mips',
    'auto-route': true,
    'strict-route': true,
    'auto-redirect': true,
    'auto-detect-interface': true,
    'dns-hijack': ['any:53', 'tcp://any:53'],
  };

  newConfig['proxies'] = [...mappedProxies, ...customProxies, ...directProxies];
  newConfig['proxy-groups'] = [
    globalGroup,
    ...functionalGroups,
    ...(customGroup ? [customGroup] : []),
    ...(chainGroup ? [chainGroup] : []),
    directGroup,
    ...generatedRegionGroups,
  ];
  newConfig['rule-providers'] = finalRuleProviders;

  const appleIpRules = functionalIpRules.filter((rule) => rule.startsWith('RULE-SET,apple_ip,'));
  const otherFunctionalIpRules = functionalIpRules.filter((rule) => !rule.startsWith('RULE-SET,apple_ip,'));
  const domesticServiceRules = buildDomesticServiceRoutes(finalRuleProviders);
  // Keep Apple and service-specific IP exits ahead of the generic CN IP fallback; private IPs remain direct first.
  newConfig['rules'] = [
    ...priorityRules,
    ...prefixRules,
    ...(ruleOptionsEnable.拦截代理QUIC ? blockForeignQuic : []),
    ...functionalRules,
    ...domesticServiceRules,
    geolocationCnRule,
    cnSuffixDirectRule,
    'RULE-SET,category-stun,默认代理',
    'RULE-SET,geolocation-!cn,默认代理',
    ...appleIpRules,
    'RULE-SET,private_ip,直连,no-resolve',
    ...otherFunctionalIpRules,
    'RULE-SET,cn_ip,直连,no-resolve',
    `MATCH,${ruleOptionsEnable.极简分流 ? '默认代理' : '漏网之鱼'}`,
  ];

  return finalizeMyProxyRules(newConfig);
}

/**
 * 配置收尾处理：统一补齐项目 DNS、Apple 例外与流量偏好配置。
 * 静态 YAML 由 tools/build.js 调用同一个 main() 生成，确保规则来源一致。
 */
function applyRuntimeConfigOptions(config, options) {
  for (const [key, value] of Object.entries(options)) {
    if (typeof value !== 'boolean') throw new Error(`配置项 ${key} 必须为 true 或 false（不是 ture 或字符串）`);
  }
  config['allow-lan'] = options.局域网访问;
  config['bind-address'] = options.局域网访问 ? '*' : '127.0.0.1';
  config.ipv6 = options.IPv6;
  config.dns.ipv6 = options.IPv6;
  config.tun.enable = options.TUN;
  config.tun.stack = 'mips';
  // 补充未经过内置 DNS/Fake-IP 映射的连接域名，并将纯 IP 目标改写为嗅探域名交由出口重新解析。
  config.sniffer = {
    enable: options.域名嗅探,
    'force-dns-mapping': true,
    'parse-pure-ip': true,
    'override-destination': true,
    sniff: {
      HTTP: { ports: [80, '8080-8880'] },
      TLS: { ports: [443, 8443] },
      QUIC: { ports: [443, 8443] },
    },
  };
  // DNS 仅监听回环；客户端/路由器需将本机 DNS 导入 TUN。
  config.dns.listen = '127.0.0.1:1053';
  config.dns['prefer-h3'] = false;
  config.dns['respect-rules'] = false; // 每个 DNS 显式选出口，避免解析节点时递归进入代理
}

function prioritizePreferredGroups(config) {
  const groups = config['proxy-groups'];
  // 首项决定首次加载时的选择；已有客户端选择缓存仍由内核保留。
  for (const [name, preferred] of [
    ['GLOBAL', unitedStatesRegion.name],
    ['默认代理', autoSelectExMainlandHongKongGroupName],
  ]) {
    const group = groups.find((entry) => entry.name === name);
    if (!group || !groups.some((entry) => entry.name === preferred)) continue;
    group.proxies = [preferred, ...group.proxies.filter((entry) => entry !== preferred)];
    delete group['default-selected'];
  }
}

function selectEligibleRegionProxies(groups) {
  const candidates = groups
    .filter((entry) => entry.type === 'select' && serviceRegionNames.has(entry.name))
    .map((entry) => entry.name);
  const selected = candidates.includes(unitedStatesRegion.name) ? unitedStatesRegion.name : candidates[0];
  return selected ? [selected, ...candidates.filter((candidate) => candidate !== selected)] : ['REJECT'];
}

function sameDnsResolvers(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function applyAppleRouting(config, options) {
  const groups = config['proxy-groups'];
  const specialRules = [];
  const specialIpRules = [];
  const eligibleRegionNames = groups
    .filter((entry) => entry.type === 'select' && serviceRegionNames.has(entry.name))
    .map((entry) => entry.name);
  // 极简模式仅关闭常规服务组；安全与 Apple 精细例外仍由各自开关控制。
  for (const { name, option, domains } of appleEndpointDefinitions) {
    if (!options[option]) continue;
    let group = groups.find((g) => g.name === name);
    if (!group) {
      group = {
        ...selectBaseOption,
        name,
        icon: `${iconBaseUrl}common/Apple.svg`,
        proxies:
          name === appleAiGroupName
            ? ['REJECT']
            : name === appleProxyGroupName
              ? ['默认代理', ...eligibleRegionNames, '直连']
              : ['默认代理', '直连'],
      };
      groups.splice(1, 0, group);
      groups[0].proxies.push(name);
    }
    if (name === appleAiGroupName) {
      // Keep Apple AI/Siri on eligible country groups; prefer the US when available.
      group.proxies = selectEligibleRegionProxies(groups);
      delete group['default-selected'];
    } else {
      // Default first item is the US candidate group; do not rely on default-selected support.
      const selected = group.proxies.includes(unitedStatesRegion.name) ? unitedStatesRegion.name : '默认代理';
      group.proxies = [selected, ...group.proxies.filter((p) => p !== selected)];
      delete group['default-selected'];
    }
    for (const domain of domains) {
      specialRules.push(
        `${domain.startsWith('+.') ? 'DOMAIN-SUFFIX' : 'DOMAIN'},${domain.replace(/^\+\./, '')},${name}`,
      );
    }
    if (name === appleAiGroupName) {
      config['rule-providers'].apple_siri_regex = appleSiriRegexRuleProvider;
      specialRules.push(`RULE-SET,apple_siri_regex,${appleAiGroupName}`);
      if (!config.dns['fake-ip-filter'].includes('rule-set:apple_siri_regex')) {
        config.dns['fake-ip-filter'].push('rule-set:apple_siri_regex');
      }
    }
    if (name === appleProxyGroupName) {
      // TV+ 动态规则与其他产品共享同一地区选择器。
      config['rule-providers'].apple_proxy = appleProxyRuleProvider;
      if (!config['rule-providers'].apple_ip) {
        config['rule-providers'].apple_ip = appleIpRuleProvider;
        specialIpRules.push(`RULE-SET,apple_ip,${appleProxyGroupName},no-resolve`);
      }
      config['rule-providers'].apple_tv = appleTvRuleProvider;
      specialRules.push(`RULE-SET,apple_tv,${appleProxyGroupName}`);
      if (options.Apple媒体代理) {
        config['rule-providers'].apple_media_regex = appleMediaRegexRuleProvider;
        specialRules.push(`RULE-SET,apple_media_regex,${appleProxyGroupName}`);
      }
    }
  }
  if (options.Apple其他服务 && !groups.some((group) => group.name === appleOtherDnsEgressGroupName)) {
    groups.splice(1, 0, {
      ...selectBaseOption,
      name: appleOtherDnsEgressGroupName,
      icon: `${iconBaseUrl}common/Apple.svg`,
      proxies: selectEligibleRegionProxies(groups),
    });
    groups[0].proxies.push(appleOtherDnsEgressGroupName);
  }
  // Exact shared Apple endpoints assigned to Other Apple Service. In minimal output the
  // regular service group may be omitted; DNS policy is derived from these same route targets.
  if (options.Apple其他服务) {
    let group = groups.find((entry) => entry.name === appleOtherGroupName);
    if (!group) {
      group = {
        ...selectBaseOption,
        name: appleOtherGroupName,
        icon: `${iconBaseUrl}common/Apple.svg`,
        proxies: ['默认代理', '直连'],
      };
      groups.splice(1, 0, group);
      groups[0].proxies.push(appleOtherGroupName);
    }
    for (const domain of appleOtherExactEndpoints) specialRules.push(`DOMAIN,${domain},${appleOtherGroupName}`);
  }
  for (const [name, enabled] of [[appleOtherGroupName, options.Apple其他默认直连]]) {
    const group = groups.find((g) => g.name === name);
    if (group && enabled) {
      group.proxies = ['直连', ...group.proxies.filter((p) => p !== '直连')];
      delete group['default-selected'];
    }
  }
  if (options.Apple下载直连) {
    // Apple 官方软件/资源 CDN；这些域名是共享资源端点，不能只按 AI 模型识别。
    for (const domain of ['gdmf.apple.com', 'mesu.apple.com', 'updates.cdn-apple.com', 'assets.cdn-apple.com']) {
      specialRules.push(`DOMAIN,${domain},直连`);
    }
  }
  if (options[appleProxyGroupName]) {
    // 宽泛 AppleProxy 成员最后匹配，保留上方 Siri、共享 iCloud 与下载域名的精确边界。
    specialRules.push(`RULE-SET,apple_proxy,${appleProxyGroupName}`);
  }

  return { specialRules, specialIpRules };
}

function applyDnsPolicies(config, options, { specialRules, specialIpRules }) {
  const groups = config['proxy-groups'];
  const groupByName = new Map(groups.map((group) => [group.name, group]));
  const dnsWhitelistProviders = {
    dns_domestic_cdn: {
      type: 'http',
      behavior: 'classical',
      format: 'text',
      interval: 86400,
      url: 'https://ruleset.skk.moe/Clash/non_ip/domestic_cdn.txt',
      path: './ruleset/dns_domestic_cdn.list',
    },
    dns_microsoft_cdn: {
      type: 'http',
      behavior: 'classical',
      format: 'text',
      interval: 86400,
      url: 'https://ruleset.skk.moe/Clash/non_ip/microsoft_cdn.txt',
      path: './ruleset/dns_microsoft_cdn.list',
    },
  };

  // 默认加载直连 CDN 规则集（路由直连与国内 DNS 一体化）。
  Object.assign(config['rule-providers'], dnsWhitelistProviders);

  // 直连目标使用国内 DNS；代理服务的 DNS 请求经对应路由组建立连接。
  // Other Apple Service 的 DNS 例外明确使用 Siri 的选择器。
  const rejectTargets = new Set(['REJECT', 'REJECT-DROP', 'PASS']);
  const dnsForRoute = (target, dnsEgressGroupName, dnsEgressGroup) => {
    if (target === '直连') return [...chinaDNS];
    if (dnsEgressGroup?.proxies.length && dnsEgressGroup.proxies.every((proxy) => rejectTargets.has(proxy))) {
      // Ordinary Apple traffic remains directly usable when there is no eligible Siri region.
      if (target === appleOtherGroupName && options.Apple其他默认直连) return [...chinaDNS];
      return 'rcode://name_error';
    }
    return dnsForGroup(dnsEgressGroupName);
  };
  if (!options.PCDN拦截) {
    for (const name of Object.keys(config.hosts))
      if (Array.isArray(config.hosts[name]) && config.hosts[name][0] === '0.0.0.0') delete config.hosts[name];
  }
  let dnsOutbound = '内置DNS';
  const usedNames = new Set([...config.proxies, ...groups].map((entry) => entry.name));
  while (usedNames.has(dnsOutbound)) dnsOutbound = `my-${dnsOutbound}`;
  config.proxies.push({ name: dnsOutbound, type: 'dns' });
  const safetyRules = [`DST-PORT,53,${dnsOutbound}`, 'DST-PORT,853,REJECT'];
  const directPrefixCdnRules = ['RULE-SET,dns_microsoft_cdn,直连'];
  const directDomesticCdnRules = ['RULE-SET,dns_domestic_cdn,直连'];

  const specialRuleSet = new Set(specialRules);
  const specialIpRuleSet = new Set(specialIpRules);
  const allPrefixRuleSet = new Set(prefixRules);
  const domesticPrefixRuleSet = new Set(prefixRules.slice(1));
  const remainingRules = [];
  for (const rule of config.rules) {
    if (specialRuleSet.has(rule) || specialIpRuleSet.has(rule)) continue;
    if (
      !options.国内服务优先直连 &&
      (domesticPrefixRuleSet.has(rule) || rule === geolocationCnRule || rule === cnSuffixDirectRule)
    )
      continue;
    if (rule === 'RULE-SET,microsoft,Microsoft') {
      remainingRules.push('AND,((RULE-SET,microsoft),(NOT,((RULE-SET,dns_microsoft_cdn)))),Microsoft');
      continue;
    }
    if (rule === 'RULE-SET,geolocation-!cn,默认代理') {
      remainingRules.push('AND,((RULE-SET,geolocation-!cn),(NOT,((RULE-SET,dns_domestic_cdn)))),默认代理');
      continue;
    }
    remainingRules.push(rule);
  }
  let prefixInsertIndex = 0;
  for (let i = 0; i < remainingRules.length; i++) {
    if (allPrefixRuleSet.has(remainingRules[i])) prefixInsertIndex = i + 1;
  }
  remainingRules.splice(prefixInsertIndex, 0, ...directPrefixCdnRules);
  if (directDomesticCdnRules.length) {
    const domesticInsertIndex = remainingRules.findIndex(
      (rule) =>
        rule.includes('RULE-SET,domestic_') || rule === geolocationCnRule || rule.includes('RULE-SET,geolocation-!cn'),
    );
    const targetIndex = domesticInsertIndex >= 0 ? domesticInsertIndex : remainingRules.length;
    remainingRules.splice(targetIndex, 0, ...directDomesticCdnRules);
  }
  if (specialIpRules.length) {
    const privateIpIndex = remainingRules.indexOf('RULE-SET,private_ip,直连,no-resolve');
    const cnIpIndex = remainingRules.indexOf('RULE-SET,cn_ip,直连,no-resolve');
    const insertIndex = privateIpIndex >= 0 ? privateIpIndex : cnIpIndex >= 0 ? cnIpIndex : remainingRules.length;
    remainingRules.splice(insertIndex, 0, ...specialIpRules);
  }
  config.rules = [...safetyRules, ...specialRules, ...remainingRules];

  const domainRuleSetEgress = new Map();
  const literalDomainEgress = new Map();
  for (const rule of config.rules) {
    const ruleSetMatch =
      /^RULE-SET,([^,]+),([^,]+)(?:,|$)/.exec(rule) ||
      /^AND,\(\(RULE-SET,([^,)]+)\),\(NOT,\(\(RULE-SET,[^,)]+\)\)\)\),([^,]+)(?:,|$)/.exec(rule);
    if (ruleSetMatch) {
      const [, providerName, target] = ruleSetMatch;
      const provider = config['rule-providers'][providerName];
      if (!provider || (provider.behavior !== 'domain' && provider.behavior !== 'classical')) continue;
      if (rejectTargets.has(target)) continue;
      if (!domainRuleSetEgress.has(providerName)) domainRuleSetEgress.set(providerName, target);
      continue;
    }
    const literalMatch = /^(DOMAIN|DOMAIN-SUFFIX),([^,]+),([^,]+)(?:,|$)/.exec(rule);
    if (literalMatch) {
      const [, type, domain, target] = literalMatch;
      if (rejectTargets.has(target)) continue;
      const policyKey = type === 'DOMAIN-SUFFIX' ? `+.${domain}` : domain;
      // 广域 +.cn 后缀不前置到显式域名区，避免抢先覆盖广告/HTTPDNS/服务 rule-set policy；在下方 geolocation-cn 之后追加。
      if (policyKey === '+.cn') continue;
      if (!literalDomainEgress.has(policyKey)) literalDomainEgress.set(policyKey, target);
    }
  }

  const orderedDnsPolicyEntries = [];
  const existingDnsPolicy = config.dns['nameserver-policy'] || {};
  const literalEntries = new Map();
  const extraRuleSetEntries = new Map();
  for (const [key, value] of Object.entries(existingDnsPolicy)) {
    if (key.startsWith('rule-set:')) {
      if (key !== 'rule-set:private') extraRuleSetEntries.set(key, value);
    } else {
      literalEntries.set(key, value);
    }
  }
  // 显式域名规则的 DNS policy 与目标一致：直连使用国内加密 DNS，服务组经同一选择组查询 DNS。
  // DOMAIN-KEYWORD/REGEX 通过 classical rule-set 匹配相同域名范围。
  for (const [policyKey, target] of literalDomainEgress) {
    if (target === '直连') {
      literalEntries.set(policyKey, [...chinaDNS]);
      continue;
    }
    if (!groupByName.has(target)) continue;
    const dnsEgressGroupName = target === appleOtherGroupName ? appleOtherDnsEgressGroupName : target;
    const dnsEgressGroup = groupByName.get(dnsEgressGroupName);
    literalEntries.set(policyKey, dnsForRoute(target, dnsEgressGroupName, dnsEgressGroup));
  }
  // 禁用 Firefox 等浏览器的内置 DoH 旁路（返回 NXDOMAIN 迫使其回退到系统/TUN DNS）。
  literalEntries.set('use-application-dns.net', 'rcode://name_error');
  orderedDnsPolicyEntries.push(...literalEntries.entries());

  // Mihomo 按 policy 顺序匹配：显式主机/后缀 → private / apple_tv / apple_proxy / 广告 / 前置直连与下载 CDN / 明确海外服务集合 → 国内 CDN / 国内厂商集合 → 广域 geolocation 集合。
  if (Object.hasOwn(existingDnsPolicy, 'rule-set:private')) {
    orderedDnsPolicyEntries.push(['rule-set:private', existingDnsPolicy['rule-set:private']]);
  }
  const resolveProviderDns = (providerName, target) => {
    // Microsoft 与 FCM 默认走代理（Fake-IP 透传远端解析），手动切换为直连时使用大陆 DoH。
    if (
      providerName === 'apple_cn' ||
      providerName === 'geolocation-cn' ||
      providerName === 'microsoft' ||
      providerName === 'googlefcm'
    ) {
      return [...chinaDNS];
    }
    const dnsEgressGroupName = target === appleOtherGroupName ? appleOtherDnsEgressGroupName : target;
    return dnsForRoute(target, dnsEgressGroupName, groupByName.get(dnsEgressGroupName));
  };
  const addedRuleSetKeys = new Set(['rule-set:private']);
  const pushRuleSetPolicy = (key, value) => {
    addedRuleSetKeys.add(key);
    orderedDnsPolicyEntries.push([key, value]);
  };
  for (const priorityProvider of [
    'apple_siri_regex',
    'apple_media_regex',
    'apple_tv',
    'apple_proxy',
    'category-ads-all',
    'httpdns',
  ]) {
    if (domainRuleSetEgress.has(priorityProvider)) {
      pushRuleSetPolicy(
        `rule-set:${priorityProvider}`,
        resolveProviderDns(priorityProvider, domainRuleSetEgress.get(priorityProvider)),
      );
    }
  }
  for (const [providerName, target] of domainRuleSetEgress) {
    if (
      addedRuleSetKeys.has(`rule-set:${providerName}`) ||
      providerName === 'dns_domestic_cdn' ||
      providerName === 'category-stun' ||
      providerName.startsWith('domestic_') ||
      providerName.startsWith('geolocation-')
    ) {
      continue;
    }
    pushRuleSetPolicy(`rule-set:${providerName}`, resolveProviderDns(providerName, target));
  }
  for (const [key, value] of extraRuleSetEntries) {
    if (!addedRuleSetKeys.has(key)) pushRuleSetPolicy(key, value);
  }
  if (config['rule-providers'].dns_domestic_cdn) {
    pushRuleSetPolicy('rule-set:dns_domestic_cdn', [...chinaDNS]);
  }
  // Domestic vendor DNS policies follow the domestic-service route switch: all 13 paired sets
  // use the same AND NOT predicate as routing.
  for (const source of domesticServiceModules) {
    const providerName = `domestic_${source}_dns`;
    if (config['rule-providers'][providerName]) pushRuleSetPolicy(`rule-set:${providerName}`, [...chinaDNS]);
  }
  // geolocation-cn is the existing mainland domain DNS match set. Keep its policy even
  // when the domestic-route switch removes its routing rule; specific policies must win.
  if (config['rule-providers']['geolocation-cn']) {
    pushRuleSetPolicy('rule-set:geolocation-cn', [...chinaDNS]);
  }
  if (options.国内服务优先直连) {
    orderedDnsPolicyEntries.push(['+.cn', [...chinaDNS]]);
  }
  if (domainRuleSetEgress.has('category-stun')) {
    pushRuleSetPolicy(
      'rule-set:category-stun',
      resolveProviderDns('category-stun', domainRuleSetEgress.get('category-stun')),
    );
  }
  if (domainRuleSetEgress.has('geolocation-!cn')) {
    pushRuleSetPolicy(
      'rule-set:geolocation-!cn',
      resolveProviderDns('geolocation-!cn', domainRuleSetEgress.get('geolocation-!cn')),
    );
  }

  const compactDnsPolicyEntries = [];
  for (const [key, resolvers] of orderedDnsPolicyEntries) {
    const previous = compactDnsPolicyEntries[compactDnsPolicyEntries.length - 1];
    if (
      key.startsWith('rule-set:') &&
      previous?.[0].startsWith('rule-set:') &&
      sameDnsResolvers(previous[1], resolvers)
    ) {
      previous[0] += `,${key.slice('rule-set:'.length)}`;
    } else {
      compactDnsPolicyEntries.push([key, resolvers]);
    }
  }
  config.dns['nameserver-policy'] = Object.fromEntries(compactDnsPolicyEntries);
}

function validateStrictDnsSettings(config, options) {
  const groups = config['proxy-groups'];
  if (options.严格DNS校验) {
    config.dns['use-system-hosts'] = false;
    // 不向系统 DNS 查询 LAN 名称；局域网名称通过用户 hosts 显式维护。
    config.dns['nameserver-policy']['rule-set:private'] = 'rcode://success';
    const validOutbounds = new Set(['DIRECT', ...groups.map((group) => group.name)]);
    const encrypted = (value, field) => {
      for (const server of Array.isArray(value) ? value : [value]) {
        if (typeof server !== 'string') throw new Error(`严格DNS校验：${field} 必须使用加密 DNS`);
        if (/^rcode:\/\/(success|name_error|refused)$/i.test(server)) continue;
        const parts = server.split('#');
        const [rawOutbound, ...parameters] = parts[1]?.split('&') || [];
        let outbound = rawOutbound;
        if (rawOutbound) {
          try {
            outbound = decodeURIComponent(rawOutbound);
          } catch {
            throw new Error(`严格DNS校验：脚本生成的 ${field} 含不受支持或明文 DNS；严格模式不会降级。`);
          }
        }
        if (
          parts.length > 2 ||
          !/^(https|tls|quic):\/\/[^\s#@]+$/i.test(parts[0]) ||
          /skip-cert-verify|@/i.test(server) ||
          (parts.length === 2 && !validOutbounds.has(outbound)) ||
          parameters.some((parameter) => !/^(?:name-cert-verify=[a-z0-9.-]+|h3=true)$/i.test(parameter))
        )
          throw new Error(`严格DNS校验：脚本生成的 ${field} 含不受支持或明文 DNS；严格模式不会降级。`);
      }
    };
    for (const field of ['default-nameserver', 'proxy-server-nameserver', 'nameserver', 'direct-nameserver'])
      encrypted(config.dns[field] || [], field);
    for (const field of ['nameserver-policy', 'proxy-server-nameserver-policy'])
      for (const [domain, server] of Object.entries(config.dns[field] || {})) encrypted(server, `${field}.${domain}`);
    // 没有 fallback / system / 明文启动 DNS；直连解析遵守 Apple/AI 的专属 policy。
    delete config.dns.fallback;
    delete config.dns['fallback-filter'];
  }
}

function cleanupUnusedRuleProviders(config) {
  // 规则依赖按实际引用保留；DNS 使用的规则集也必须保留（不能只扫描 rules）。
  const references = collectRuleSetReferences([config.rules, config.dns]);
  const pending = [...references];
  while (pending.length) {
    const provider = config['rule-providers'][pending.pop()];
    if (provider?.type !== 'inline') continue;
    for (const dependency of collectRuleSetReferences(provider.payload)) {
      if (references.has(dependency)) continue;
      references.add(dependency);
      pending.push(dependency);
    }
  }
  for (const key of Object.keys(config['rule-providers'])) {
    if (!references.has(key)) delete config['rule-providers'][key];
  }
}

function finalizeMyProxyRules(config) {
  const options = ruleOptionsEnable;
  applyRuntimeConfigOptions(config, options);
  prioritizePreferredGroups(config);
  const appleRules = applyAppleRouting(config, options);
  applyDnsPolicies(config, options, appleRules);
  validateStrictDnsSettings(config, options);
  cleanupUnusedRuleProviders(config);
  return config;
}

const ruleSetRouteReference = /\bRULE-SET\s*,\s*([A-Za-z0-9_!@.-]+)/gi;
const ruleSetDnsReference = /\brule-set:([A-Za-z0-9_!@.-]+(?:,[A-Za-z0-9_!@.-]+)*)/gi;

/** Collect provider references from rules and DNS without serializing their full structures. */
function collectRuleSetReferences(value, references = new Set()) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(ruleSetRouteReference)) references.add(match[1]);
    for (const match of value.matchAll(ruleSetDnsReference))
      for (const name of match[1].split(',')) references.add(name);
    return references;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectRuleSetReferences(entry, references);
    return references;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      collectRuleSetReferences(key, references);
      collectRuleSetReferences(entry, references);
    }
  }
  return references;
}
