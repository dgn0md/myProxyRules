# 多客户端配置与兼容性

本仓库以 Mihomo 为主支持客户端，唯一功能源是 `Script/mihomoScript.js` 与 `Config/mihomoConfig.yaml`。Stash 使用 Mihomo 风格配置，沿用项目的 provider、MRS 与 DNS policy。Surge、Shadowrocket 和 Quantumult X 是独立的原生配置入口；`tools/build-targets.js` 从同一 Mihomo 配置对象生成其 profile。

## Mihomo 主支持产物

| 产物 | 文件 | 节点订阅入口 |
| --- | --- | --- |
| Mihomo 静态 YAML | `Config/mihomoConfig.yaml` 与 CDN 副本 `Config/mihomoConfig.cdn.yaml` | `proxy-providers.订阅.url`，须是 Clash/Mihomo 格式 |
| Stash Mihomo 风格 profile | `Config/stash/profile.yaml` 与 CDN 副本 `Config/stash/profile.cdn.yaml` | `proxy-providers.订阅.url`，须是 Stash/Clash 格式 |

Mihomo 脚本覆写入口见 README。静态 provider 由客户端加载订阅，构建时无法处理远端节点名称或机场 hosts。

## 其他客户端原生 profile

| 客户端 | 原生配置 | CDN 副本 | 节点订阅入口 |
| --- | --- | --- | --- |
| Surge | `Config/surge/profile.conf` | `Config/surge/profile.cdn.conf` | 各策略组中的 `policy-path`，须提供 Surge 可读取的节点资源 |
| Shadowrocket | `Config/shadowrocket/profile.conf` | `Config/shadowrocket/profile.cdn.conf` | 先在应用中导入节点订阅，再由策略组按节点名称筛选 |
| Quantumult X | `Config/quantumultx/profile.conf` | `Config/quantumultx/profile.cdn.conf` | `[server_remote]`，须提供 Quantumult X 节点片段 |

所有跟踪配置只含 example.invalid 占位 URL 和规则源链接。真实订阅、节点与凭证不得写入生成产物。生成全部配置可使用以下命令：

    npm run build
    npm run build:targets -- --target stash
    npm run build:targets -- --target surge
    npm run build:targets -- --target all --check

npm run check 会检查四种客户端产物与构建器是否一致。该检查只验证生成内容可复现，不等于在四个应用中完成导入验证。

## 功能覆盖

| 能力 | Mihomo | Stash | Surge | Shadowrocket | Quantumult X |
| --- | --- | --- | --- | --- | --- |
| 配置文件 | YAML 与 JavaScript 覆写 | Clash 风格 YAML；适配器输出完整静态配置 | .conf 完整配置 | .conf 完整配置 | .conf 完整配置与多段资源 |
| MRS | 原生动态规则 provider | 支持 domain/IP MRS，沿用项目 provider；iOS/tvOS 忽略进程名规则 | 不读本项目 MRS；使用原生规则资源替代可映射的服务集合 | 不读本项目 MRS；使用原生规则资源替代可映射的服务集合 | 不读本项目 MRS；使用 Quantumult X 规则资源替代可映射的服务集合 |
| 动态节点筛选 | provider、过滤器与策略组 | 沿用 Clash/Mihomo 结构 | policy-path 与策略组正则 | 应用内节点与策略组正则 | server_remote、资源标签与节点标签正则；带正则筛选的自动组降为可用性选择 |
| DNS | 完整 nameserver-policy、启动解析和 Fake-IP | 沿用项目 DNS 配置 | 加密 DNS 与按路由出口查询；不等价于 Mihomo 每个 provider 的 DNS policy | 加密 DoH 与客户端 fallback；按域名动态跟随组的能力不同 | 加密 DoH；静态精确域名有映射，动态 rule-set DNS policy 不等价 |
| 国内服务集合 | 12 组路由，其中 11 组 AND NOT 海外子集 | 沿用原生规则与 MRS | 省略无法证明等价的 AND/NOT 直连规则 | 同左 | 同左 |
| 脚本、模块 | 执行项目 Mihomo 脚本 | Stash 脚本/覆写能力由应用支持 | Surge JavaScript 与 .sgmodule 由应用支持 | Shadowrocket 脚本与 .module 由应用支持 | rewrite_remote、task_local 等脚本资源由应用支持 |
| 本仓库生成脚本/模块 | mihomoScript.js | 不生成 Stash 专用脚本或覆写模块 | 不生成 .sgmodule 或 Surge 脚本 | 不生成 .module 或 Shadowrocket 脚本 | 不生成 QX 重写、任务或资源解析脚本 |

