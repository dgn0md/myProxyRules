# 多客户端配置与兼容性

唯一功能源是 `Script/mihomoScript.js`。Stash 沿用 Mihomo 风格配置；Surge、Shadowrocket 与 Quantumult X 由 `tools/build-targets.js` 从同一配置对象生成原生 `.conf`。所有跟踪产物仅含 `example.invalid` 占位 URL，不含真实节点或凭证。

## 1. 客户端产物与订阅入口

| 客户端 | 定位 | Raw 配置 | CDN 配置 | 节点订阅入口 |
| --- | --- | --- | --- | --- |
| **Mihomo** | 主支持 | `Config/mihomoConfig.yaml` | `Config/mihomoConfig.cdn.yaml` | `proxy-providers.订阅.url`（Clash/Mihomo 格式） |
| **Stash** | 主支持（Mihomo 风格） | `Config/stash/profile.yaml` | `Config/stash/profile.cdn.yaml` | `proxy-providers.订阅.url`（Stash/Clash 格式） |
| **Surge** | 兼容原生 profile | `Config/surge/profile.conf` | `Config/surge/profile.cdn.conf` | 策略组 `policy-path`（Surge 节点资源） |
| **Shadowrocket** | 兼容原生 profile | `Config/shadowrocket/profile.conf` | `Config/shadowrocket/profile.cdn.conf` | 应用内先导入订阅，由策略组正则筛选 |
| **Quantumult X** | 兼容原生 profile | `Config/quantumultx/profile.conf` | `Config/quantumultx/profile.cdn.conf` | `[server_remote]`（QX 节点片段） |

```sh
npm run build
npm run build:targets -- --target all --check
```

> `npm run check` 只验证生成结果与适配器一致，**不等于**在四个应用内完成导入或运行验证。

## 2. 功能覆盖矩阵

| 能力 | Mihomo | Stash | Surge | Shadowrocket | Quantumult X |
| --- | --- | --- | --- | --- | --- |
| **配置与规则源** | YAML / JS 覆写 + 原生 MRS | Clash YAML + MRS（iOS/tvOS 忽略进程规则） | `.conf` + 原生规则列表 | `.conf` + 原生规则列表 | `.conf` + 原生过滤资源 |
| **动态节点筛选** | provider + 正则 + `url-test` | 沿用 Mihomo 结构 | `policy-path` + 正则 | 应用内节点 + 正则 | `server_remote` + 标签正则（带正则自动组降为 `available`） |
| **直连节点变体** | 5 种 IPv4/IPv6 偏好直连 | 合并为 `DIRECT` | 合并为 `DIRECT` | 合并为 `DIRECT` | 合并为 `DIRECT` |
| **国内服务规则** | 13 组 `AND NOT @!cn` + `.cn` | 沿用 Mihomo | 保留 `.cn`；省略 `AND NOT` 厂商规则 | 同左 | 同左 |
| **DNS 能力** | 完整 `nameserver-policy` + 启动 DoH + Fake-IP | 沿用 Mihomo DNS | DoH + 劫持 + 跟随出站规则（动态 rule-set 映射不完整） | 主/备 DoH（无 system fallback；按组动态解析不等价） | DoH + 静态精确/后缀条目（不继承服务组出口，无动态 MRS policy） |
| **脚本 / 重写 / 模块** | `mihomoScript.js` | 不生成 Stash 专属脚本 | 不生成 `.sgmodule`/JS | 不生成 `.module`/JS | 不生成重写/任务/资源解析脚本 |

## 3. 保守省略项（Surge / Shadowrocket / Quantumult X）

选源顺序为：**已验证同上游版 → 已验证原生回退（Blackmatrix7）→ 省略**（在 `.conf` 中以 `COMPATIBILITY: omitted` 注释标明）。以下无法证明等价的 Mihomo 规则**不会**转为更宽的替代规则：

| 省略类别 | 包含项 | 处理方式 |
| --- | --- | --- |
| **复合逻辑直连** | 13 组 `domestic AND NOT domestic_noncn`、`海外游戏` 组合排除、`dns_domestic_cdn`、`dns_microsoft_cdn` | 省略，不扩大国内直连；静态 `.cn` 后缀保留。 |
| **广域地理位置集合** | `geolocation-cn`、`geolocation-!cn`、`cn_ip` MRS | 省略，不以客户端 GeoIP 数据库替代。 |
| **无等价原生源的 MRS** | 所有 IP-CIDR MRS、`apple_tv`、`emby`、`ai`、`tracker`、`httpdns`、`category-stun`、`private`/`private_ip`、端口 53 `dns` 出站规则 | 省略；DNS 流量交由目标应用自身 DNS 引擎处理。 |
| **QX 专属差异** | `apple_cn`（无已验证 QX 同源版） | QX 省略；Surge / Shadowrocket 沿用固定提交 SukkaW `apple_cn.conf`。 |

## 4. 客户端官方文档参考

- Stash：[规则集与 MRS](https://stash.wiki/en/rules/rule-set) · [脚本管理](https://stash.wiki/en/script/manage-script)
- Surge：[配置模块](https://manual.nssurge.com/profile/module.html) · [规则集](https://manual.nssurge.com/rules/ruleset.html) · [脚本](https://manual.nssurge.com/scripting/overview.html)
- Shadowrocket：[`.conf` 语法参考](https://github.com/pi-dal/shadowrocket-skills/tree/main/shadowrocket-configuration)
- Quantumult X：[sample.conf](https://github.com/crossutility/Quantumult-X/blob/master/sample.conf) · [资源解析接口](https://github.com/crossutility/Quantumult-X/blob/master/resource-parser.js)
