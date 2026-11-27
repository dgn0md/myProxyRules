# 验证说明

本页说明当前源文件与自动验收入口。行为以 `Script/mihomoScript.js` 为准，静态 YAML 由同一脚本构建；规则成员通过客户端 HTTP provider 每日更新。

## 本地验收

`npm run build` 还会生成 Stash、Surge、Shadowrocket 与 Quantumult X profile；`npm run check` 对比这些生成文件与适配器输出。该检查不解析或导入客户端应用，也不证明第三方规则资源在上游可用。

```sh
./tools/npmw test
./tools/npmw run check
./tools/npmw run native:check
```

- `test` 运行节点处理、兼容性、配置图、Apple 路由/DNS、动态规则 provider、白名单开关和规则源注册表回归；规则源测试覆盖同上游候选优先、客户端原生回退与省略行为。
- `check` 比较 Mihomo Raw/CDN YAML、四种客户端 Raw/CDN profile 与各自生成器结果。
- `native:check` 使用项目锁定的 Mihomo 版本和公开规则快照，检查各选项组合的原生配置，并在隔离回环环境验证实际规则路由、DNS policy 与节点分类。
- 首次原生检查会下载 Mihomo 和当前公开规则；需要手动刷新快照时运行 `./tools/npmw run native:refresh-rules`。
- 本机诊断可运行 `./tools/npmw run diagnose -- --probe-domain gateway.icloud.com` 或 `./tools/npmw run diagnose -- --probe-ip 17.0.0.1`；可以附加 `--select 'Other Apple Service=美国'` 检查一次手动选择。

## 推送前门禁

每次推送前，在最终准备推送的提交上依次运行 `./tools/npmw test`、`./tools/npmw run check` 和 `./tools/npmw run native:check`。三项都通过后才能推送；如果验证后又改了提交内容，须重新运行。仓库的 `.githooks/pre-push` 会自动执行这三项，本机通过 `core.hooksPath=.githooks` 启用。通过已授权的 GitHub 接口更新远端时，也必须先手动完成同一门禁；不要尝试命令行推送或查找命令行凭证。

原生检查从 `apple_proxy` 的实际 YAML/classical 快照与 `apple_tv` 的 MRS 快照抽取 Apple 样本，不维护单独的业务域名测试清单。国内服务模块样本从当前 Bett 厂商 MRS 快照提取；有 `@!cn` 子集时同时验证排除成员，百度按完整厂商集合验证。日志与解码样本用于隔离检查，不是发布规则，也不作为手工路由名单。

## Apple 与 DNS 覆盖范围

