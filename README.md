# myProxyRules

以 Mihomo 为唯一功能源和主支持客户端，提供覆写脚本、全量静态配置及 Stash 可用的 Mihomo 风格配置。Surge、Shadowrocket 和 Quantumult X 的原生配置作为独立兼容入口提供，规则与 DNS 覆盖差异见[多客户端兼容性说明](docs/client-compatibility.md)。项目从 [AIsouler/MyClash 全量版](https://github.com/AIsouler/MyClash/commit/4861619be366c7bacabfed6d581bb8c450de1ca1) 起步并独立维护。地区节点分组、倍率与家宽分类、常见服务分流是基础能力；本仓库重点维护以下功能。

开发与后续更新遵守 [模块化与动态规则集开发原则](docs/development-principles.md) 及 [国内 DNS 白名单维护原则](docs/dns-whitelist.md)。

## 项目重点

- **Apple 精细分流**：将 Apple Intelligence / Siri、`AppleProxy` 动态集合与产品入口、其他 Apple 服务分组。Siri 组默认美国，没有合格地区候选时拒绝连接；`AppleProxy` 初始选择美国且可切换直连；其他 Apple 服务默认直连。共享端点和 DNS policy 的细节见 [Apple 路由说明](docs/apple-routing.md)。
- **DNS policy 与出口联动**：明确路由到 `直连` 的域名规则与动态域名规则集使用阿里 DoH 与腾讯 DoH；代理服务的 DNS 请求经对应服务组选择出口。`geolocation-cn`、国内 CDN、Microsoft 下载、Steam 国内节点及国内服务集合也使用国内加密 DNS；11 组国内服务集合按 `domestic AND NOT domestic_noncn`，百度按完整集合匹配，厂商 policy 随 `国内服务优先直连` 开关启停。仅因 IP 兜底规则直连或未命中明确域名 policy 的查询仍使用默认国外 DNS。普通默认查询使用 Cloudflare 强制 DoH-H3 与 Google DoH；代理节点域名使用阿里/腾讯 DoH，经直连建立连接，避免节点启动依赖境外 DNS。启动解析单独使用阿里/腾讯 IP DoH。地区服务保持专属解析出口。严格模式不接受生成配置里的明文或不安全 DNS，也不静默回退。它描述的是配置行为，不代表所有设备流量都已被接管。
- **机场配置只接管节点**：展开订阅时处理节点；机场 DNS、路由、策略组和其他非节点设置由脚本重建。机场 hosts 只在满足节点改写条件时用于改写节点 server，不复制到结果配置。
- **纯 IP 域名识别**：从支持的 HTTP Host、TLS SNI 与 QUIC 元数据补充路由所需域名；不解密 HTTPS，也不改写目标地址。
- **Mihomo 功能源与兼容配置**：`Script/mihomoScript.js` 管理规则和选项，`Config/mihomoConfig.yaml` 由 GitHub Actions 构建并回写；Stash 沿用 Mihomo provider、MRS 与 DNS policy。Surge、Shadowrocket 和 Quantumult X 原生配置由适配器从同一配置对象生成。YAML 中的 `x-myProxyRules` 扩展字段供构建工具读取。
- **自动选择排除组**：开关 `排除大陆香港自动选` 控制 `自动选择ex(大陆&香港)` 策略组；该组按节点名称排除大陆和香港候选，保留台湾节点。
- **默认控制面最小化**：发布配置不启动外部控制 API，也不自动下载 Web 控制面；需要管理界面时由本地客户端单独配置并保护 API 密钥。

## 常规能力

提供 26 个地区节点组、倍率和家宽节点分类、AI / Google / YouTube / Microsoft 等常见服务分流，以及手动选择、测速、负载均衡和链式代理等配置选项。
私网 IP 使用 `直连,no-resolve`；Google、Telegram、TikTok、Twitter、Facebook/Meta IP 使用代理出口及 `no-resolve`，关闭服务组或启用极简模式时改用 `默认代理`。Apple、Microsoft、Steam、Netflix、Spotify IP 也使用 `no-resolve` 并保留原有出口组；`cn_ip` 不加该参数，保留末端解析直连兜底。AI 当前使用域名集合，没有独立 IP 集合。
`GLOBAL` 首次默认选择 `美国`，`默认代理` 首次默认选择 `自动选择ex(大陆&香港)`；仅在相应候选组存在时生效，已有客户端选择缓存优先。
阿里、百度、B站、字节、中国移动/电信/联通、华为云、京东、网易、腾讯、小米提供国内服务模块，连接规则和厂商 DNS policy 统一受默认开启的 `国内服务优先直连` 控制。模块动态使用 Bett 厂商集合，有同源 `@!cn` 海外子集时，路由和 DNS 都排除该子集；百度当前没有配套子集，因此完整百度集合使用国内加密 DNS。阿里/淘宝、腾讯云、火山引擎等子品牌由上层厂商集合覆盖，不重复加载；未标注海外的共享域名仍依赖上游分类质量。
测速域名 `cp.cloudflare.com` 的路由及加密 DNS policy 指向 `默认代理`；测速请求本身由内核通过被测节点发起。

DNS policy 不强制修改连接路由。明确直连的域名规则按其规则匹配使用阿里/腾讯 DoH；代理服务的 policy 经对应服务组选择 DNS 出口。`geolocation-cn` 成员始终使用国内 DoH；国内服务的厂商 policy 随 `国内服务优先直连` 开关启停。关闭单个 DNS 白名单开关只撤销该白名单授权，其他集合或专项例外仍可覆盖同一域名。Apple 精确 CDN 与无合格 Siri 地区时的普通 Apple 解析例外保持原有行为。普通业务查询使用 Cloudflare DoH-H3 与 Google DoH；节点域名使用阿里/腾讯 DoH 并经直连解析，避免代理可用前依赖境外 DNS。`default-nameserver` 启动解析使用阿里/腾讯 IP DoH。这不代表完全不向国内解析器发送查询。来源、重叠处理和边界见 [规则来源说明](docs/rule-sources.md)。

## Mihomo 主支持入口

Mihomo 是本项目的主要支持客户端，功能源为覆写脚本和全量静态 YAML。Stash 使用同一 Mihomo 配置模型和 MRS provider，放在主支持入口下提供：

| Mihomo / Stash 产物 | Raw 下载 | CDN 下载 |
| --- | --- | --- |
| Mihomo 全量覆写脚本 | [mihomoScript.js](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Script/mihomoScript.js) | [mihomoScript.cdn.js](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Script/mihomoScript.cdn.js) |
| Mihomo 全量静态配置 | [mihomoConfig.yaml](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/mihomoConfig.yaml) | [mihomoConfig.cdn.yaml](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/mihomoConfig.cdn.yaml) |
| Stash Mihomo 风格配置 | [profile.yaml](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/stash/profile.yaml) | [profile.cdn.yaml](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/stash/profile.cdn.yaml) |

## 其他客户端原生配置

以下 profile 使用各自的配置与规则格式。客户端配置只含示例订阅 URL；请替换为对应应用支持的订阅格式。它们不会自动获得 Mihomo 的全部动态规则与 DNS 行为，具体覆盖范围和省略项见[多客户端兼容性说明](docs/client-compatibility.md)。

| 客户端 | Raw 配置 | CDN 配置 |
| --- | --- | --- |
| Surge | [profile.conf](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/surge/profile.conf) | [profile.cdn.conf](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/surge/profile.cdn.conf) |
| Shadowrocket | [profile.conf](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/shadowrocket/profile.conf) | [profile.cdn.conf](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/shadowrocket/profile.cdn.conf) |
| Quantumult X | [profile.conf](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/quantumultx/profile.conf) | [profile.cdn.conf](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/quantumultx/profile.cdn.conf) |

## 使用

支持 `main(config)` 的 Mihomo 脚本覆写客户端可直接导入上表中的全量覆写脚本。

静态配置可下载上表中的 YAML，填写 `proxy-providers.订阅.url` 后导入 Mihomo。静态 provider 由内核读取订阅，无法在构建时处理远端节点名称或机场 hosts。需要完整节点处理时，使用本地订阅展开模式，见[功能目录](docs/feature-matrix.md)。

静态 YAML 中的扩展开关不会由 Mihomo 内核执行。更改 `Config/mihomoConfig.yaml` 中的选项并推送后，GitHub Actions 会自动重新生成 Raw YAML 和带独立 CDN SHA-256 的 `Config/mihomoConfig.cdn.yaml`，同时更新 Stash 和其他客户端 profile。

GitHub Actions 每天定时验证并重生静态配置；脚本、配置开关、构建器或依赖锁文件变更时也会触发。只有生成内容变化且 Mihomo 行为与原生校验通过时，Action 才会提交更新后的 YAML、Stash 和其他客户端配置及 CDN 副本。也可在仓库的 Actions 页面手动运行 `Sync script and generate config`。

脚本和配置都由 GitHub Actions 生成 CDN 副本；Mihomo YAML 与客户端 profile 分别显示 Raw SHA-256 和 CDN SHA-256。Mihomo YAML CDN 入口直接链接 `mihomoConfig.cdn.yaml`。

## 边界

节点名称用于筛选地区候选，不代表节点的真实出口地区。Apple 共享域名可能由多个产品共用，网络规则不能按 HTTPS 路径拆分应用，也不决定账号或设备资格。

## 维护原则

后续 DNS、规则源和开关更新遵守 [国内 DNS 白名单维护原则](docs/dns-whitelist.md) 与 [仓库维护约定](AGENTS.md)：明确域名规则目标为 `直连` 时使用国内 DNS；仅因 IP 兜底而直连、未命中明确域名 policy 的查询仍使用默认国外 DNS，不配置通用 `direct-nameserver`。其他授权来自现有 `geolocation-cn`、受国内服务开关控制的厂商集合、独立 DNS 白名单和专项例外。客户端 HTTP provider 每日直接更新，上游成员不经本仓库 CI 筛选发布。

## 开发

当前开发和 CI 锁定 Node.js 24.19.0 与 npm 11.17.0。

```sh
npm ci
npm test
npm run check
npm run build:targets -- --target all
```

更多说明：[多客户端兼容性](docs/client-compatibility.md)、[DNS 白名单原则](docs/dns-whitelist.md)、[功能目录](docs/feature-matrix.md)、[Apple 路由](docs/apple-routing.md)、[动态规则来源](docs/rule-sources.md)、[节点处理测试](Test/README.md)。

可用 `./tools/npmw run diagnose -- --probe-domain gateway.icloud.com` 或 `--probe-ip 17.0.0.1` 在隔离的 Mihomo 回环环境中查看实际命中的规则与策略链；`--select 'Other Apple Service=美国'` 可模拟一次组内选择。诊断使用合成节点和本机下载的规则快照，所有出口终止在本地，不代表真实订阅当前选择、设备网络或 UDP 行为。

图标继续引用上游 SVG URL；相关 MIT 许可与署名见 [LICENSE](LICENSE)。