各客户端有自己的脚本执行环境、配置语法和模块优先级。项目功能目前聚焦策略组、路由、规则源及 DNS 基础行为；不会把 Mihomo 脚本直接改名后投放到其他应用，也不会启用 HTTPS 解密、请求重写、定时任务或脚本遥测。

## 规则源选择与已知差异

规则源按 provider 解析，选源顺序为：**同上游且客户端可直接读取的版本 → 已验证的客户端原生来源 → 省略**。仅扩展名相同不足以证明兼容；选源还要确认目标文件语法、规则类型和匹配语义。客户端直接更新配置中引用的上游文件，仓库不下载、筛选、合并或重新发布规则成员。

| Provider / 上游 | 同上游版本审查 | Surge、Shadowrocket、Quantumult X 选源 |
| --- | --- | --- |
| `apple_proxy` / Blackmatrix7 Clash YAML | Blackmatrix7 提供按客户端生成的原生列表，但目标版本与 Clash YAML 的规则类型和成员数量不同，暂不判定为语义已确认的同源等价版本。 | 沿用各客户端当前已验证的原生 AppleProxy 列表作为回退；成员差异单独记录，不宣称逐条等价。 |
| `apple_cn` / 固定提交的 SukkaW Surge 规则 | SukkaW 文件可直接作为 Surge 与 Shadowrocket 规则集；没有验证过的 Quantumult X 同范围原生版本。 | Surge、Shadowrocket 使用同一 SukkaW URL；Quantumult X 省略。 |
| Bett domain MRS providers | 上游的 `.list` / `.yaml` 是通用域名 payload 变体，不等同于每个客户端的规则行；目前没有可对所有 provider 证明格式和语义均兼容的版本。 | 对已声明的服务集合使用 Blackmatrix7 对应客户端原生列表；其他 provider 继续省略。 |
| Bett IP-CIDR MRS providers | 裸 CIDR 列表缺少目标规则类型与策略，不能直接当作客户端规则集。 | 保留省略，不替换为其他 GeoIP/IP 数据库。 |
| Sukka CDN、MetaCubeX Steam 与其他 classical/DNS 专用 provider | 当前源是 DNS/路由专用；没有验证出与目标客户端等价的同上游文件和 DNS policy 行为。 | 保留各客户端原生已验证映射；无可验证映射时省略并在配置注释中说明。 |

当前映射到 Blackmatrix7 客户端目录的 Bett 服务 provider 为 `googlefcm`、`youtube`、`google`、`github`、`microsoft`、`apple`、`telegram`、`steam`、`tiktok`、`twitter`、`meta`、`line`、`netflix`、`pikpak`、`spotify`、`cryptocurrency`、`paypal`、`patreon`、`ehentai` 和 `category-ads`。兼容性由生成器中的规则源注册表维护，并由 `tests/build-targets.test.js` 验证其优先级与回退行为。

