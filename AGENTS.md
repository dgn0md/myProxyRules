# 仓库项目维护约定

适用于仓库所有贡献者，统一描述项目功能边界、产物生成流程和验收要求。国内 DNS 查询范围与更新边界同时遵守 [国内 DNS 白名单维护原则](docs/dns-whitelist.md)，后续相关修改须以此为前提。

## 项目范围与产物

- 项目基于 AIsouler/MyClash `4861619be366c7bacabfed6d581bb8c450de1ca1` 全量版；上游图标约定见 `docs/upstream/AGENT.md`；其中历史规则源与测试数量不替代本仓库当前的 DNS 原则和验收要求。
- `Script/mihomoScript.js` 与 `Config/mihomoConfig.yaml` 是 Mihomo 的唯一功能源，不增加精简版脚本；`极简分流` 是脚本选项。
- `tools/build-targets.js` 从同一 Mihomo 配置对象生成 Stash、Surge、Shadowrocket 和 Quantumult X 原生配置，适配器不是第二套功能源。
- Mihomo 静态 YAML 与四种目标客户端 profile 及 CDN 副本均由 GitHub Actions 生成。Mihomo YAML 保留 Raw/CDN SHA-256；目标配置使用各自 Raw/CDN SHA-256 标识。
- YAML 的 `x-myClashRules` 扩展字段只供构建工具读取，Mihomo 内核不会执行。

## 模块化与动态规则集原则

后续开发同时遵守 [模块化与动态规则集开发原则](docs/development-principles.md)。

- 按功能和动态集合组织模块，优先核查并复用现用上游，不为漏匹配的业务域名或测试端点逐个增加模块或补丁。
- 同用途复用统一开关；国内服务路由使用 `国内服务优先直连`，不增加厂商独立开关。现有 DNS 白名单开关保持各自边界。
- 优先用上游集合与子集关系表达范围，实际审查覆盖、海外成员及共享服务；不因规则名或厂商归属直接扩大直连或国内 DNS。
- 客户端每日直接更新 provider；本仓库不另行维护、筛选合并或发布重复成员清单。测试快照不进入生产产物。
- Stash 沿用 Clash/Mihomo provider 与 MRS；Surge、Shadowrocket、Quantumult X 只转换已声明的原生规则源。若无法证明域名集合和 AND/NOT 语义等价，不生成国内直连规则；规则集和 DNS 差异记录在 `docs/client-compatibility.md`。
- 四种目标客户端产物只包含示例订阅 URL，不包含真实节点或凭证。不得把 Mihomo JavaScript 直接改名为其他客户端脚本；当前不生成客户端专属重写、定时任务、MITM 或模块。
- 删除无用的专用接口、导出、占位包装、独立文件及引用；必要内部复用以实际职责为依据，不为未来假设保留接口。
- 保留有明确功能依据的 Apple/协议等精确例外；新增例外需记录集合无法表达的原因、范围、优先级和回归依据，不以测试页结果作为补域名理由。

## 必须保留的行为

- 保留上游地区、倍率、家宽分类，以及节点清理/补旗、零宽字符处理、去重、`dialer-proxy` 和节点 hosts 映射算法及其回归测试。
- 覆写或展开机场配置时，只处理节点信息。机场 DNS、`fake-ip-filter`、DNS policy、hosts 表、路由、策略组和其他非节点设置不得进入输出；这些设置由脚本生成。机场 DNS 只可用于节点解析安全检查和 hosts 改写条件判断；机场 hosts 只可用于改写节点 server。
- 严格加密 DNS 默认拒绝 system/DHCP、明文 UDP/TCP、跳过证书校验和不受支持的私有明文解析；不得静默回退。严格检查针对脚本生成的 DNS 配置，文档须区分机场输入与生成结果。
- 发布配置默认不启用外部控制 API，也不自动下载 Web 控制面；本地管理入口由客户端另行配置密钥。
- 可路由的精确域名、后缀域名及动态 domain/classical 规则集，目标为 `直连` 时使用国内加密 DNS，目标为服务组时 DNS 请求经对应服务组选择出口；仅因 IP 兜底规则直连或未命中明确域名 policy 的查询仍用默认国外 DNS。`private` 保留本地 hosts/system 或严格模式下的 RCODE 安全 policy。Apple 例外：
  - `Other Apple Service` 连接默认直连；通用 `rule-set:apple`、`gateway.icloud.com` 和 `setup.icloud.com` 的 DNS policy 使用 `Siri Ai/Apple Intelligence` 当前选择。没有合格的 Siri 地区候选且普通 Apple 默认直连时，这些域名改用国内加密直连 DNS，避免直连连接被 NXDOMAIN 阻断。
  - AppleProxy 动态集合、Apple 产品入口与 `apple_ip` 进入 `AppleProxy`；`apple-dns.net` 和 `apple-dns.com` 的 DNS policy 使用该组。
