# 仓库维护约定（AGENTS）

适用于本仓库所有贡献者与 AI 助手。修改代码、规则、DNS 或文档前须核对本页及关联规范：[开发原则](docs/development-principles.md)、[国内 DNS 白名单原则](docs/dns-whitelist.md)。

## 1. 项目范围与单一功能源

| 约束项 | 约定 |
| --- | --- |
| **独立维护与署名** | `myProxyRules` 独立演进，不与 MyClash 同步。最初基于 AIsouler/MyClash（`4861619be366c7bacabfed6d581bb8c450de1ca1`），保留来源与版权声明。`docs/upstream/icon-guidelines.md` 仅为历史资料。 |
| **唯一功能源** | `Script/mihomoScript.js` 是 Mihomo 唯一功能源；不新增精简版脚本（`极简分流` 是脚本选项）。YAML 中的 `x-myProxyRules` 仅供构建工具读取，Mihomo 内核不执行。 |
| **多客户端产物** | `tools/build-targets.js` 从同一 Mihomo 配置对象生成 Stash、Surge、Shadowrocket、Quantumult X 原生配置（仅含示例订阅 URL，不含真实节点/凭证）；不生成客户端专属脚本、重写、MITM 或模块。 |
| **自动化构建** | Mihomo Raw/CDN YAML 与四种客户端 Raw/CDN profile 均由 GitHub Actions 校验通过后生成；各产物保留各自 Raw/CDN SHA-256。 |
| **图标规范** | 策略组与地区图标引用 `Icons/svg` 中 Qure-Style-SVG 原始 SVG，不修改素材；同步时保留版权声明、不删除被引用的图标，不补回 CDN 域名直连规则。 |

## 2. 模块化与规则集边界

| 原则 | 要求 |
| --- | --- |
| **动态集合优先** | 优先核查并复用 Bett Rules / Sukka / Blackmatrix7 等现有上游；不为漏匹配业务域名或测试页逐个打补丁。 |
| **统一开关** | 13 组国内厂商模块与 `DOMAIN-SUFFIX,cn,直连` 统一受 `国内服务优先直连` 控制，不增加单厂商开关；`dns_domestic_cdn`、`dns_microsoft_cdn` 默认启用并保持各自边界。 |
| **客户端直连更新** | 客户端通过 HTTP provider 每 `86400s` 直接更新上游；仓库不筛选、合并或重发布成员清单。原生校验快照仅留在忽略目录，不进入发布产物。 |
| **精简无用接口** | 移除无用的专用接口、导出、占位包装和引用；不为假设的未来需求保留接口。 |
| **精确例外门槛** | 保留有明确功能依据的 Apple/协议精确例外；新增例外须说明集合无法表达的原因、范围、优先级与回归依据。 |

## 3. 必须保留的核心行为

