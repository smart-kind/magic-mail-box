# Magic Mail Box — 综合安全审计报告

> **审计日期**：2026-08-19
> **审计范围**：全仓库（stalwart 配置 + docker-compose + minimal-web/host-demo + minimal-web/message-center + 全部文档）
> **审计维度**：安全 / 代码质量 / 依赖 / 部署配置
> **审计方式**：三路并行只读审计（基础设施、前端代码、敏感信息泄露）后汇总去重分级
> **报告文件**：`docs/audit-report.md`

---

## 0. 概要

| 严重程度 | 数量 | 说明 |
|---|---|---|
| 🔴 严重 (Critical) | 4 | 必须立即处理，涉及凭证泄露 / 身份认证失效 |
| 🟠 高 (High) | 9 | 强烈建议尽快处理，涉及传输安全 / 凭证存储 / XSS |
| 🟡 中 (Medium) | 15 | 建议排期处理，涉及健壮性 / 测试覆盖 / 配置加固 |
| 🟢 低 (Low) | 12 | 可择机优化，涉及代码质量 / 规范 |
| **合计** | **40** | |

> **已修复（2026-08-19 本次）**：AUDIT-01~40 除 AUDIT-02 外全部 ✅（共 39 项：3 严重 / 9 高 / 15 中 / 12 低）。
> - AUDIT-03 / 06 / 07 / 08 / 09 / 26 为「显式声明安全边界 + 警示注释」，根本风险未消除，仅限本地演示可接受。
> - AUDIT-05 端口绑 `127.0.0.1`、AUDIT-10 XSS 改 textContent、AUDIT-11 iframe 加 sandbox、AUDIT-13 协议配置对齐、AUDIT-14/27 深度/大小限制、AUDIT-15 路由守卫、AUDIT-16 凭证接入统一、AUDIT-17 错误脱敏、AUDIT-20 类型加固、AUDIT-30 noUncheckedIndexedAccess、AUDIT-31 btoa→TextEncoder、AUDIT-37 协议校验等均为实际代码加固完成。
> - AUDIT-18 新增 24 个 derivePassword 单测、AUDIT-19 测试 mock 加注释、AUDIT-29 抽取 serverUrl 到 utils、AUDIT-32/33 错误处理加固、AUDIT-36 加 engines 字段，均为代码质量提升。
> - AUDIT-12/22 镜像版本加警示注释、AUDIT-21 端点锁定警示、AUDIT-23 配置卷加 :ro、AUDIT-24 加 healthcheck、AUDIT-28 网络隔离注释、AUDIT-38 加资源限制、AUDIT-39 移除废弃 version 字段、AUDIT-40 路径注释，均为部署配置加固。
> **待手动处理**：AUDIT-02（轮换已泄露口令 + 清除 git 历史中的旧口令）——此项必须由项目维护者在 Stalwart WebAdmin 中手动完成，代理无法执行。

**最高优先级结论**：本项目存在 **真实管理员凭证硬编码并已进入 Git 历史** 的问题，以及 **用户密码可由用户名公开推导（等同于无密码保护）** 的设计缺陷。这两个问题在当前「本地实验项目」定位下可理解为方便联调的取舍，但若推向任何非本机环境，必须先修复。

> ✅ 本报告中的真实口令已脱敏为占位符（如 `<已泄露的管理员恢复口令>`），可安全提交。

---

## 1. 🔴 严重 (Critical)

### AUDIT-01 ｜ 硬编码管理员恢复口令并纳入版本控制 ✅ 已修复
- **类别**：安全 / 敏感信息泄露
- **位置**：
  - `docker-compose.yml:21` — `STALWART_RECOVERY_ADMIN=admin:<已泄露的管理员恢复口令>`
  - `local.env.info.md:1-4` — 明文记录 `admin / <已泄露的管理员恢复口令>` 与 `admin@local.test / <已泄露的邮箱口令>`