- `private` 和拒绝出口可用专用安全 policy。明确直连域名 policy、`geolocation-cn` 成员、国内服务集合、国内 DNS 白名单及 Apple 国内例外使用阿里/腾讯 DoH；服务组目标的 DNS 请求跟随对应组选择。普通默认业务查询使用 Cloudflare 强制 DoH-H3 与 Google DoH；代理节点域名使用阿里/腾讯 DoH 并经 `DIRECT` 建连，避免代理启动前依赖境外解析器。Mihomo 的 `default-nameserver` 启动解析必须使用 IP 字面量，因此配置阿里/腾讯 IP DoH，并仅用于解析加密 DNS 端点域名。IP-CIDR provider 本身没有域名 DNS。
- 阿里、百度、B站、字节、中国移动/电信/联通、华为云、京东、网易、腾讯、小米国内服务模块使用 Bett 厂商集合；有同源 `@!cn` 子集时，路由与国内 DNS policy 都按 `domestic AND NOT domestic_noncn` 匹配，百度没有配套子集，路由和 DNS policy 都使用完整百度集合。连接规则与厂商 DNS policy 统一受默认开启的 `国内服务优先直连` 控制；专用服务规则先于模块，模块先于通用 CN 域名、国外域名与 IP 兜底。海外标注不完整仍可能影响分类。
- IP 规则顺序保留 `apple_ip`、`private_ip`、服务 IP、`cn_ip` 直连兜底的优先级，避免服务 IP 被通用 CN 集合先匹配。
- Apple 精确规则须先于广告、Apple CN 和可选 QUIC 拒绝规则。不得用整个 Apple、Cloudflare 或 `17/8` 网段代替精细端点分流。
- 策略组名称原样保留：`Siri Ai/Apple Intelligence`、`AppleProxy`、`Other Apple Service`。旧 `Apple Product地区` 开关作为 `AppleProxy` 的兼容别名读取。
- 保留默认语义：`Other Apple Service` 默认直连；`AppleProxy` 初始美国且可选直连；Siri 组优先选择美国，没有合格候选时拒绝连接。

## 国内 DNS 白名单原则

- 连接路由和 DNS 解析器分别决定；显式域名规则或动态 domain/classical 规则集匹配且目标为 `直连` 时，按同一域名谓词使用国内加密 DNS。仅因 `cn_ip` 等 IP 兜底规则直连、未命中明确域名 policy 的查询不自动切换到国内 DNS。通用 `cn`/`douyin` 集合不单独授权国内解析。`geolocation-cn` 独立授权其动态成员；国内服务模块开启时，11 组配对集合按 `domestic AND NOT domestic_noncn`、百度按完整集合授权国内加密 DNS，均随 `国内服务优先直连` 开关启停，不新增域名规则清单。不配置通用 `direct-nameserver`，不因解析失败而回退国内 DNS。
- `国内CDN解析`、`微软下载解析`、`Steam下载解析` 默认开启并可独立关闭，不受服务组、极简模式或国内路由开关隐式控制。名单重叠与专项例外分别判断，不能把关闭单个集合描述为禁止域名的一切国内解析。
- 客户端 HTTP provider 每 86400 秒直接更新上游；不改为 CI 筛选、合并或发布仓库白名单。配置构建与运行时规则更新分别维护。
- 显式主机/后缀 DNS policy 先于动态集合；白名单与更具体服务 policy 先于国内服务 policy，再先于广域 `geolocation-cn` policy。代理服务的 DNS policy 经对应服务组选择出口；明确直连的域名规则使用国内 DoH。保留 Steam 服务器/用户内容域的国外解析和 Apple 专项例外。新源须审查实际成员，不能直接采用通用 CDN、整厂商或公共云大集合。
- 修改白名单/解析器/优先级时同步 [统一原则](docs/dns-whitelist.md)、功能文档和配置/原生回归；保留 DNS 专用 provider 的引用，禁止以通用国内 DNS 兜底修复可用性。缓存、Fake-IP、DoH 与 `no-resolve` 均不能作为“零泄漏”证明。

## 文档、数据与验收

- 更新功能、默认值、组名或 DNS/路由行为时，检查 README、`docs/dns-whitelist.md`、`docs/feature-matrix.md`、`docs/apple-routing.md`、`docs/rule-sources.md`、`docs/client-compatibility.md`、`docs/validation.md` 和 `Test/README.md`.
- 区分静态 provider 与带 `--subscription` 的本地展开模式；不得声称静态 provider 能读取订阅中的私有 DNS、hosts 或动态节点名称。
- 不在功能文档混入个人观察、设备日志、真实出口地址或验证记录；不得新增或提交机场链接、密码、节点清单、缓存和运行日志。
- 图标沿用原 SVG URL，不修改 SVG；遵守 `docs/upstream/AGENT.md`，不补回 CDN 域名直连规则。
- 国内服务路由模块及其新增原生回归按动态集合组织，不维护单独业务域名清单；测试样本从下载快照自动提取，解码与运行证据只留在忽略目录，不参与客户端规则生成。
- GitHub Actions 的 `Verify full overrides` 在 runner 上生成 Mihomo YAML 与四种目标客户端 profile，运行项目测试、所有生成一致性检查和可获得的 Mihomo 原生配置校验；`Sync script and generate config` 必须通过相同的行为和原生校验后才能提交产物。目标 profile 的一致性检查不等于四个应用的导入验证。维护者可在本地用项目锁定工具链重生不含隐私数据的发布产物以完成回归，不要求最终用户本地生成配置。单元测试或配置解析不能描述成用户网络抓包或 Apple 服务可用性实测；行为变化须有回归断言。
- 每次向远端推送前，须在将要推送的提交上依次通过 `./tools/npmw test`、`./tools/npmw run check` 和 `./tools/npmw run native:check`；任一失败或未完成时不得推送。`.githooks/pre-push` 执行同一门禁；使用 GitHub API 等不触发本地 hook 的接口时，也须先手动运行并确认这三项通过。验证后若提交内容有变化，推送前重新运行。
- 用户要求推送时，门禁通过后使用当前已授权的 GitHub 接口更新远端；不运行 `git push`，也不查找或配置命令行凭证。