| 领域 | 硬性约束（修改时须保留回归） |
| --- | --- |
| **节点处理** | 保留地区、倍率、家宽分类，以及公告过滤、补旗、零宽字符处理、去重、`dialer-proxy` 修复与节点 hosts 改写。 |
| **机场配置隔离** | 覆写/展开订阅时**只处理节点信息**；机场 DNS、`fake-ip-filter`、DNS policy、hosts、路由、策略组等不得进入输出。机场 hosts 仅在满足条件时用于改写节点 `server`。 |
| **严格加密 DNS** | 默认拒绝 `system`/`dhcp`、明文 UDP/TCP、`skip-cert-verify` 和私有明文解析，不得静默回退；严格校验针对脚本生成的 DNS。 |
| **控制面最小化** | 发布配置默认不启用外部控制 API，也不自动下载 Web 控制面。 |
| **DNS 解析分工** | ① 显式直连域名/后缀、`geolocation-cn`、13 组国内厂商（`domestic AND NOT domestic_noncn`）、`+.cn`、`dns_domestic_cdn`、`dns_microsoft_cdn`、`game_platforms_download_cn`、`Microsoft`/`FCM` 本地解析、Apple 国内例外 → **阿里/腾讯 DoH**；② 代理服务组目标 → **跟随对应服务组出口**；③ 普通默认查询 → **Cloudflare DoH-H3 + Google DoH**，经 `#自动选择ex(大陆%26香港)`（极简或关闭该组时 `#默认代理`）；④ 节点域名引导 → **阿里/腾讯 DoH `#DIRECT`**；⑤ `default-nameserver` → **阿里/腾讯 IP DoH**（仅用于启动解析加密 DNS 端点）；⑥ 仅因 IP 兜底直连的查询不切换国内 DNS，不配置 `direct-nameserver`。 |
| **防泄漏与内核栈** | 接管 TCP/UDP 53、`DST-PORT,853,REJECT`、`use-application-dns.net` 返回 `rcode://name_error`；`sniffer.override-destination: true`、`dns.cache-algorithm: lru`、`cache-max-size: 1`、`disable-keep-alive: true`。 |
| **Apple 分流边界** | 保留组名：`Siri Ai/Apple Intelligence`（默认美国，无合格候选时 `REJECT`）、`AppleProxy`（默认美国，可选直连；兼容旧别名 `Apple Product地区`）、`Other Apple Service`（默认直连）。`gateway.icloud.com`、`tis.gateway.icloud.com`、`configuration.ls.apple.com`、`configuration.apple.com`、`gs-loc.apple.com` 与 `mask*.apple-dns.net` / `apple-relay*.apple-dns.net` 归入 Siri 组；`rule-set:apple` 与 `setup.icloud.com` 连接默认直连、DNS 跟随 Siri 组（无合格 Siri 候选且普通 Apple 默认直连时回退国内 DoH）；Apple 精确规则先于广告、Apple CN 与可选 QUIC 拒绝；不以整个 Apple/Cloudflare/`17/8` 代替精细分流。 |
| **国内模块与 STUN** | 13 组国内厂商（`alibaba`、`bilibili`、`bytedance`、`chinamobile`、`chinatelecom`、`chinaunicom`、`huaweicloud`、`jd`、`netease`、`sina`、`tencent`、`xiaomi`、`xiaohongshu`）路由与 DNS 均按 `domestic AND NOT domestic_noncn` 匹配（百度等无 `@!cn` 集合由 `geolocation-cn` 覆盖）。`category-stun` 置于国内域名之后、`geolocation-!cn` 之前指向 `默认代理`（Google STUN 归 `Google` 组，不以全局 UDP 3478/19302 抢占分流）。 |
| **策略组与 IP 顺序** | 取消 `负载均衡` 与 `微软默认直连`；`Microsoft`/`FCM` 首项为 `默认代理`（`microsoft_cn` 直连默认开启）；`Google`/`AI`/`TikTok`/`Meta`/Siri 组首项为 `美国`。IP 顺序固定：`apple_ip` → `private_ip` → 服务 IP → `cn_ip`（均带 `no-resolve`）。 |

## 4. 文档、隐私与推送门禁

| 约束项 | 要求 |
| --- | --- |
| **文档同步** | 修改功能、默认值、组名或 DNS/路由行为时，同步检查 `README.md`、`docs/apple-routing.md`、`docs/dns-whitelist.md`、`docs/feature-matrix.md`、`docs/rule-sources.md`、`docs/client-compatibility.md`、`docs/validation.md`、`Test/README.md`。 |
| **严谨表述** | 区分静态 provider 与 `--subscription` 本地展开模式；不将单测/配置解析描述为实机抓包或 Apple 服务可用性实测；缓存/Fake-IP/DoH/`no-resolve` 均不作为“零泄漏”证明。 |
| **隐私红线** | 不得提交机场链接、密码、真实节点、设备日志、出口 IP、缓存或运行证据；测试样本只从公开快照提取并留在忽略目录。 |
| **推送前必过门禁** | 每次推送前须在最终提交上依次通过 `./tools/npmw test`、`./tools/npmw run check`、`./tools/npmw run native:check`（验证后若再改动须重跑）。 |
| **推送方式** | 门禁通过后仅通过**当前已授权的 GitHub 接口**更新远端；**禁止运行 `git push`**，也不查找或配置命令行凭证。 |
