# Apple 路由范围与边界

精确规则由 `Script/mihomoScript.js` 生成。规则只控制网络路由与 DNS 出口，不解密 HTTPS，也不改变 Apple 账号、设备资格或服务端策略。本文描述 Mihomo/Stash 输出；其他客户端差异见 [多客户端兼容性](client-compatibility.md)。

## 1. 策略组与开关

| 策略组 / 开关 | 覆盖范围 | 默认出口 | DNS 出口 |
| --- | --- | --- | --- |
| `Siri Ai/Apple Intelligence`（`Apple智能分流`） | Apple Intelligence、Siri、PCC、`gateway.icloud.com`、`tis.gateway.icloud.com`、`bag.itunes.apple.com`、`configuration.ls.apple.com`、`configuration.apple.com`、`gs-loc.apple.com`、国际 `icloud-content.com`、`cp4.cloudflare.com`，以及内联规则集 `apple_siri_regex`（含 `siri`/`guzzoni`/`smoot` 关键字、`mask*.icloud.com` / `mask*.apple-dns.net`、`apple-relay.*`（含 `apple-dns.net` / `mask.apple-dns.net`）、排除 `cn` 段的 `ssl.ls.apple.com$` 与 `ls-apple.com.akadns.net`）。 | 默认 `美国`（仅含允许地区，排除港澳陆及受限地区）；无合格候选时 `REJECT`。 | 跟随本组当前选择；无合格候选时 `rcode://name_error`。 |
| `AppleProxy`（兼容旧别名 `Apple Product地区`） | Blackmatrix7 `AppleProxy.yaml` 动态集合、`apple-tvplus` MRS、News/Fitness/Sports/Books 产品入口、`apple_ip`（`no-resolve`）与 `apple-dns.com` / `apple-dns.net`（被前置 `apple_siri_regex` 覆盖的中继主机除外）。 | 初始 `美国`，可切其他候选或 `直连`。 | 跟随本组当前选择。 |
| `Other Apple Service`（`Apple其他服务`） | 通用 `apple` MRS 集合与精确主机 `setup.icloud.com`。 | 默认 `直连`（由 `Apple其他默认直连` 控制）。 | 跟随 `Siri Ai/Apple Intelligence`；若无合格 Siri 候选且本组默认直连，回退阿里/腾讯 DoH。 |
| `apple_cn_regex` / `apple_cn` | 前置内联正则 `apple_cn_regex`（含 `cn` 段的 Apple 域主机，受 `国内服务优先直连` 控制）与固定版本 SukkaW `apple_cn.conf`。 | `直连` | 阿里/腾讯 DoH。 |
| `Apple下载直连`（默认开启） | `gdmf.apple.com`、`mesu.apple.com`、`updates.cdn-apple.com`、`assets.cdn-apple.com`。 | `直连`（关闭后交由常规 Apple 规则） | 阿里/腾讯 DoH。 |
| `Apple媒体代理`（默认关闭） | 内联正则 `apple_media_regex`（`buy`/`p*-buy`/`play`/`se*` 等 `itunes.apple.com` 媒体购买接口）。 | 开启后进入 `AppleProxy` | 跟随 `AppleProxy`。 |

## 2. 规则与 DNS 优先级

| 顺序 | 路由规则 | DNS / Fake-IP 说明 |
| --- | --- | --- |
| 1 | `DST-PORT,53,内置DNS`、`DST-PORT,853,REJECT` | 接管 TUN DNS 53，拦截外部 DoT/DoQ。 |
| 2 | `apple_cn_regex`（大陆 Apple 段直连） | 优先于 `apple_siri_regex`，使用阿里/腾讯 DoH。 |
| 3 | Siri/PCC 精确与后缀域名 + `apple_siri_regex` | 全部进入 `fake-ip-filter`（国际 `icloud-content.com` 除外）；DNS 跟随 Siri 组。 |
| 4 | `AppleProxy` 精确入口 + `apple_tv` + 可选 `apple_media_regex` | DNS 跟随 `AppleProxy`。 |
| 5 | `setup.icloud.com`（`Other Apple Service`）→ `Apple下载直连`（4 个 CDN 域名）→ `apple_proxy` 动态集合 | 保护 `setup.icloud.com` 与 4 个下载 CDN 不被宽泛 `apple_proxy` 抢占。 |
| 6 | `AdBlock`（`category-ads-all`、`httpdns`）→ `apple_cn` → 可选 QUIC 拒绝 → `rule-set:apple`（`Other Apple Service`） | Apple 精确规则先于广告、Apple CN 与 QUIC 拒绝。 |
| 7 | IP 规则段：`apple_ip` → `private_ip` → 其他服务 IP → `cn_ip`（均带 `no-resolve`） | 防止 `apple_ip` 被通用 `cn_ip` 先匹配；IP 集合无域名 DNS policy。 |

## 3. 已知边界与维护红线

| 边界项 | 说明 |
| --- | --- |
| **共享端点复用** | `icloud-content.com`、`gateway.icloud.com`、`ssl.ls.apple.com`、`ls-apple.com.akadns.net` 与配置/定位主机可能被照片、备份、地图、eSIM、Watch 等复用，网络层无法按 HTTPS 路径拆分应用。 |
| **不扩大整域/整网段** | 禁止以整个 `apple.com`、`cloudflare.com`、`icloud.com`、`apple_cdn` 或 `17/8` 代替精细分流或国内 DNS 例外。 |
| **无合格 Siri 候选回退** | 仅当 `Siri Ai/Apple Intelligence` 无允许地区候选且 `Apple其他默认直连` 开启时，`rule-set:apple` 与 `setup.icloud.com` 回退国内 DoH，避免直连被 NXDOMAIN 阻断；关闭普通 Apple 默认直连时不启用此回退。 |
| **受限地区排除** | `AI`、`Google`、`TikTok`、`Meta` 与 Siri 组均按完整地区名排除香港、澳门、大陆、俄罗斯、白俄罗斯、古巴、伊朗、朝鲜及受制裁地区，保留台湾。 |
| **客户端运行前提** | 部分 Apple 后台服务依赖 TUN / Network Extension 接管；QUIC 阻断默认关闭，开启后 Apple 精确规则仍优先于 UDP/443 拒绝。 |

## 4. 参考来源

- **Apple 企业网络清单**（`support.apple.com/en-us/101555`）：PCC、Apple Intelligence、Siri、Relay 与资源端点边界。
- **AppleFlow**：PCC / Siri 公开规则参考。
- **Blackmatrix7 `AppleProxy.yaml` / Bett `apple-tvplus` / SukkaW 固定版本 `apple_cn.conf`**：动态集合与大陆 Apple 固定集合。