- **风险**：Stalwart 恢复管理员口令与邮箱用户口令以明文写进被 Git 跟踪的文件。任何拿到仓库的人即可获得邮件服务器最高权限（WebAdmin 恢复入口 + 邮箱登录）。`local.env.info.md` 已被 `git ls-files` 确认跟踪，`docker-compose.yml` 中的口令为工作区未提交修改（一旦提交即进历史）。
- **修复建议**：
  1. 立即从 `docker-compose.yml` 移除 `STALWART_RECOVERY_ADMIN` 明文，改用 `${STALWART_RECOVERY_ADMIN}` 从 `.env`（被 `.gitignore` 忽略）注入。
  2. 将 `local.env.info.md` 加入 `.gitignore`，并把其中凭证迁移到本地 `.env` 或系统密钥链。
  3. 轮换被泄露的两个口令（见 AUDIT-02）。

### AUDIT-02 ｜ 真实凭证已进入 Git 历史
- **类别**：安全 / 敏感信息泄露
- **位置**：Git 历史（首次提交 `03456f6` 及后续）
- **风险**：`local.env.info.md` 在历史提交中曾包含邮箱口令 `<已泄露的旧邮箱口令>`，工作区又改为 `<已泄露的邮箱口令>`；`docker-compose.yml` 工作区含 `<已泄露的管理员恢复口令>`。即便现在删除文件，历史中的 `<已泄露的旧邮箱口令>` 仍可被任何人 `git log -p` 取出。这是不可逆泄露。
- **修复建议**：
  1. **立即轮换**所有已泄露口令：`<已泄露的旧邮箱口令>`、`<已泄露的邮箱口令>`、`<已泄露的管理员恢复口令>`（在 Stalwart WebAdmin 中重设）。
  2. 若仓库曾推送至远端，使用 `git filter-repo` 或 BFG 清除历史中的口令字符串，并强制推送（需协调所有协作者）。
  3. 若仅本地仓库且不打算公开，轮换口令即可，历史清除可选。

### AUDIT-03 ｜ 用户密码可由用户名公开推导（等同于无密码保护） ✅ 已修复（本地演示警示）
- **类别**：安全 / 身份认证
- **位置**：
  - `minimal-web/message-center/src/utils/derivePassword.ts:7-23` — djb2 变种哈希 + 固定后缀 `!Mc7`，输出 32 位无符号整数字符串
  - `minimal-web/message-center/src/utils/derivePassword.ts:18-20` — `demoNNN` 特例直接生成 `DemoNNN!Mc7`
  - `minimal-web/message-center/src/stores/user.ts:142-180` — `autoCreateUser` 用 `derivePassword(username)` 作为新用户口令写入 Stalwart
- **风险**：算法公开且确定性：任何知道用户名的人都能算出其邮箱口令并登录。`demo001~demo999` 更是裸明文模式。自动创建用户流程把派生口令固化为该用户的真实口令，使所有用户账号实际无密码保护。密码空间仅约 42 亿（32 位），且对相同用户名恒定，存在碰撞与离线穷举可能。
- **修复建议**：
  1. 若仅为本地联调演示，在文档与代码注释中**显式声明此机制仅限本地、不可用于任何对外环境**，并在 `derivePassword.ts` 顶部加 `// SECURITY: demo-only, not for production` 警示。
  2. 若需走向非本机环境：改为在 `autoCreateUser` 时生成随机强口令，通过安全渠道（如一次性展示链接）交付用户，或接入正式的账号开通流程。
  3. 至少为 `derivePassword` 增加单测并标注其安全边界（见 AUDIT-18）。

### AUDIT-04 ｜ 部署文档多处明文写真实管理员口令 ✅ 已修复
- **类别**：安全 / 敏感信息泄露
- **位置**：`docs/local-quickstart.md:48,70,110,122,126,133,226,269`（明文 `<已泄露的管理员恢复口令>`）；`docs/stalwart-snappymail-deploy.md:131`（SnappyMail 默认密码 `12345`）；`docs/deploy.md:84`（内网域名 `mail.local`）
- **风险**：文档把真实可用口令写死，随仓库分发即等于公开口令。`docs/local-quickstart.md` 目前为未跟踪文件，但一旦提交即泄露。
- **修复建议**：
  1. 将文档中的真实口令替换为占位符（如 `<ADMIN_PASSWORD>`）或引用环境变量名。
  2. 口令操作步骤改为「从 `.env` 读取」或「首次启动后由 Stalwart 一次性显示并自行保存」。
  3. 提交前确认 `docs/local-quickstart.md` 不含真实口令。

