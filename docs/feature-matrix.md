# 功能目录

规则与开关均以 `Script/mihomoScript.js` 为唯一功能源；静态 YAML 与四种目标客户端 profile 由构建工具从同一配置对象生成。维护变更同时遵守 [开发原则](development-principles.md) 与 [国内 DNS 白名单原则](dns-whitelist.md)。

## 1. 核心维护功能

| 功能模块 | 实现与默认行为 | 关联文档 |
| --- | --- | --- |
| **Apple 精细分流** | 拆分为 `Siri Ai/Apple Intelligence`（默认美国，无合格候选时拒绝）、`AppleProxy`（默认美国，可选直连）、`Other Apple Service`（默认直连，DNS 跟随 Siri 组），前置 `apple_cn_regex` 与 4 个下载直连 CDN。 | [Apple 路由说明](apple-routing.md) |
| **国内服务模块** | 13 组国内厂商（`domestic AND NOT domestic_noncn`）与 `DOMAIN-SUFFIX,cn,直连` 统一由 `国内服务优先直连` 控制；百度/银行/美团/拼多多/知乎已由 `geolocation-cn` 覆盖。 | [规则来源说明](rule-sources.md) |
| **DNS 控制与防泄漏** | 显式直连、`geolocation-cn`、国内厂商、常驻 CDN 白名单与节点引导走阿里/腾讯 DoH；代理服务跟随对应组出口；默认查询走 Cloudflare DoH-H3 + Google DoH（经 `自动选择ex(大陆&香港)`）；接管 53、拒绝 853 DoT/DoQ、拦截 `use-application-dns.net`；`lru` + `cache-max-size: 1`；关闭全局 TCP Keep-Alive。 | [国内 DNS 白名单原则](dns-whitelist.md) |
| **机场覆写隔离** | 展开/覆写订阅时仅处理节点（清理、补旗、零宽字符、去重、`dialer-proxy` 修复、条件 hosts 改写 `server`），丢弃机场 DNS/规则/策略组/控制面设置。 | [Test/README.md](../Test/README.md) |
| **纯 IP 域名嗅探** | `sniffer` 默认启用（`parse-pure-ip`、`force-dns-mapping`、`override-destination: true`），覆盖 HTTP/TLS/QUIC 端口，不解密 HTTPS。 | [验证说明](validation.md) |
| **自动选择排除组** | `排除大陆香港自动选` 控制 `自动选择ex(大陆&香港)`，按名称排除大陆/香港候选并保留台湾；作为 `默认代理` 首项。 | [AGENTS.md](../AGENTS.md) |
| **广告与 STUN / 游戏** | `AdBlock` 拦截 `category-ads-all` + `httpdns`；`海外游戏` 排除直连下载集；`BT/PT` 使用 `tracker`；STUN 由 `category-stun` 动态分流（Google STUN 归 `Google` 组）。 | [规则来源说明](rule-sources.md) |
| **控制面与本地诊断** | 发布配置默认不开启外部控制 API 或自动下载 Web UI；提供本地回环 `diagnose` 命令探查规则与策略链。 | [验证说明](validation.md) |

## 2. 内核与常规默认参数

| 类别 | 默认配置 | 说明 |
| --- | --- | --- |
| **默认策略首项** | `GLOBAL` / `Google` / `AI` / `TikTok` / `Meta` / `AppleProxy` / Siri → `美国`；`默认代理` → `自动选择ex(大陆&香港)`；`Microsoft` / `FCM` → `默认代理` | 仅在候选组存在时生效；已有客户端选择缓存优先。 |
| **测速配置** | `https://www.apple.com/library/test/success.html`，期望状态码 `200`，间隔 `600s`，容差 `50ms` | 经被测节点发起 HTTPS 请求，只校验状态码；不新增全局 `www.apple.com` 代理例外。 |
| **TUN 与网络栈** | `tun.stack: mips`、`unified-delay: true`、`tcp-concurrent: true`、`disable-keep-alive: true` | `dns-mode` 沿用平台默认（Win/Linux `hijack`，macOS `disabled`）。 |
| **IP 规则顺序** | `apple_ip` → `private_ip` → Google/OpenAI/Microsoft/Telegram/TikTok/Twitter/Meta/Netflix/Spotify IP → `cn_ip` | 全部带 `no-resolve`；关闭服务组或极简模式时必代理服务 IP 回退 `默认代理`。 |

## 3. 配置使用模式对比

| 模式 | 输入方式 | 节点处理能力 | 限制 |
| --- | --- | --- | --- |
| **脚本覆写** | Mihomo 客户端加载 `mihomoScript.js` 覆写含 `proxies` 的订阅 | 完整执行节点过滤、去重、补旗、零宽字符与 hosts 改写 | 需客户端支持 `main(config)` JS 覆写。 |
| **静态 YAML** | 下载 `Config/mihomoConfig.yaml` 并填 `proxy-providers.订阅.url` | 加载时移除“大陆旗帜+台湾文字”冲突，正则兼容短代码零宽空格 | 构建期看不到远端节点名与机场 hosts；`x-myProxyRules` 开关不由内核执行，修改后须重建。 |
| **本地展开** | 选项 YAML + `--subscription` 本地订阅文件（输出到 `.local/`） | 与脚本覆写完全一致的完整节点与 hosts 处理 | 订阅变更后需重新执行构建命令。 |

> 旧配置若仍使用 `x-myClashRules`，请改为 `x-myProxyRules`（构建器遇到旧键会直接报错提示迁移）。
