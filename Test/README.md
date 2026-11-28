# 节点处理与兼容性测试

本目录负责验证 `Script/mihomoScript.js` 的节点处理逻辑、ES2026 语法兼容性及 QuickJS 执行兼容性。

## 1. 运行命令

```sh
./tools/npmw test
# 或单独运行节点兼容套件：
node Test/run-tests.js
```

## 2. 测试套件分工

| 套件 | 覆盖范围 |
| --- | --- |
| `Test/run-tests.js` | 域名匹配、rule-set 引用收集、地区/倍率/家宽识别、零宽字符剥离、补旗、去重、`dialer-proxy` 修复、hosts 链式改写与机场配置隔离；同时校验 ES2026 语法与 QuickJS 运行时兼容。 |
| `tests/*.test.js` | 生成配置图无环校验、Apple/Siri/PCC 与服务路由、13 组国内厂商 `AND NOT` 与 `+.cn` 开关、DNS 白名单与严格加密 DNS、IP provider 顺序、多客户端选源注册表及静态生成一致性。 |
| `tools/native-check.js`（`native:check`） | 锁定版 Mihomo 内核语法校验、公开快照抽样回环 CONNECT 路由、隔离 DNS 上游计数器（`tools/native-dns-whitelist.js`）、纯 IP HTTP/TLS/QUIC 嗅探（`tools/native-sniffing.js`）与健康检查。 |

## 3. 新增测试须遵守的约束

| 约束 | 要求 |
| --- | --- |
| **动态抽样，不维护业务名单** | 国内厂商、`geolocation-cn`、`apple_proxy`、`apple_tv` 样本均从实际公开快照自动提取，集合外用合成 `.invalid` 域名；快照与解码证据仅保存在忽略目录。 |
| **路由与 DNS 分别断言** | 显式直连域名与动态集合使用阿里/腾讯 DoH；代理服务组跟随对应出口；`default-nameserver` 保持 IP DoH；不得因可用性问题放宽国内 DNS 或引入 `direct-nameserver`。 |
| **边界表述一致** | 配置测试、离线原生回环与真实设备/运营商网络属于不同验证层级；只改文档时核对链接与原则一致性即可。 |

关联文档：[开发原则](../docs/development-principles.md) · [国内 DNS 白名单原则](../docs/dns-whitelist.md) · [多客户端兼容性](../docs/client-compatibility.md) · [验证说明](../docs/validation.md)