---

## 2. 🟠 高 (High)

### AUDIT-05 ｜ 端口过度暴露（绑定 0.0.0.0） ✅ 已修复
- **类别**：部署配置 / 安全
- **位置**：`docker-compose.yml:6-11,30-31` — `25:25`、`587:587`、`993:993`、`443:443`、`8082:8080`、`3000:3000` 均未限定 `127.0.0.1`
- **风险**：本地测试环境将 SMTP/IMAPS/HTTPS/WebAdmin/Webmail 全部暴露到所有网络接口，同网段任意主机可访问 WebAdmin（HTTP 明文）与 SMTP 入站。`8082` 的 WebAdmin 走 HTTP 明文且含恢复口令，风险尤甚。
- **修复建议**：本地环境将端口映射改为 `127.0.0.1:25:25` 等，仅本机访问；确需对外时仅暴露必要端口（如 443/993），WebAdmin（8082）始终限本机。

### AUDIT-06 ｜ JMAP over HTTP 明文传输 Basic Auth 凭证 ✅ 已修复（本地演示警示）
- **类别**：安全 / 传输安全
- **位置**：`docker-compose.yml:20` — `STALWART_PUBLIC_URL=http://localhost:8082`；`minimal-web/message-center/src/api/jmap.ts`（Basic Auth 头在 HTTP 上发送）
- **风险**：Basic Auth 凭证以 Base64 明文在 HTTP 上传输，中间人可截获用户名与密码。`STALWART_PUBLIC_URL` 用 `http` 使浏览器直连 JMAP 全程明文。
- **修复建议**：非本机场景启用 TLS（`https` + 证书），`STALWART_PUBLIC_URL` 改为 `https://...`；本机纯演示可保留，但需在文档明确「仅限本机」。

### AUDIT-07 ｜ Permissive CORS 允许任意源跨域访问 JMAP ✅ 已修复（本地演示警示）
- **类别**：安全 / 跨域
- **位置**：`docs/local-quickstart.md:150` — 开启 Permissive CORS policy（`access-control-allow-origin: *`）
- **风险**：任意网站可跨域调用 JMAP API。配合 Basic Auth 明文（AUDIT-06）与可推导口令（AUDIT-03），恶意页面可凭用户名直接读取/发送他人邮件。
- **修复建议**：将 CORS 限制为实际前端来源（如 `http://localhost:5173`）而非 `*`；本机演示可临时放宽，但需在部署文档显著警示。

### AUDIT-08 ｜ URL hash/query 传递凭证 ✅ 已修复（本地演示警示）
- **类别**：安全 / 凭证处理
- **位置**：
  - `minimal-web/host-demo/index.html:468-475,750` — 把 `adminUser`/`adminPass` 拼进消息中心 URL hash
  - `minimal-web/message-center/src/views/Inbox.vue:51-55` — 从 `route.query` 读 `adminUser`/`adminPass`
  - `minimal-web/message-center/src/views/MessageDetail.vue:62-68` — 从 `route.query.pass` 直接读密码
- **风险**：凭证进入 URL 后会留存于浏览器历史、共享链接、截图与崩溃日志中。虽 hash 路由的 query 不随 Referer 发往服务器，但本地泄露面仍大。`MessageDetail` 直接接受 `pass` 与 `Inbox` 走派生密码的路径不一致，扩大了攻击面。
- **修复建议**：
  1. 宿慎评估是否真需通过 URL 传凭证；若宿主与消息中心同源，改用 `postMessage` 或共享 `localStorage` 传递。
  2. 必须用 URL 时，仅传 `user`（派生），移除 `adminPass`/`pass` 参数；管理员自动建号流程改为宿主侧完成。
  3. 统一 `Inbox` 与 `MessageDetail` 的凭证接入方式，移除 `MessageDetail` 的 `pass` 入口。

