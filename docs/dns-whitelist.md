# 国内 DNS 白名单维护原则

与 [AGENTS.md](../AGENTS.md) 和 [开发原则](development-principles.md) 一同遵守。本页定义 Mihomo/Stash 的精确 DNS 解析分工、匹配顺序与维护红线；其他客户端差异见 [多客户端兼容性](client-compatibility.md)。

## 1. 解析器职责分工

| 解析器类别 | 配置值 | 适用范围 |
| --- | --- | --- |
| **启动解析**（`default-nameserver`） | `https://223.5.5.5/dns-query#DIRECT&name-cert-verify=dns.alidns.com`<br>`https://1.12.12.12/dns-query#DIRECT&name-cert-verify=doh.pub` | 仅用于满足 Mihomo IP 字面量要求、解析加密 DoH 服务器域名；不作普通业务兜底。 |
| **节点引导**（`proxy-server-nameserver`） | `https://dns.alidns.com/dns-query#DIRECT`<br>`https://doh.pub/dns-query#DIRECT` | 解析代理节点域名，避免代理启动前依赖境外 DNS。 |
| **国内加密 DoH**（显式直连与白名单） | 同上（阿里 / 腾讯 DoH `#DIRECT`） | 显式目标为 `直连` 的域名/集合、`geolocation-cn`、13 组国内厂商 `AND NOT @!cn`、`+.cn`、`dns_domestic_cdn`、`dns_microsoft_cdn`、`game_platforms_download_cn`、`Microsoft`/`FCM` 本地解析、固定 `apple_cn`、4 个 Apple 下载 CDN、无合格 Siri 候选时的普通 Apple 直连回退。 |
| **服务组专属 DoH** | `https://cloudflare-dns.com/dns-query#<组名>&h3=true`<br>`https://dns.google/dns-query#<组名>` | 代理服务组的显式域名与动态 rule-set（`Other Apple Service` 跟随 `Siri Ai/Apple Intelligence`）。 |
| **默认国外 DoH**（`nameserver`） | 同上，出口为 `#自动选择ex(大陆%26香港)`（极简或关闭该组时 `#默认代理`） | 未命中上述 policy 的全部普通查询，以及仅因 `cn_ip` 等 IP 兜底直连的未知域名。 |
| **安全 RCODE** | `rcode://success` / `rcode://name_error` | `rule-set:private`（严格模式 `rcode://success`）、`use-application-dns.net`、广告/HTTPDNS 与无可用候选的拒绝组（`rcode://name_error`）。 |

## 2. 匹配优先级（自上而下）

| 优先级 | `nameserver-policy` 区段 | 说明 |
| --- | --- | --- |
| 1 | 显式主机与精确后缀（含 Apple/Siri、Apple 下载 CDN、`use-application-dns.net` 等） | 始终优先于动态 rule-set（广域 `+.cn` 除外，后置至第 6 步）。 |
| 2 | `rule-set:private` → `apple_cn_regex` → `apple_siri_regex` → `apple_media_regex` → `apple_tv` / `apple_proxy` → `category-ads-all` / `httpdns` | 保护 Apple 精细例外与广告/HTTPDNS 拦截。 |
| 3 | 前置直连与明确服务集合（`synology`、`nvidia_cn`、`apple_cn`、`microsoft_cn`、`dns_microsoft_cdn`、各代理服务组、`game_platforms_download_cn` 等） | 保护下载 CDN 子集与海外服务专属解析出口。 |
| 4 | `rule-set:dns_domestic_cdn` → 13 组 `domestic_*_dns`（`domestic AND NOT domestic_noncn`） | `dns_domestic_cdn` 默认常驻；13 组厂商 policy 随 `国内服务优先直连` 启停。 |
| 5 | `rule-set:geolocation-cn` → `+.cn` | `geolocation-cn` 独立生效；`+.cn` 随 `国内服务优先直连` 启停，避免抢占上方服务/广告。 |
| 6 | `rule-set:category-stun` → `rule-set:geolocation-!cn` → 默认 `nameserver` | 其余海外公共 STUN 与海外域名走默认代理出口解析。 |

## 3. 常驻白名单与专项例外

| 集合 / 例外 | 范围与限制 |
| --- | --- |
| `dns_domestic_cdn` | Sukka `domestic_cdn` 小集合；同步直连路由、国内 DoH，并在 `geolocation-!cn` 中以 `AND NOT` 排除。不替换为通用 `cdn`/`domestic`。 |
| `dns_microsoft_cdn` | Sukka `microsoft_cdn` 下载静态资源；同步直连路由、国内 DoH，并在 `Microsoft` 中以 `AND NOT` 排除。不扩大为整个 Microsoft/Azure。 |
| `game_platforms_download_cn` | `category-game-platforms-download@cn`；随 `海外游戏` 组生效并从 `overseas_games` 中以 `AND NOT` 排除，保留游戏平台/社区走代理。 |
| `apple_cn` + 4 个 Apple 下载 CDN | 固定版本 `apple_cn.conf` 与 `gdmf`/`mesu`/`updates`/`assets` 四个域名保留国内 DoH；不引入整份 `apple_cdn`。 |
| 无合格 Siri 候选回退 | 仅当 Siri 组为 `REJECT` 且 `Apple其他默认直连` 开启时，`rule-set:apple` 与 `setup.icloud.com` 回退国内 DoH。 |

## 4. 维护红线

- **严禁扩大默认国内解析**：不配置 `direct-nameserver`；通用 `cn`、`douyin`、整家厂商、公共云大集合或仅靠 `cn_ip` 直连的查询均不自动授权国内 DNS；国外解析失败不回退国内 DNS。
- **严格加密与隔离**：严格模式下拒绝 `system`/`dhcp`/明文/跳过证书校验；机场 DNS 设置不得进入输出。
- **保留 DNS 专用依赖**：清理未用 provider 时必须同时扫描 `rules` 与 `dns`（含 `fake-ip-filter` 与 `nameserver-policy` 及内联依赖）。
- **诚实表述边界**：DoH 仍向对应服务商披露查询域名；缓存、Fake-IP 与 `no-resolve` 均不能作为“零 DNS 泄漏”证明。

关联文档：[规则来源说明](rule-sources.md) · [验证说明](validation.md) · [测试说明](../Test/README.md)
