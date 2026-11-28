# 开发与验证说明

唯一功能源为 `Script/mihomoScript.js`，开发与 CI 锁定 **Node.js 24.19.0 / npm 11.17.0**。

## 1. 推送前必过门禁

每次向远端推送前，须在最终提交上依次通过以下三项（验证后若有新改动须重跑；`.githooks/pre-push` 自动执行同一门禁；通过 GitHub API 推送前也须手动完成）：

```sh
./tools/npmw test
./tools/npmw run check
./tools/npmw run native:check
```

| 命令 | 验证内容 | 备注 |
| --- | --- | --- |
| `./tools/npmw test` | `Test/run-tests.js`（ES2026 语法 + QuickJS + 节点处理）与 `tests/*.test.js`（配置图、Apple/DNS/国内模块、严格 DNS、选源注册表回归）。 | 全部在本地离线执行。 |
| `./tools/npmw run check` | 图标引用、脚本 SHA-256、CDN 脚本、Mihomo Raw/CDN YAML、四种客户端 profile 生成一致性与 Prettier 代码格式。 | 不代表四个目标应用导入验证。 |
| `./tools/npmw run native:check` | 使用锁定版 Mihomo 内核与公开规则快照，在隔离回环环境校验多选项语法、实际 CONNECT 路由、DNS policy、纯 IP 嗅探、HTTP 200 测速与节点引导解析。 | 刷新快照运行 `./tools/npmw run native:refresh-rules`。 |
| `./tools/npmw run diagnose -- --probe-domain setup.icloud.com` | 在隔离回环 Mihomo 中探查单个域名或 `--probe-ip` 的命中规则与策略链（支持 `--select 'Other Apple Service=美国'`）。 | 仅用于隔离策略诊断。 |

> 推送方式约束：门禁通过后仅通过**已授权的 GitHub 接口**更新远端；**不运行命令行 `git push`**，也不查找或配置命令行凭证。

## 2. 自动化回归覆盖范围

| 回归维度 | 核心断言 |
| --- | --- |
| **Apple 与 Siri/PCC** | `apple_ip` 先于 `cn_ip`；`apple_cn_regex` 前置直连与国内 DoH；`apple_siri_regex`（含 `siri`/`guzzoni`/`smoot`、`mask*.icloud.com`/`mask*.apple-dns.net`、`apple-relay.*`、非 CN 的 `ssl.ls.apple.com$`/`ls-apple.com.akadns.net`）及 `gateway.icloud.com`、`tis.gateway.icloud.com`、`bag.itunes.apple.com`、`configuration.ls.apple.com`、`configuration.apple.com`、`gs-loc.apple.com` 进入 Siri 组并免 Fake-IP；`setup.icloud.com` 进入 `Other Apple Service` 且 DNS 跟随 Siri 组；`apple_proxy`/`apple_tv` 从实际快照抽样验证。 |
| **DNS 与防泄漏** | 国内 policy 与节点引导使用阿里/腾讯 DoH `#DIRECT`；默认查询使用 Cloudflare DoH-H3 + Google DoH；`default-nameserver` 使用阿里/腾讯 IP DoH；验证 13 组国内厂商 `AND NOT` 命中/排除、`geolocation-cn`、`+.cn`、白名单 CDN、游戏下载直连与名单外查询（回环上游计数器，不产生公网业务查询）。 |
| **嗅探与测速** | 合成 QUIC v1/v2 Initial 与 HTTP/TLS 验证纯 IP 嗅探与目标改写；本地 TLS 代理模拟 200/204/500/302/超时，验证 Apple HTTPS 200 测速期望状态。 |
| **可选缓存压测** | `MYPROXY_CACHE_BENCH=1 ./tools/npmw run native:check` 对比 ARC/LRU 合成负载表现，仅作参考，不作门禁。 |

## 3. CI 与真机验收边界

- **CI 门禁**：`Verify full overrides` 与 `Sync script and generate config` 均须通过行为与 Mihomo 原生校验后才会提交生成产物；远程状态以 GitHub Actions 页面为准。
- **不等于真机实测**：本地与 CI 通过仅证明当前工具链、公开快照与合成节点下的配置行为，**不证明**真实订阅出口、Apple 账号资格、设备 TUN 覆盖、运营商 DNS 路径或“零 DNS 泄漏”。
- **真机检查项**：在 macOS / Windows / Linux / iOS 实机验证 TUN（`mips` 栈）、TCP/UDP/QUIC/IPv6 分流、切网与休眠恢复、退出后系统 DNS 恢复，以及 Siri / News / TV 实际表现。设备日志与真实订阅严禁写入仓库跟踪文件。

关联文档：[国内 DNS 白名单原则](dns-whitelist.md) · [Apple 路由说明](apple-routing.md) · [规则来源说明](rule-sources.md)