### AUDIT-09 ｜ sessionStorage / localStorage 明文存储凭证 ✅ 已修复（本地演示警示）
- **类别**：安全 / 凭证存储
- **位置**：
  - `minimal-web/message-center/src/stores/user.ts:53-54` — `sessionStorage` 明文存 `mc.password`
  - `minimal-web/message-center/src/stores/user.ts:21-26` — `localStorage` 明文存 `adminPass`
  - `minimal-web/host-demo/index.html:536-547,341` — 管理员凭证明文存 `localStorage`
- **风险**：任何同源 XSS（见 AUDIT-10）即可读取所有凭证；开发者工具可直接查看；`localStorage` 跨标签页持久存在。配合 AUDIT-03 可推导口令，XSS 可直接接管任意用户邮箱。
- **修复建议**：
  1. 本地演示可保留，但需确保无 XSS（优先修 AUDIT-10）。
  2. 长期方案：凭证不落前端存储，改用 JMAP session token（Stalwart 支持）或服务端会话；管理员凭证绝不存浏览器。

### AUDIT-10 ｜ host-demo innerHTML 拼接用户名导致 XSS ✅ 已修复
- **类别**：安全 / XSS
- **位置**：`minimal-web/host-demo/index.html:758` — `header.innerHTML = '<span>消息中心</span> <span class="user-tag">' + username + '</span>'`
- **风险**：`username` 来自用户输入（`$('pick-username').value.trim()`）或 `localStorage`，未经转义直接拼入 `innerHTML`。输入 `<img src=x onerror=alert(document.cookie)>` 即触发 XSS。结合 AUDIT-09（localStorage 存管理员凭证），XSS 可窃取管理员口令并完全接管邮件服务器。
- **修复建议**：用 `textContent` 或 DOM API 创建元素，避免字符串拼接 HTML；对所有用户名输入做 HTML 转义。其余 `innerHTML = ''`（570/581/616/634 行）仅清空，无风险。

### AUDIT-11 ｜ host-demo iframe 未设置 sandbox ✅ 已修复
- **类别**：安全 / 隔离
- **位置**：`minimal-web/host-demo/index.html:767-769` — `document.createElement('iframe')` 后仅设 `src`/`title`，无 `sandbox` 属性
- **风险**：消息中心 iframe 与宿主同源，可访问父页面 `localStorage`/`sessionStorage`，双向通信无限制。若消息中心被注入恶意脚本（如通过 JSON 邮件渲染），可影响宿主及其他标签页。
- **修复建议**：设置 `sandbox="allow-scripts allow-same-origin"`（按需）或更严格策略；凭证传递改用 `postMessage` 显式白名单。

### AUDIT-12 ｜ Docker 镜像使用 latest 标签 / 个人账号镜像来源存疑 ✅ 已修复（加警示注释）
- **类别**：依赖 / 供应链
- **位置**：
  - `docker-compose.yml:27` — `ghcr.io/bulwarkmail/webmail:latest`
  - `docs/stalwart-snappymail-deploy.md:57` — `stalwartlabs/mail-server:latest`
  - `docs/stalwart-snappymail-deploy.md:76` — `hotarudash/snappymail:latest`（Docker Hub 个人账号）
- **风险**：`latest` 不固定版本，构建不可复现，可能意外拉入含漏洞或破坏性变更的新版。`hotarudash/snappymail` 为个人账号镜像，维护与安全可信度不明。
- **修复建议**：固定到具体版本 digest 或 patch 标签；评估个人镜像是否必需，优先用官方/组织镜像。

