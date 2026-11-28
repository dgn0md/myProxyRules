# myProxyRules

myProxyRules 以 **Mihomo** 为唯一功能源和主支持客户端，提供全量覆写脚本、静态配置及 Stash 兼容配置，并自动生成 Surge、Shadowrocket 与 Quantumult X 的原生兼容配置。项目最初基于 [AIsouler/MyClash](https://github.com/AIsouler/MyClash/commit/4861619be366c7bacabfed6d581bb8c450de1ca1)，现独立维护演进，不与其同步。

贡献与维护前请先阅读 [仓库维护约定](AGENTS.md)。

## 项目重点

- **Apple 精细分流**：按功能拆分为 `Siri Ai/Apple Intelligence`（Siri、Apple Intelligence、PCC 与中继/配置端点，默认美国，无合格地区候选时拒绝）、`AppleProxy`（产品入口、动态集合与 `apple_ip`，默认美国且可选直连）和 `Other Apple Service`（常规 Apple 服务默认直连，DNS 跟随 Siri 组）。详见 [Apple 路由说明](docs/apple-routing.md)。
- **DNS 与分流出口联动**：明确直连的域名、国内白名单与国内厂商集合走阿里/腾讯 DoH；代理服务的 DNS 查询经对应策略组出口解析；其余默认走 Cloudflare DoH-H3 与 Google DoH。不配置通用 `direct-nameserver`，严格模式下拒绝明文 DNS 与静默降级。详见 [国内 DNS 白名单原则](docs/dns-whitelist.md)。
- **机场配置只接管节点**：覆写或本地展开订阅时只读取并标准化节点信息（含按条件改写节点 hosts），机场的 DNS、路由、策略组与控制面设置全部丢弃并由脚本重建。
- **单一功能源，多客户端自动同步**：`Script/mihomoScript.js` 是唯一功能源；GitHub Actions 自动验证并生成 Mihomo 静态 YAML、CDN 副本与四种客户端原生配置。差异见 [多客户端兼容性](docs/client-compatibility.md)。
- **默认最小暴露面**：发布配置默认不开启外部控制 API、不自动下载 Web 面板，目标配置仅含示例订阅占位符。

## 常规能力

| 能力类别 | 默认行为与说明 |
| --- | --- |
| **节点整理与分类** | 自动清理公告/信息行、处理零宽字符、补全地区国旗、去重并修复 `dialer-proxy`；按名称归类为 **26 个地区组**、**低/高倍率组** 与 **家宽节点组**。 |
| **自动选路与默认出口** | 提供 `自动选择ex(大陆&香港)`（排除大陆/香港，保留台湾）作为 `默认代理` 优选；`GLOBAL`、`Google`、`AI`、`TikTok`、`Meta`、`AppleProxy` 与 Siri 组默认优先选 `美国`；`Microsoft`、`FCM` 默认走 `默认代理`。 |
| **常见服务分流** | 内置 Google、AI、YouTube、GitHub、Microsoft、Telegram、海外游戏、TikTok、Twitter、Meta、Line、Netflix、Emby、PikPak、BT/PT、Spotify、Crypto、PayPal、Patreon、EHentai 等独立策略组。 |
| **国内直连与下载优化** | 13 组国内核心厂商通过 `AND NOT @!cn` 排除海外子集后直连；配合 `geolocation-cn`、`.cn` 后缀以及国内 CDN、Microsoft CDN、游戏平台国内下载和 Apple 下载直连规则兼顾速度与分流边界。 |
| **广告与安全拦截** | `AdBlock` 拦截 `category-ads-all` 与 `httpdns`；默认接管 DNS 53、拦截外部 DoT/DoQ（853 端口）并禁用浏览器内置 DoH 旁路；默认开启 B 站 PCDN 屏蔽。 |
| **协议与 IP 规则** | TUN 默认 `mips` 栈并开启 HTTP/TLS/QUIC 域名嗅探；STUN 通过 `category-stun` 动态分流；`apple_ip`、私网 IP、常用代理服务 IP 与末端 `cn_ip` 均带 `no-resolve`，避免 Fake-IP 下额外本地解析。 |
| **可选扩展模式** | 支持一键切换 `极简分流`、自定义节点与链式代理、IPv4/IPv6 偏好、隐藏地区手选组与可选 QUIC 阻断，详见 [功能目录](docs/feature-matrix.md)。 |

## 下载入口

### Mihomo / Stash（主支持）

| 产物 | Raw 下载 | CDN 下载 |
| --- | --- | --- |
| Mihomo 全量覆写脚本 | [mihomoScript.js](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Script/mihomoScript.js) | [mihomoScript.cdn.js](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Script/mihomoScript.cdn.js) |
| Mihomo 全量静态配置 | [mihomoConfig.yaml](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/mihomoConfig.yaml) | [mihomoConfig.cdn.yaml](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/mihomoConfig.cdn.yaml) |
| Stash Mihomo 风格配置 | [profile.yaml](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/stash/profile.yaml) | [profile.cdn.yaml](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/stash/profile.cdn.yaml) |

### 其他客户端原生配置

以下配置仅包含示例订阅 URL，导入后请替换为对应客户端支持的订阅地址；动态规则与 DNS 覆盖差异见 [多客户端兼容性](docs/client-compatibility.md)。

| 客户端 | Raw 配置 | CDN 配置 |
| --- | --- | --- |
| Surge | [profile.conf](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/surge/profile.conf) | [profile.cdn.conf](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/surge/profile.cdn.conf) |
| Shadowrocket | [profile.conf](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/shadowrocket/profile.conf) | [profile.cdn.conf](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/shadowrocket/profile.cdn.conf) |
| Quantumult X | [profile.conf](https://raw.githubusercontent.com/dgn0md/myProxyRules/main/Config/quantumultx/profile.conf) | [profile.cdn.conf](https://cdn.jsdelivr.net/gh/dgn0md/myProxyRules@main/Config/quantumultx/profile.cdn.conf) |

## 快速使用

- **覆写脚本模式（推荐）**：支持 `main(config)` 的 Mihomo 客户端直接导入 `mihomoScript.js`（或 CDN 版）即可自动处理订阅节点并生成完整配置。
- **静态配置模式**：下载 `mihomoConfig.yaml` 并填写 `proxy-providers.订阅.url` 后导入 Mihomo；静态 provider 由内核直接拉取订阅，无法读取机场私有 DNS、hosts 或在构建期处理动态节点名称。需要完整节点展开时，请使用本地 `--subscription` 展开模式（见 [功能目录](docs/feature-matrix.md)）。
- **自动更新**：客户端规则集由 HTTP provider 每 24 小时直接拉取上游；脚本与配置产物由 GitHub Actions 在通过行为与 Mihomo 原生校验后自动同步。

## 边界说明

- 地区分组仅按节点名称筛选候选，不代表公网出口真实所在地；Apple 共享域名不改变账号地区、设备资格或服务端策略。
- 严格加密 DNS、Fake-IP 与 `no-resolve` 描述的是生成配置的行为边界，不能作为“零 DNS 泄漏”证明，也不代表所有设备流量均已进入 TUN。
- 单元测试与离线原生校验基于合成节点与公开规则快照，不替代真机网络实测。

## 文档与开发

| 文档 | 内容 |
| --- | --- |
| [功能目录](docs/feature-matrix.md) | 全部脚本开关、默认值、静态 provider 与本地展开模式说明 |
| [Apple 路由说明](docs/apple-routing.md) | Siri/PCC、AppleProxy、Other Apple Service 边界与 DNS 策略 |
| [国内 DNS 白名单原则](docs/dns-whitelist.md) | DNS 解析器分工、匹配优先级与维护边界 |
| [规则来源说明](docs/rule-sources.md) | 上游规则集来源、厂商模块覆盖关系与依赖优先级 |
| [多客户端兼容性](docs/client-compatibility.md) | Stash / Surge / Shadowrocket / Quantumult X 差异与省略项 |
| [开发与验证说明](docs/validation.md) | 本地工具链（Node 24.19.0 / npm 11.17.0）、`test` / `check` / `native:check` 与诊断命令 |
| [节点处理测试](Test/README.md) | 节点过滤、标准化与 hosts 改写测试说明 |

## 来源与许可

本项目包含基于 AIsouler/MyClash 的代码；原作者 AIsouler 的版权声明与 MIT 许可保留在 [LICENSE](LICENSE)，上游原许可证另见 [docs/upstream/LICENSE](docs/upstream/LICENSE)。

策略组和地区图标使用本仓库 [Icons/svg](Icons/svg) 中的 SVG，通过本仓库 CDN 地址引用。图标来自 [aaANDkk / Qure-Style-SVG](https://github.com/aaANDkk/Qure_Style_SVG)，由计划任务每周同步该图标库；当前上游提交记录在 [REVISION](Icons/upstream/REVISION)。图标集包含多种来源，Qure 参考及重绘素材需保留 Koolson/Qure 署名，仅供学习交流，不用于商业盈利；具体来源、版权和许可见随附的[第三方说明](Icons/upstream/THIRD_PARTY_NOTICES.md)及[许可文本](Icons/upstream/licenses/)。各品牌名称和标志归其权利人所有。本项目代码的 MIT 许可不取代图标各自的许可。
