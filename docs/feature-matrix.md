# 功能目录

规则与选项以 `Script/mihomoScript.js` 为准；静态 YAML 由同一脚本生成。后续功能与默认值变更同时遵守 [国内 DNS 白名单维护原则](dns-whitelist.md)。

模块边界、统一开关、动态来源与接口精简遵守 [开发原则](development-principles.md)。

## 本仓库重点维护

Mihomo 是主支持客户端和唯一功能源。Stash 位于 Mihomo 支持入口下，使用 Mihomo 风格配置并保留主要 MRS/provider/DNS 能力。Surge、Shadowrocket 和 Quantumult X 使用单独的原生 profile；由于规则、逻辑表达式与 DNS policy 格式不同，其覆盖边界见[多客户端兼容性说明](client-compatibility.md)。这些 profile 不包含各应用专属脚本或模块。

全量与极简模式下，`GLOBAL` 首次默认选择 `美国`，`默认代理` 首次默认选择 `自动选择ex(大陆&香港)`（由 `排除大陆香港自动选` 开关控制）；候选组不存在时保留其他有效选项，已有客户端选择缓存优先。

| 功能             | 实现范围                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple 分流       | Siri / Apple Intelligence、`AppleProxy` 动态集合与产品入口、其他 Apple 服务分组；连接出口与 DNS policy 按专项规则配置。                                                                                                                                                                                                                                             |
| 国内服务路由模块 | 阿里、B站、字节、三家运营商、华为云、京东、网易、新浪/微博、腾讯、小米、小红书共 13 组（全部按 `domestic AND NOT domestic_noncn`）以及 `geolocation-cn` 之后的 `DOMAIN-SUFFIX,cn,直连` 统一受默认开启的 `国内服务优先直连` 控制；百度、国内银行、美团、拼多多、知乎已由 `geolocation-cn` 覆盖。专用服务规则优先。 |
| DNS 控制         | 明确路由到 `直连` 的域名规则与动态域名规则集、`geolocation-cn`、开启国内服务模块时的 13 组 `domestic AND NOT domestic_noncn` 集合与位于 `geolocation-cn` 之后的 `+.cn` 后缀、`海外游戏` 组内直连的游戏平台国内下载集合，以及默认启用的 `dns_domestic_cdn`、`dns_microsoft_cdn` 使用阿里/腾讯 DoH。默认接管 TCP/UDP 53 并以 `DST-PORT,853,REJECT` 拦截外部 DoT/DoQ；`AdBlock` 同时拦截 `category-ads-all` 与 `httpdns`。代理服务的 DNS 请求经对应服务组选择出口。普通默认查询使用 Cloudflare DoH-H3 与 Google DoH；代理节点域名引导使用阿里/腾讯 DoH 并通过直连建连；`default-nameserver` 使用阿里/腾讯 IP DoH 启动解析。仅因 IP 兜底直连或未命中明确域名 policy 的查询仍使用默认国外 DNS；严格模式不明文降级。 |
| 机场覆写         | 展开模式只处理节点和节点 hosts 映射，其他机场配置不进入输出。                                                                                                                                                                                                                                                                                                       |
| 纯 IP 入站识别   | 以 HTTP Host、TLS SNI 和受支持的 QUIC 元数据补充域名，不改写目标地址。                                                                                                                                                                                                                                                                                              |
| 单一构建来源     | 脚本管理 Mihomo 行为；静态 YAML、Stash Mihomo 风格 profile 和三个其他客户端 profile 由构建工具生成，扩展开关须重新构建。                                                                                                                                                                                                                                                                             |
| 自动选择排除组   | `排除大陆香港自动选` 控制 `自动选择ex(大陆&香港)`，按节点名称过滤大陆、香港候选并保留台湾节点。                                                                                                                                                                                                                                                                     |
| 本地控制面       | 生成配置默认不提供外部控制 API 或自动下载控制面；本地客户端可单独配置受密钥保护的管理入口。                                                                                                                                                                                                                                                                         |
| 隔离策略诊断     | 本地 `diagnose` 命令以真实 Mihomo 规则和合成回环出口，报告 TCP 域名/IP 的命中规则、策略链及域名 DNS policy 候选。                                                                                                                                                                                                                                                   |