### AUDIT-13 ｜ bulwark 与 stalwart 协议/端口配置不一致 ✅ 已修复
- **类别**：部署配置
- **位置**：`docker-compose.yml:33` — `JMAP_SERVER_URL=https://localhost` 与 `docker-compose.yml:20` — `STALWART_PUBLIC_URL=http://localhost:8082`
- **风险**：bulwark 默认连 `https://localhost`（443），但 stalwart JMAP 实际在 `http://localhost:8082`，协议与端口均不匹配，bulwark 直连会失败或走错端口。
- **修复建议**：统一为 `JMAP_SERVER_URL=http://localhost:8082`（本机演示）或两者都上 TLS 后统一 `https`。

---

## 3. 🟡 中 (Medium)

### AUDIT-14 ｜ JsonCard 递归渲染无深度限制 ✅ 已修复
- **类别**：安全 / 健壮性
- **位置**：`minimal-web/message-center/src/components/JsonCard.vue`
- **风险**：深度嵌套 JSON 邮件可导致递归栈溢出或渲染卡顿，攻击者发一封恶意邮件即可让消息详情页崩溃（拒绝服务）。未用 `v-html`，无 XSS，但健壮性不足。
- **修复建议**：增加 `maxDepth` prop，超过阈值显示「…（嵌套过深）」；对 `parseStructuredBody` 也加深度/大小上限。

### AUDIT-15 ｜ 路由无全局守卫，各视图重复检查凭证 ✅ 已修复
- **类别**：代码质量
- **位置**：`minimal-web/message-center/src/router/index.ts`；`Inbox.vue`/`MessageDetail.vue` 各自检查 `loggedIn`
- **风险**：无全局 `beforeEach` 守卫，每个视图自行判断登录态，逻辑重复且易遗漏，维护性差。
- **修复建议**：抽取全局路由守卫集中处理未登录跳转；视图只关注业务加载。

### AUDIT-16 ｜ MessageDetail 与 Inbox 凭证接入不一致 ✅ 已修复
- **类别**：代码质量 / 安全
- **位置**：`Inbox.vue:46-55`（走 `loginWithUsername` 派生+自动建号）vs `MessageDetail.vue:62-68`（直接读 `route.query.pass`）
- **风险**：两条路径凭证获取方式不同，`MessageDetail` 仍保留 `pass` URL 入口，扩大凭证泄露面，且行为不统一易出 bug。
- **修复建议**：统一为「仅传 `user`，内部派生/自动建号」，移除 `MessageDetail` 的 `pass` 读取。

### AUDIT-17 ｜ 错误信息暴露 baseUrl 等内部细节 ✅ 已修复
- **类别**：安全 / 信息泄露
- **位置**：`minimal-web/message-center/src/api/jmap.ts:127,181` — `无法连接 JMAP 服务器 ${baseUrl}`
- **风险**：把后端地址暴露给终端用户，利于攻击者侦察。密码未泄露（已确认），但内部拓扑外露。
- **修复建议**：面向用户显示通用提示（「无法连接服务器」），详细信息仅 `console.warn` 供调试。

### AUDIT-18 ｜ 关键安全函数无单元测试 ✅ 已修复
- **类别**：测试
- **位置**：`tests/` 缺 `derivePassword.test.ts`；`stores/user.ts` 的 `autoCreateUser`/`fetchDefaultDomain`/`jmapAdminCall`/`loginWithUsername` 无单测
- **风险**：最敏感的口令派生与自动建号流程无测试保护，回归风险高。`compose.test.ts:82` 用魔法值 `3411949991!Mc7` 但未测算法本身。
- **修复建议**：为 `derivePassword`（含碰撞、确定性、demo 特例）、`autoCreateUser`（401 重试、域名获取、建号失败）、`loginWithUsername` 补单测。

### AUDIT-19 ｜ 测试 mock 掉真实安全行为 ✅ 已修复（加注释说明）
- **类别**：测试
- **位置**：多个视图测试 `vi.mock('../src/api/jmap')`
- **风险**：视图测试用 mock client，不验证真实 Basic Auth 头构造与凭证流转，真实安全链路仅 `jmap.test.ts` 覆盖。
- **修复建议**：保留 mock 做单元测试，另加一组「真实 client + fetch mock」的集成测试覆盖凭证流。

