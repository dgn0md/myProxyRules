# 动态规则来源与依赖边界

唯一活动规则源为 `Script/mihomoScript.js`，客户端通过 HTTP rule provider 每 `86400s` 直接拉取上游。维护或换源前须遵守 [开发原则](development-principles.md) 与 [国内 DNS 白名单原则](dns-whitelist.md)。

## 1. 上游来源总表

| 来源 | 用途 | 格式 / 更新 | 关键边界 |
| --- | --- | --- | --- |
| [Bett Rules](https://github.com/appshubcc/bett-rules) | 常规服务、`geolocation-cn`/`!cn`、`category-stun`、`category-ads-all`、`httpdns`、`category-games-!cn` + `category-game-platforms-download@cn`、`tracker`、`apple-tvplus`、`openai` 等域名与 IP MRS。 | `mrs` / 客户端每 `86400s` 更新 | 成员随上游变化；不经 CI 筛选重发布。 |
| [Bett 13 组国内厂商集合](https://github.com/appshubcc/bett-rules/tree/meta/geo/geosite) | `alibaba`、`bilibili`、`bytedance`、`chinamobile`、`chinatelecom`、`chinaunicom`、`huaweicloud`、`jd`、`netease`、`sina`、`tencent`、`xiaomi`、`xiaohongshu`（共 26 个 provider，含同源 `@!cn`）。 | `mrs` / `domestic AND NOT domestic_noncn` | 路由与 DNS 统一受 `国内服务优先直连` 控制；百度/银行/美团/拼多多/知乎已由 `geolocation-cn` 覆盖，不重复加载；阿里含阿里云/优酷，腾讯含腾讯云，字节含火山引擎。 |
| [SukkaW Surge（固定提交）](https://github.com/SukkaW/Surge/blob/0afc9c2ee92aadbf79ce1c9caf03f724135073ea/Source/non_ip/apple_cn.conf) | 大陆专用 Apple `apple_cn` 文本规则。 | `classical/text` / 固定提交 | 保持 Siri/Apple 诊断可复现；不推断 IP 归属地。 |
| [Sukka domestic_cdn](https://ruleset.skk.moe/Clash/non_ip/domestic_cdn.txt) & [microsoft_cdn](https://ruleset.skk.moe/Clash/non_ip/microsoft_cdn.txt) | `dns_domestic_cdn`、`dns_microsoft_cdn`（直连路由 + 代理 `AND NOT` 排除 + 国内 DoH）。 | `classical/text` / 客户端每 `86400s` 更新 | 沿用 AGPL-3.0 声明；不扩大为通用 CDN 或整厂商。 |
| [Blackmatrix7 AppleProxy](https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/AppleProxy/AppleProxy.yaml) | `apple_proxy` 动态集合，统一进入 `AppleProxy` 组。 | `classical/yaml` / 客户端每 `86400s` 更新 | Siri/PCC/国际 iCloud 精确规则排在它之前；`PROCESS-NAME` 不生成 DNS policy。 |
| [Apple 企业网络清单](https://support.apple.com/en-us/101555) & [AppleFlow](https://github.com/Kianuni/AppleFlow) | 界定 PCC、Apple Intelligence、Siri、Relay 与资源端点的精确例外边界。 | 精确规则与内联正则（见脚本） | 不复制整份第三方大清单，也不代理整个 Apple / Cloudflare / `17/8`。 |
| [OpenAI 支持地区](https://developers.openai.com/api/docs/supported-countries) / BIS / OFAC | 为 `AI`、`Google`、`TikTok`、`Meta` 与 Siri 组的受限地区排除提供参考。 | 按完整地区组名排除 | 排除港澳陆、俄白及受制裁地区，保留台湾。 |

## 2. 其他客户端规则源选择（`tools/build-targets.js`）

选源顺序固定为：**已验证的同上游客户端原生版 → 已验证的客户端原生回退（Blackmatrix7）→ 省略（写 `COMPATIBILITY: omitted` 注释）**。

| Provider / 上游 | 同上游审查结论 | Surge / Shadowrocket / Quantumult X 选择 |
| --- | --- | --- |
| `apple_cn`（SukkaW 固定提交） | Surge / Shadowrocket 可直接读取；QX 无等价同源版。 | Surge / Shadowrocket 用同源 URL；QX 省略。 |
| `apple_proxy`（Blackmatrix7 YAML） | 各目标目录规则类型与成员数不同，未判为逐条等价。 | 回退各客户端 Blackmatrix7 原生 `AppleProxy.list`。 |
| Bett domain MRS | `.list`/`.yaml` 为通用 payload，目标语义未逐项验证。 | 19 个已声明服务回退 Blackmatrix7 原生列表，其余省略。 |
| Bett IP-CIDR / DNS 专用 / `AND NOT` 组合 | 无法在目标客户端证明等价。 | 全部保守省略，不以更宽的 GeoIP 或通用名单替代。 |

> 回退到 Blackmatrix7 的 19 个 Bett 服务：`googlefcm`、`youtube`、`google`、`github`、`microsoft`、`apple`、`telegram`、`tiktok`、`twitter`、`meta`、`line`、`netflix`、`pikpak`、`spotify`、`cryptocurrency`、`paypal`、`patreon`、`ehentai`、`category-ads-all`（由 `tests/build-targets.test.js` 回归）。

## 3. Provider 类型与关键优先级

| Provider 类型 | 路由与 DNS 行为 |
| --- | --- |
| `domain` MRS / `classical` | 代理服务组 DNS 跟随对应组；直连目标使用阿里/腾讯 DoH；`apple` 连接走 `Other Apple Service`、DNS 跟随 Siri 组；`apple_cn_regex`/`apple_siri_regex` 通过内联 `classical` 规则集生效。 |
| `ipcidr` MRS | 仅参与连接路由（全部带 `no-resolve`），无域名 DNS policy；顺序固定为 `apple_ip` → `private_ip` → 服务 IP（关闭组或极简模式时必代理服务 IP 回退 `默认代理`）→ `cn_ip`。 |
| 保留的小规模精确例外 | 仅保留上游快照未覆盖的 `fsend.cn`、`ctaiot.com`、`international-gfe.download.nvidia.com`、`mb3admin.com`、`nubebelle.com` 与 Apple 专项例外。 |
| 未使用清理 | 清理 provider 时同时扫描 `rules`、`dns` 及内联 provider 依赖，绝不误删仅供 DNS 使用的集合。 |
