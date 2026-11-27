# 节点处理与兼容性测试

此目录包含节点处理逻辑的兼容性回归用例，并在入口中运行 ES2026 语法兼容性和 QuickJS 执行检查。

从仓库根目录运行：

```sh
npm ci
node Test/run-tests.js
```

`npm test` 会运行这里的兼容性套件，随后运行 `tests/*.test.js` 中针对生成配置的 Node 回归。后者覆盖配置图、服务与 Apple 规则、DNS policy 与路由出口、动态 IP provider 顺序、规则源注册表的同上游优先/原生回退/省略行为、严格加密 DNS、开关行为和静态生成一致性。

`npm run check` 比较默认 Mihomo YAML 与提交产物，并检查 Stash、Surge、Shadowrocket、Quantumult X profile 的生成一致性。可用官方 Mihomo 内核时，`tools/native-check.js` 和 `tools/native-sniffing.js` 提供额外的原生配置与隔离流量检查。配置测试、原生解析和设备/运营商网络行为是不同的检查范围。

新增模块与测试遵守 [模块化与动态规则集开发原则](../docs/development-principles.md)，复用统一开关，移除无用接口，避免逐业务域名维护。现有 Apple 精确功能回归按其专项约定保留。

## 多客户端配置

`npm run build` 生成四个客户端 profile；`npm run check` 比较 Mihomo 与各目标 profile 的生成一致性。此门禁不会在 Stash、Surge、Shadowrocket 或 Quantumult X 应用内导入配置；各目标规则源和保守省略项见[兼容性说明](../docs/client-compatibility.md)。

## 国内服务路由模块

`tests/config.test.js` 验证 13 组国内服务模块（阿里、B站、字节、三家运营商、华为云、京东、网易、新浪/微博、腾讯、小米、小红书）与 `DOMAIN-SUFFIX,cn,直连` 的路由开关、DNS policy、专用服务优先级、静态/展开与全量/极简输出，并确认关闭 `国内服务优先直连` 后移除厂商与 `+.cn` policy。原生回归从实际 Bett 厂商 MRS 快照自动提取配对集合的命中/排除样本，在开关开启时用隔离 DNS 上游验证 `domestic AND NOT domestic_noncn`；路由匹配仍在全量/极简和开关组合下执行回环 CONNECT 验证。集合外样本使用随机 `.invalid` 域名。运行时样本与解码文件只保存在忽略的临时目录，不用于生成或发布客户端规则。

## DNS 白名单回归原则

修改 DNS、规则源或相关开关前遵守 [国内 DNS 白名单维护原则](../docs/dns-whitelist.md)。显式目标为 `直连` 的域名规则和动态 domain/classical 集合应使用国内 DNS；不能扩大为通用 `cn`、未知域名或仅由 `cn_ip` 兜底直连的域名，也不配置通用 `direct-nameserver`。应区分连接路由、`geolocation-cn` policy、`domestic AND NOT domestic_noncn` policy、DNS 白名单和 Apple/启动解析例外。

`tests/config.test.js` 覆盖 `geolocation-cn` policy、白名单开关组合、游戏平台国内下载与海外游戏组边界、服务组/极简模式独立性、DNS provider 引用及优先级。`tools/native-check.js` 调用 `tools/native-dns-whitelist.js`，从实际 `geolocation-cn` 快照抽取域名样本，并保留生产 policy 顺序，用回环上游计数验证 A/AAAA 和真实直连拨号。确认更具体的服务 policy、游戏下载直连与海外游戏排除边界和名单外查询仍使用各自解析器；上游成员更新仍由客户端 HTTP provider 每日直接拉取。

DNS resolver 回归同时锁定 Ali DoH (`dns.alidns.com`)、Tencent DoH (`doh.pub`)、Cloudflare 强制 DoH-H3 (`cloudflare-dns.com`) 和 Google DoH (`dns.google`) 的职责：普通默认查询使用 Cloudflare 与 Google；代理节点域名引导使用 Ali 与 Tencent，并经直连建立连接，避免节点可用前依赖境外解析器。Mihomo 要求 IP 字面量的 `default-nameserver` 使用 Ali/Tencent IP DoH，并保留证书域名校验。国内动态 policy 使用域名端点，不使用 IP 启动解析器作为通用回退。

只改文档时检查链接与原则一致性即可；行为改动须运行项目测试、生成一致性检查与可用的原生验证。方法和隐私/延迟结论的边界见 [验证说明](../docs/validation.md)。