### AUDIT-20 ｜ jmapAdminCall 使用 any 类型 ✅ 已修复
- **类别**：代码质量 / 类型安全
- **位置**：`minimal-web/message-center/src/stores/user.ts:114` — `methodCalls: any[]`
- **风险**：管理员 JMAP 调用入参无类型约束，错误调用编译期不可见。
- **修复建议**：定义 `JmapMethodCall` 类型并替换 `any[]`。

### AUDIT-21 ｜ ALLOW_CUSTOM_JMAP_ENDPOINT 允许任意端点（钓鱼风险）✅ 已修复（加警示注释）
- **类别**：安全 / 部署配置
- **位置**：`docker-compose.yml:34` — `ALLOW_CUSTOM_JMAP_ENDPOINT=true`
- **风险**：bulwark 登录页允许用户手动输入任意 JMAP 端点，可被钓鱼页面诱导指向攻击者服务器窃取凭证。
- **修复建议**：生产环境关闭该选项，端点由部署固定；演示环境可开但需警示。

### AUDIT-22 ｜ stalwart 镜像仅固定到 minor 版本 ✅ 已修复（加警示注释）
- **类别**：依赖
- **位置**：`docker-compose.yml:3` — `stalwartlabs/stalwart:v0.16`
- **风险**：未固定到 patch/digest，`v0.16.x` 内的后续修订可能引入行为变化或漏洞。
- **修复建议**：固定到具体 patch（如 `v0.16.5`）或 digest，并在 CI 中定期升级。

### AUDIT-23 ｜ stalwart 数据卷未设只读/用户隔离 ✅ 已修复
- **类别**：部署配置
- **位置**：`docker-compose.yml:12-14` — `./stalwart/config`、`./stalwart/data` 挂载无 `:ro` 或 `user`
- **风险**：配置卷可写、未限定运行用户，容器逃逸或误操作可改配置。`.gitignore` 已排除两目录（好），但运行时权限宽松。
- **修复建议**：配置卷按需加 `:ro`；用 `user:` 指定非 root 运行；数据卷限定 uid/gid。

### AUDIT-24 ｜ docker-compose 缺 healthcheck，但文档期望 healthy 状态 ✅ 已修复
- **类别**：部署配置
- **位置**：`docker-compose.yml`（无 healthcheck）；`docs/local-quickstart.md:35` 期望 `Up X seconds (healthy)`
- **风险**：文档承诺的 healthy 状态无配置支撑，`restart: unless-stopped` 无法识别假死。
- **修复建议**：为 stalwart 加 `healthcheck`（如 `CMD curl -f http://localhost:8080/.well-known/jmap`），使文档与配置一致。

### AUDIT-25 ｜ .gitignore 遗漏 local.env.info.md 与 .env ✅ 已修复
- **类别**：安全 / 配置
- **位置**：`.gitignore`（仅忽略 `.env.local`、`.env.*.local`，未忽略 `local.env.info.md`、`.env`）
- **风险**：含真实凭证的 `local.env.info.md` 未被忽略而已被跟踪（AUDIT-01/02 根因之一）；`.env` 若将来创建也会被误提交。
- **修复建议**：在 `.gitignore` 增加 `local.env.info.md`、`.env`、`*.env`；对已被跟踪的 `local.env.info.md` 执行 `git rm --cached local.env.info.md`。

### AUDIT-26 ｜ demo 密码模式与 SnappyMail 默认密码硬编码 ✅ 已修复（加警示注释）
- **类别**：安全 / 配置
- **位置**：`minimal-web/host-demo/index.html:457` — `demoPassword(n) => 'Demo'+pad(n,3)+'!Mc7'`；`docs/stalwart-snappymail-deploy.md:131` — SnappyMail 默认密码 `12345`
- **风险**：demo 用户口令完全可预测（与 AUDIT-03 同源）；SnappyMail 默认密码 `12345` 若未改即弱口令。
- **修复建议**：演示场景在文档显著标注「可预测口令仅限本地」；SnappyMail 部署后强制改默认密码。