- 配置回归断言 `apple_ip` 在 `cn_ip` 前进入 `AppleProxy`，AppleProxy/TV+ 动态集合使用同一产品组，含 `cn` 段的 Apple 域由前置内联正则集合 `apple_cn_regex` 统一走直连与国内 DNS，内联规则集 `apple_siri_regex`（覆盖含 `siri`、`guzzoni`、`smoot` 关键字的域名，以及 `mask*.icloud.com`、`apple-relay.*` 及排除 `cn` 段的 `ssl.ls.apple.com$` / `ls-apple.com.akadns.net` 后缀）及 `bag.itunes.apple.com` 进入 `Siri Ai/Apple Intelligence`，`gateway.icloud.com` / `setup.icloud.com` 精确进入 `Other Apple Service` 且 DNS 跟随 Siri 选择。
- 配置回归断言国内 DNS policy 与代理节点域名引导使用 `dns.alidns.com`、`doh.pub` DoH，并经 `DIRECT` 建连；普通默认查询使用 Cloudflare `cloudflare-dns.com` 强制 H3 和 Google `dns.google` DoH。原生回归用合成节点和回环 DNS stub 验证节点域名实际发往国内 resolver。`default-nameserver` 保持 IP 字面量并使用阿里/腾讯 DoH IP 与证书域名校验。
- Apple News、Fitness、Sports、Books、PCC、Siri 和模型下载的有限端点按功能范围回归；上游 Apple 集合未覆盖这些组的边界时，不用宽泛集合代替。
- 实际 rule provider 保持加载，用回环 CONNECT 检查命中的规则与策略链；DNS 检查将上游替换为本地计数器，不产生公共业务 DNS 查询。
- 本地支持 TLS 隧道的 HTTP 代理配合临时测试证书模拟 200、204、500、302 和超时，验证 Mihomo provider 对配置的 200 测速期望状态的处理，并核对实际发出的 Apple HTTPS 测速主机、路径与 HEAD 方法，以及统一延迟启用时的重复请求；自动组的期望状态通过内核 API 核对。合成 QUIC v1/v2 Initial 经回环 SOCKS UDP 验证嗅探开启和关闭时的域名路由及原目标 IP，出口限制在回环。此检查不启用 TUN，也不验证完整 QUIC 握手。
- 可选运行 `MYPROXY_CACHE_BENCH=1 ./tools/npmw run native:check`，在回环解析器上对照 ARC 和 LRU：先重复查询热点域名，再查询多于默认缓存容量的一次性域名，最后复查热点，记录上游查询次数、耗时和进程 RSS。它是合成负载，结果与实际设备流量可能不同，不作为性能门禁。
- 国内 DNS 回归从实际 `geolocation-cn` 与 Bett 国内服务快照抽取样本，覆盖明确直连域名规则的国内 DNS、`domestic AND NOT domestic_noncn` 命中与排除、无海外子集的完整国内集合、厂商 DNS policy 随国内路由开关启停、白名单 provider 开关、游戏平台国内下载集合、重叠集合、名单外查询、A/AAAA 与直连拨号；代理服务 DNS policy 按对应服务组验证。它验证生成策略在隔离环境的选择，不测量真实线路延迟。

## CI 与用户网络

GitHub Actions 在生成发布产物前运行单元测试、生成一致性和可用的 Mihomo 原生检查。本地通过只证明当前工具链、公开快照和合成节点下的配置行为；不能证明真实订阅出口、Apple 账号资格、设备 TUN 覆盖、运营商 DNS 路径或服务可用性。远程 CI 结果以 GitHub Actions 页面为准。

实际部署时应在自己的设备上核对 TUN/网关是否覆盖目标流量，检查 Siri / News / TV 的账号可用性，以及 `Siri Ai/Apple Intelligence`、`AppleProxy`、`Other Apple Service` 的连接与 DNS 选择。DoH 会向接收查询的服务商披露域名；缓存和 Fake-IP 也不能证明没有 DNS 查询。不要把隔离回环检查描述成“零 DNS 泄漏”或真实 Apple 服务测试。

`mips` TUN 和系统 DNS 的实际行为需在目标设备验证 TCP、UDP/QUIC、IPv6、切网、休眠与退出恢复。`dns-mode` 暂未显式设置：按内核当前默认，自动路由下 Windows/Linux 为 `hijack`，macOS 为 `disabled`；其设置系统 DNS 的效果不等同于捕获所有应用的加密 DNS。项目保留已有 ARC DNS 缓存，没有声称它在所有工作负载下优于 LRU。

设备验收应分别在 macOS、Windows 和 Linux 上使用真实客户端：启用配置后检查 TUN 已建立且 TCP、UDP 和 IPv6 按预期分流；在切换网络及休眠恢复后重复检查；退出客户端后确认系统 DNS 和路由恢复。比较 `dns-mode` 时，记录该平台 `native` 与 `hijack` 的实际差异及相关权限，单独检查局域网 DNS 和应用内加密 DNS；通过前不修改项目的平台默认行为。Stash 需在其应用内另行验证导入、节点筛选与网络接管。设备运行日志和真实订阅不得写入仓库跟踪文件。

维护前先阅读 [国内 DNS 白名单维护原则](dns-whitelist.md)、[Apple 路由范围与边界](apple-routing.md) 和 [动态规则来源](rule-sources.md)。