Apple 组范围与 DNS 特例见 [Apple 路由说明](apple-routing.md)；provider 和规则优先级见[规则来源说明](rule-sources.md)。

## 常规能力

提供地区、倍率和家宽节点分类，常见服务域名与 IP 分流，以及手动、自动测速、IPv4/IPv6、TUN 和链式代理等选项。地区候选由节点名称识别，不能证明真实出口地区。
私网 IP 使用 `直连,no-resolve`；Google、AI（OpenAI）、Telegram、TikTok、Twitter、Facebook/Meta IP 使用代理出口及 `no-resolve`，关闭服务组或启用极简模式时改用 `默认代理`。Apple、Microsoft、Netflix、Spotify IP 与末端 `cn_ip` 均使用 `no-resolve`，避免 Fake-IP 下未知海外域名触发本地双重 DNS 解析。
测速地址为 `https://www.apple.com/library/test/success.html`；内核测速请求通过被测节点发起，Mihomo 的 provider 健康检查与自动测速组期望 HTTP 200。它只检查状态码、不校验网页正文。普通 `www.apple.com` 访问仍遵循现有 Apple 路由与 DNS policy；探测服务异常也可能造成节点暂时不可用。

Mihomo 默认使用 `mips` TUN 栈和 ARC DNS 缓存。`dns-mode` 沿用内核平台默认：自动路由下 Windows/Linux 默认为 `hijack`，macOS 默认为 `disabled`。`dns-hijack` 仅处理进入内核且匹配的 DNS 流量，并不能保证设备所有 DNS 都被接管。

DNS policy 在极简模式和服务组关闭时仍按各自边界生效；HTTP provider 每 86400 秒直接更新。`geolocation-cn` 独立于国内服务开关；厂商 DNS policy 与国内服务路由统一受该开关控制，不新增域名清单。DNS policy 只决定解析器，不强制改变路由。目标为 `直连` 的明确域名规则使用国内 DoH；代理服务 DNS 请求经对应服务组选择出口。普通业务查询使用 Cloudflare DoH-H3 与 Google DoH；代理节点域名使用阿里/腾讯 DoH，经 `DIRECT` 建连，避免节点可用前依赖境外 DNS；DoH 端点启动解析使用阿里/腾讯 IP DoH。Apple 专项例外仍按国内白名单与服务出口规则处理；不配置通用 `direct-nameserver`，未命中明确域名 policy 的查询继续使用默认 DNS。

维护时分别检查连接路由和 DNS 授权：关闭单个 DNS 集合只撤销该集合的授权，不清除其他重叠集合或 Apple 专项例外；国外解析失败也不自动转向国内 DNS。上游动态成员更新由客户端完成，配置选项更新才需要重新构建。

## 配置模式

| 模式      | 输入                                       | 节点处理                                                                                        |
| --------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 脚本覆写  | 含 `proxies` 数组的 Mihomo/Clash 配置      | 脚本处理节点并生成完整配置。                                                                    |
| 静态 YAML | 配置 `proxy-providers.订阅.url` 后导入内核 | 内核按 provider 读取订阅；构建时看不到节点名称或机场 hosts。                                    |
| 本地展开  | 选项 YAML 与 `--subscription` 本地文件     | 构建工具将节点交给同一脚本处理，默认输出到忽略的 `.local/expanded.yaml`；订阅更新后需重新生成。 |

YAML 中的 `x-myProxyRules` 是构建输入，Mihomo 不执行这些扩展字段。旧设置文件须将 `x-myClashRules` 改名为 `x-myProxyRules`；构建工具遇到旧键会报错，避免静默忽略设置。开发命令和节点处理测试见 [Test/README.md](../Test/README.md)。

静态 provider 在加载时会移除“大陆旗帜 + 台湾文字”的冲突旗帜；地区筛选可识别已有英文地区缩写字母之间的零宽空格 U+200B，不因此更改节点名称或链式引用。展开模式还会处理其他文字与国旗冲突、其他不可见字符和重名节点，因此两种模式对异常名称的地区归类仍可能不同。需要完整节点归类时使用本地展开模式。