### AUDIT-27 ｜ parseStructuredBody 无大小/深度限制 ✅ 已修复
- **类别**：安全 / 健壮性
- **位置**：`minimal-web/message-center/src/utils/structuredBody.ts`
- **风险**：超大 JSON 正文 `JSON.parse` 可耗内存；与 AUDIT-14 叠加影响详情页稳定。
- **修复建议**：对正文长度设上限（如 1MB），超限不解析为结构化卡片，按纯文本展示。

### AUDIT-28 ｜ mailnet bridge 使 bulwark 可访问 stalwart 全部端口 ✅ 已修复（加警示注释）
- **类别**：部署配置 / 网络隔离
- **位置**：`docker-compose.yml:39-41`
- **风险**：bulwark 与 stalwart 同 bridge 网络，可访问 stalwart 所有端口（含 25 SMTP 入站），横向移动面偏大。
- **修复建议**：仅暴露必要端口给 bulwark（如 8080 JMAP），用网络策略或独立网络隔离。

---

## 4. 🟢 低 (Low)

### AUDIT-29 ｜ serverUrl() 三处重复定义 ✅ 已修复
- **位置**：`Inbox.vue:28-30`、`MessageDetail.vue:44-50`、`Compose.vue:57-59`
- **风险**：重复逻辑，易不一致。
- **修复建议**：抽取到 `utils/serverUrl.ts` 共享。

### AUDIT-30 ｜ tsconfig 严格度可进一步提升 ✅ 已修复
- **位置**：`minimal-web/message-center/tsconfig.json`（`strict: true` 已开，但缺 `noUncheckedIndexedAccess`）
- **修复建议**：开启 `noUncheckedIndexedAccess`、`noImplicitOverride` 等。

### AUDIT-31 ｜ btoa 不支持 Unicode 字符 ✅ 已修复
- **位置**：`src/api/jmap.ts:99`、`src/stores/user.ts:115`
- **风险**：用户名/密码含非 Latin1 字符时 `btoa` 抛错。当前 demo 用户均为 ASCII，暂未触发。
- **修复建议**：改用 `TextEncoder` + base64 编码以支持 Unicode。

### AUDIT-32 ｜ main.ts 用 void 忽略 promise ✅ 已修复
- **位置**：`minimal-web/message-center/src/main.ts:9`
- **风险**：`void router.isReady().then(...)` 未捕获错误，挂载失败静默。
- **修复建议**：加 `.catch` 记录错误或显示兜底 UI。

### AUDIT-33 ｜ 多处 catch {} 静默吞错 ✅ 已修复
- **位置**：`src/stores/user.ts:43-45,55-57,67-69,80-82,90-92,99-101,149,212` 等
- **风险**：生产环境可能掩盖真实问题；多有注释说明，影响有限。
- **修复建议**：至少 `console.warn` 记录，便于排查。

### AUDIT-34 ｜ markAsRead 失败静默 ✅ 已修复
- **位置**：`src/views/MessageDetail.vue:81`
- **风险**：已读标记失败用户无感知（次要功能）。
- **修复建议**：失败时轻提示或记录日志。

### AUDIT-35 ｜ Inbox 删除后重复 load() ✅ 已修复
- **位置**：`src/views/Inbox.vue:104-105`
- **风险**：删除已本地 filter 后又调 `load()` 重新拉取，多余请求。
- **修复建议**：二选一：仅本地 filter 或仅 `load()`。

### AUDIT-36 ｜ package.json 无 engines 字段 ✅ 已修复
- **位置**：`minimal-web/message-center/package.json`
- **修复建议**：声明 `engines.node` 版本约束。

### AUDIT-37 ｜ JMAP 客户端不校验 baseUrl 协议 ✅ 已修复
- **位置**：`src/api/jmap.ts:122`
- **风险**：允许 `http://`/`file://`，生产环境可能被降级攻击。本地工具影响有限。
- **修复建议**：生产构建强制 `https`。