Surge 与 Shadowrocket 的 Apple CN 规则固定引用 [SukkaW Apple CN 文本规则](https://github.com/SukkaW/Surge/blob/0afc9c2ee92aadbf79ce1c9caf03f724135073ea/Source/non_ip/apple_cn.conf)。Bett 的通用列表在目标文件语法或精确/后缀语义没有确认时不被当作直接替代；Quantumult X 规则资源使用其原生过滤规则格式。

Stash 的 MRS provider 保留项目规则，但 Stash iOS/tvOS 因 Network Extension 限制会忽略进程名/进程路径规则；macOS 客户端可按其运行环境处理。当前仓库生成的 Mihomo 规则本身不使用进程名规则，第三方动态规则集仍可能包含此类条目。

原生列表与 Bett MRS 不保证成员或规则类型相同。原生列表可能比本项目原 provider 更新更快，也可能包含 IP、进程或 User-Agent 条目；应用会直接向上游下载，仓库不筛选、合并或重新发布这些清单。服务组规则也可能因此获得不同的覆盖范围。上游变更前应审阅对应客户端目录中的源文件。

以下 Mihomo 行为没有被转换成未经验证的替代规则：

- domestic AND NOT domestic_noncn 的 11 组厂商直连规则和完整 domestic_baidu 直连规则。其他客户端不因此扩大国内直连；未匹配时继续按配置末尾的策略处理。
- geolocation-cn 与 geolocation-!cn 动态域名集合，以及 cn_ip MRS IP 兜底。目标配置不以可能扩大匹配面的客户端 GeoIP 数据代替。
- Apple、服务与私网 IP MRS provider、Apple TV+ MRS、Emby MRS/关键词、AI MRS、以及 DNS 专用的 CDN、Microsoft 下载和 Steam 国内名单。
- Mihomo private/private_ip provider 与用于端口 53 的 dns 出站规则。配置将 DNS 流量交给目标应用自身的 DNS 引擎处理。

未映射的 provider 在 .conf 的 [Rule] 或 [filter_local] 中用 COMPATIBILITY: omitted 注释说明；兼容性差异以此文档为准。精确域名规则和策略组引用仍按目标语法输出。

各目标配置把五种 Mihomo 直连节点变体合并为客户端 DIRECT，因此不会保留 Mihomo 的 IPv4/IPv6 优先和仅 IPv4/IPv6 选择。Surge、Shadowrocket 与 Stash 的自动测速组保留测速 URL 与间隔；Quantumult X 对带节点标签正则的动态测速组使用 `available`，因为其 `url-latency-benchmark` 不支持标签正则筛选。这保留了节点候选过滤，但选择第一个可用节点，不按延迟排序。没有动态标签筛选的明确候选组仍可使用延迟测速。各应用的组选择状态、空组行为和测速实现由应用决定。

Mihomo 配置使用 `mips` TUN 栈及 HTTP 200 测速期望状态；Stash profile 保留这些字段，但仓库原生检查只运行 Mihomo，不能证明 Stash 应用的导入或运行行为。其他客户端的健康检查和 TUN 行为由各应用决定，不宣称与 Mihomo 等价。静态地区筛选对缩写字母间零宽空格的匹配也需要各应用的正则引擎支持。

## DNS 边界

- **Stash**：沿用生成的 Mihomo DNS 配置与动态 policy。
- **Surge**：使用 Cloudflare 与 Google 加密 DNS，打开 DNS 劫持并让加密 DNS 查询遵循出站规则；配置的传统 DNS 只供 DoH 端点启动解析与连通性探测，证书校验保持开启。Mihomo 的动态规则集到 DNS policy 的映射不完整。
- **Shadowrocket**：主/备用解析器均使用 DoH，主解析器经 默认代理；不设置 system DNS fallback。不同域名按规则选择解析器、解析器出站跟随服务组的语义无法完全复制。
- **Quantumult X**：关闭 system DNS 并使用 DoH；从 Mihomo 静态域名 policy 生成精确/后缀 DoH 条目，域名查询不会继承 Mihomo 的服务组出站选择。动态 MRS DNS policy 与项目的全部国内白名单规则不生成。

这些客户端配置不代表系统的其他 VPN、浏览器安全 DNS 或硬编码 DNS 流量都已被接管。目标应用中的 DNS 选项可能覆盖配置；请在应用里检查实际启用的 profile。

## 客户端格式参考

- [Stash 规则集与 MRS](https://stash.wiki/en/rules/rule-set)、[Stash 脚本管理](https://stash.wiki/en/script/manage-script)
- [Surge 配置模块](https://manual.nssurge.com/profile/module.html)、[Surge 规则集](https://manual.nssurge.com/rules/ruleset.html)、[Surge 脚本](https://manual.nssurge.com/scripting/overview.html)
- [Shadowrocket .conf 配置语法参考](https://github.com/pi-dal/shadowrocket-skills/tree/main/shadowrocket-configuration)
- [Quantumult X 官方 sample.conf](https://github.com/crossutility/Quantumult-X/blob/master/sample.conf)、[官方资源解析脚本接口](https://github.com/crossutility/Quantumult-X/blob/master/resource-parser.js)
