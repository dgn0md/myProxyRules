# Apple 路由范围与边界

Apple 规则按明确的产品入口和共享服务端点分组。它们只选择网络路由和 DNS 出口，不解密 HTTPS，也不改变 Apple 账号、设备或内容授权状态。精确规则由 `Script/mihomoScript.js` 生成。

## 策略组

本页的精确路由与动态 MRS 行为描述 Mihomo/Stash 输出。其他客户端按原生规则源生成 profile，AppleProxy 列表成员和 DNS 出口可能不同；不要将其视为 Apple 分流等价验证，详见[多客户端兼容性说明](client-compatibility.md)。

| 策略组                                               | 路由范围                                                                                                                                                                                                           | 默认选择                                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Siri Ai/Apple Intelligence`（开关 `Apple智能分流`） | Apple Intelligence、Siri、PCC、`gspe1-ssl.ls.apple.com` 地区检测端点，以及部分 Private Relay/iCloud 内容端点。`gspe1` 按当前策略归入 Siri 组，尽管 Apple 也将它用于地图、eSIM、Watch 和 Wi-Fi Calling 等地区能力。 | 可选地区组排除香港、澳门、大陆及美国制裁/出口限制涉及地区，默认美国（有美国候选时）；无可用地区候选时拒绝连接。DNS 与路由跟随该组当前选择。 |
| `AppleProxy`                                         | Blackmatrix7 AppleProxy 动态集合、News/TV/TV+/Fitness/Sports/Books 产品入口、`apple_ip` 地址集合与 `apple-dns.net` / `apple-dns.com` 服务域名。                                                                    | 初始美国，可在客户端切换到其他可用候选或直连。旧 `Apple Product地区` 选项作为兼容别名读取。                                                 |
| `Other Apple Service`（开关 `Apple其他服务`）        | Apple 动态域名集合、其他常规 Apple 规则，以及精确匹配的 `gateway.icloud.com`、`setup.icloud.com`。                                                                                                                 | 连接默认直连；DNS 使用 `Siri Ai/Apple Intelligence` 当前选择的出口。                                                                        |
| `Apple媒体代理` 开关                                 | 少量共享购买和媒体接口。                                                                                                                                                                                           | 选项默认关闭。                                                                                                                              |
| `Apple下载直连` 开关                                 | 系统更新与 Apple 共用资源 CDN。                                                                                                                                                                                    | 选项默认开启并由直连规则处理。                                                                                                              |

阿里、百度、B站、字节、运营商、华为云、京东、网易、腾讯、小米国内服务模块排在专用服务规则之后，不覆盖 Apple 精确例外或服务组选择；模块的厂商 DNS policy 与连接规则统一由 `国内服务优先直连` 控制。

`AI`、`Google`、`TikTok`、`Meta` 与 Apple AI 组都只提供允许地区组，排除香港、澳门、大陆、俄罗斯、白俄罗斯、古巴、伊朗、朝鲜、克里米亚、顿涅茨克和卢甘斯克；默认选择美国（有美国候选时）。DNS policy 指向各自服务组，因此解析出口随该组当前选择变化；没有任何合格地区候选时，Apple AI 组拒绝连接，不回退到默认代理或直连。组名按完整地区名匹配，因此台湾仍是允许选项。

## 规则顺序与 DNS

1. DNS 53 接管规则先处理进入 TUN 的 DNS 流量。
2. Siri/PCC 精确域名先于 AppleProxy 与 TV+ 动态 provider；Apple 规则先于广告、Apple CN 规则及可选 QUIC 拒绝。
3. 服务域名规则按启用状态进入对应服务组。
4. 启用的 `apple_ip` 使用 `no-resolve` 进入 `AppleProxy`，且位于 `cn_ip` 直连兜底之前；`private_ip` 使用 `直连,no-resolve`；Google、Telegram、TikTok、Twitter、Facebook/Meta IP 使用对应代理组及 `no-resolve`，组关闭时回退到 `默认代理`；其他服务 IP 集合按对应服务组分流。
5. `cn_ip` 位于专用 IP 规则之后，只负责剩余匹配的直连兜底。

代理服务的精确域名、后缀域名和动态集合生成对应的 `nameserver-policy`，DNS 请求经对应服务组选择出口。明确目标为 `直连` 的精确域名、后缀域名和动态 domain/classical 集合使用阿里/腾讯 DoH；仅因 IP 兜底规则直连的连接不会据此改变默认 DNS policy。命中现有 `geolocation-cn` provider 的域名始终使用阿里/腾讯 DoH，国内服务模块开启时，11 组配对集合和完整百度集合的成员也使用这两个解析器。`Other Apple Service` 的连接按该组当前选择路由，默认直连；它的通用 `rule-set:apple`、`gateway.icloud.com` 和 `setup.icloud.com` DNS 查询跟随 `Siri Ai/Apple Intelligence` 当前选择。`.apple-dns.net` 与 `.apple-dns.com` 进入 `AppleProxy`，DNS policy 也跟随该组。AppleProxy 动态集合的域名 DNS 跟随 `AppleProxy`；其中被更早 Siri/PCC 精确或后缀规则覆盖的成员仍使用 Siri DNS。IP-CIDR 集合本身没有查询域名；有对应域名 provider 的服务会使用相同目标组。

通用 `cn` 集合不再参与 DNS policy 或 Fake-IP 过滤，仅在可选 QUIC 规则引用时保留；现有 `geolocation-cn` 独立使用国内 DNS policy，国内服务开关开启时 11 组配对集合及百度完整集合使用国内 DNS policy，`cn_ip` 继续承担连接直连兜底。国内 DNS 不引入整份 `apple_cdn`、Apple 或 Cloudflare 网段。Apple CN 仍使用固定版本集合，不随新的下载 DNS 开关改变。

如果订阅没有合格的 Siri 地区候选，Siri 组仍拒绝连接。当 `Other Apple Service` 保持默认直连时，通用 Apple 集合及 `gateway.icloud.com`、`setup.icloud.com` 改用国内加密直连 DNS，维持普通 Apple 服务的直连可用性；一旦出现合格候选，其 DNS 再跟随 Siri 组。关闭普通 Apple 默认直连时，不启用此解析回退。

## 后续维护原则

Apple 行为变更同时遵守 [国内 DNS 白名单维护原则](dns-whitelist.md)。模型资源四个精确端点、固定 `apple_cn` 和普通 Apple 无合格 Siri 候选时的条件回退是明确例外，不能据此把整份 `apple_cdn`、整个 Apple 或共享 CDN 加入国内 DNS。下载 DNS 开关独立于 Siri/产品组；修改时验证显式 DNS policy 优先于动态集合，并同时覆盖有/无合格候选、普通 Apple 默认直连开启/关闭的场景。

## 共享端点与选择边界

- 国际 iCloud 内容规则按 `icloud-content.com` 后缀匹配；中国地区专用命名空间不匹配该规则。后缀只表示路由范围，不表示服务器实际所在地区。
- 共享 iCloud/Relay/Apple 媒体端点可能被多个产品使用。`gateway.icloud.com` 与 `setup.icloud.com` 按精确主机归入 `Other Apple Service`；网络层只看到域名、IP 与协议元数据，不能根据 HTTPS 路径保证区分每个应用。
- 国际照片、文件或备份流量可能与 Siri 共用路由组，造成额外代理流量。
- 产品可用性还受账号地区、设备资格、系统版本、SIM 和服务端策略影响。地区组按节点名称筛选候选，不证明公网出口所在地。
- 部分 Apple 服务需要客户端的 TUN/Network Extension 能力；普通系统代理不一定覆盖所有流量。
- QUIC 阻断默认关闭。启用后 Apple 精确规则先于 UDP/443 拒绝规则；规则顺序不能保证代理节点支持 UDP。

## 动态集合与精确规则边界

- AppleProxy 使用 Blackmatrix7 `AppleProxy.yaml` classical provider，按 86400 秒由客户端更新；该集合的域名成员统一路由到 `AppleProxy`。集合含共享地区检测及其他 Apple 服务入口，因此这是明确选择的组范围，不意味着所有成员都是单一产品专用域名。
- 上游 `apple-tvplus` MRS 继续覆盖 TV+ 专属集合及 AppleProxy 集合未含的成员；两者共用 `AppleProxy` 出口。原有 TV 主机逐条规则已移除；原生检查从实际 provider 快照抽取样本，不维护另一份 TV 域名清单。
- `gspe1-ssl.ls.apple.com`、PCC、Siri/Relay 后缀及国际 `icloud-content.com` 规则排在 AppleProxy 动态 provider 之前，继续进入 Siri 组。`apple-intelligence` 集合更窄，不能完整表达当前 Relay 后缀范围，因此不替换这些规则。
- News、Fitness、Sports、Books 仍保留集合未覆盖的有限产品入口。Blackmatrix AppleNews 的小集合不能单独代表完整 News 服务；共享 `gspe1` 按已确认策略归入 Siri 组。
- 通用 `apple` provider 归入 `Other Apple Service`；`gateway.icloud.com` 和 `setup.icloud.com` 由精确规则归入该组。它们的 DNS 与 `rule-set:apple` 一样跟随 Siri 选择；连接默认仍为直连。
- `fsend.cn`、`ctaiot.com`、NVIDIA 下载端点和 Emby 的少量服务后缀只有在现有相应 provider 快照之外时才保留精确规则。规则来源页记录了 2026-11-19 的成员审查结果；上游集合更新后应重新检查覆盖与出口边界。

## 规则来源

- Apple 企业网络清单：Apple 服务端点与网络要求。
- AppleFlow：PCC、Apple Intelligence 与 Siri 相关公开规则清单。
- Domain List Community、Bett Rules 与 Apple 产品服务规则：产品分类和动态域名集合。
- SukkaW Surge 固定版本：大陆专用 Apple 域名 provider。

这些来源用来界定规则范围；规则并不代表完整的 Apple 后端清单。