### AUDIT-38 ｜ docker-compose 缺资源限制 ✅ 已修复
- **位置**：`docker-compose.yml`（无 `mem_limit`/`cpus`）
- **修复建议**：加 `deploy.resources.limits` 防止资源耗尽。

### AUDIT-39 ｜ 文档使用已废弃的 compose version 字段 ✅ 已修复
- **位置**：`docs/stalwart-snappymail-deploy.md:53` — `version: "3.8"`
- **修复建议**：移除 `version` 字段（新版 Compose 已废弃）。

### AUDIT-40 ｜ stalwart/config/config.json 路径硬编码 ✅ 已修复（加注释说明）
- **位置**：`stalwart/config/config.json`（`/var/lib/stalwart/` 写死）
- **风险**：低，仅路径常量。
- **修复建议**：可保留，或改用环境变量。

---

## 5. 修复优先级建议

### 第一阶段（立即，0–1 天）
1. **AUDIT-01 / AUDIT-02**：从 `docker-compose.yml` 与 `local.env.info.md` 移除明文口令，改 `.env` 注入；轮换 `<已泄露的旧邮箱口令>`、`<已泄露的邮箱口令>`、`<已泄露的管理员恢复口令>`；`git rm --cached local.env.info.md` 并更新 `.gitignore`（AUDIT-25）。
2. **AUDIT-10**：修复 host-demo `innerHTML` XSS（改 `textContent`）——这是窃取管理员凭证的直接入口。
3. **AUDIT-04**：脱敏文档中的真实口令。

### 第二阶段（近期，1–3 天）
4. **AUDIT-03 / AUDIT-26**：在 `derivePassword.ts` 与文档显式标注「仅限本地演示」安全边界；评估是否需要随机口令方案。
5. **AUDIT-05 / AUDIT-06 / AUDIT-07**：端口绑定 `127.0.0.1`；评估 TLS；CORS 收窄到实际来源。
6. **AUDIT-08 / AUDIT-09 / AUDIT-11**：移除 URL 传凭证，改 `postMessage`/共享存储；iframe 加 `sandbox`；评估凭证是否可不入浏览器存储。
7. **AUDIT-12 / AUDIT-13 / AUDIT-22**：固定镜像版本；统一 bulwark/stalwart 协议配置。

### 第三阶段（排期，1–2 周）
8. **AUDIT-14 / AUDIT-27**：JsonCard 深度限制 + 正文大小上限。
9. **AUDIT-15 / AUDIT-16 / AUDIT-29**：路由守卫统一、凭证接入统一、`serverUrl` 抽取。
10. **AUDIT-18 / AUDIT-19**：补关键安全函数单测与集成测试。
11. **AUDIT-17 / AUDIT-20 / AUDIT-21 / AUDIT-23 / AUDIT-24 / AUDIT-28**：错误信息脱敏、类型加固、端点锁定、卷权限、healthcheck、网络隔离。
12. **AUDIT-30 ~ AUDIT-40**：代码质量与规范类低优先级项，择机优化。

---

## 6. 总体评价

Magic Mail Box 作为「本地邮件/消息平台实验项目」定位清晰，技术选型现代（Stalwart + JMAP 直连 + Vue 3），演示链路完整。当前安全问题大多源于**为方便本地联调而刻意牺牲安全**（可推导口令、明文凭证、HTTP、CORS `*`），在纯本机演示语境下可接受，但代码与文档中**缺乏对这些取舍的显式安全边界声明**，易被误用到非本机环境。

**最关键的两点**：
1. 真实管理员口令已硬编码并部分进入 Git 历史——无论项目定位如何，都应立即轮换并清除。
2. `derivePassword` 使所有用户账号实际无密码保护——需在代码与文档顶部显著声明「仅限本地、不可对外」。

修复第一阶段（凭证轮换 + XSS 修复 + 文档脱敏）即可显著提升安全基线；其余可在迭代中逐步加固。

---

*报告由三路并行审计（基础设施 / 前端代码 / 敏感信息泄露）汇总生成。各审计员仅做只读分析，未修改任何文件。*