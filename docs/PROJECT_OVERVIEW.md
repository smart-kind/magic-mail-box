# Magic Mail Box — 项目总览

> 本文档是对整个 `magic-mail-box` 仓库的全景介绍，涵盖定位、架构、模块、关键流程、测试与部署。详细部署步骤见 [`deploy.md`](./deploy.md) 与 [`stalwart-snappymail-deploy.md`](./stalwart-snappymail-deploy.md)；极简演示系统的设计与联调见 [`../minimal-web/README.md`](../minimal-web/README.md)、[`../minimal-web/docs/first-plan.md`](../minimal-web/docs/first-plan.md) 与 [`../minimal-web/docs/integration-test.md`](../minimal-web/docs/integration-test.md)。

---

## 1. 项目定位

Magic Mail Box 是一个以 [Stalwart Mail Server](https://stalw.art/) 为后端的本地邮件/消息平台实验项目，目标是：

1. **验证 Stalwart 的可部署性**：用 Docker Compose 一键拉起一个生产级邮件服务器（SMTP/IMAP/JMAP/POP3 全协议），无需外部数据库。
2. **验证 JMAP 直连可行性**：浏览器绕过 IMAP/SMTP，直接用 JMAP（RFC 8620/8621）与后端通信。
3. **把邮件包装成「消息中心」**：对外不暴露邮件概念，用户只看到「消息/通知」平台，并支持结构化 JSON 消息渲染为自定义卡片。
4. **多用户并发通信演示**：通过一个宿主 Demo 同时打开多个用户会话，互发消息验证端到端链路。

仓库内提供两套等价的 Webmail 方案（Stalwart + Bulwark、Stalwart + SnappyMail）和一套自研极简演示（minimal-web）。

---

## 2. 顶层架构

```
┌──────────────────────────────────────────────────────────────┐
│                       宿主浏览器                              │
│                                                              │
│  ┌────────────────────┐   ┌──────────────────────────────┐  │
│  │  host-demo         │   │  Bulwark / SnappyMail Webmail │  │
│  │  (单 HTML, 多标签)  │   │  (Docker 或源码定制)          │  │
│  └─────────┬──────────┘   └──────────────┬───────────────┘  │
│            │ iframe 嵌入                   │ JMAP / IMAP      │
│  ┌─────────▼──────────┐                   │                  │
│  │  message-center    │                   │                  │
│  │  (Vue 3 SPA)       │───────────────────┘                  │
│  └─────────┬──────────┘                                      │
│            │ JMAP (HTTP Basic Auth + JSON)                   │
└────────────┼─────────────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────────────┐
│  Stalwart Mail Server (Rust, 单二进制)                        │
│  ├─ SMTP  :25 / :587        ├─ JMAP  :8082 (映射自容器 8080)  │
│  ├─ IMAPS :993              ├─ HTTPS :443                     │
│  └─ WebAdmin :8082/admin    └─ 存储: RocksDB (嵌入式)         │
└──────────────────────────────────────────────────────────────┘
```

- **后端**：Stalwart 单容器，RocksDB 嵌入式存储，无外部数据库依赖。
- **Webmail**：可选 Bulwark（Next.js 16 + React 19，JMAP 直连）或 SnappyMail（PHP，IMAP/SMTP）。
- **自研演示**：`minimal-web/` 下的宿主 Demo + 消息中心 SPA，全部走 JMAP。

---

## 3. 目录结构

```
magic-mail-box/
├── docker-compose.yml              # Stalwart + Bulwark 编排
├── docs/                           # 项目级文档
│   ├── PROJECT_OVERVIEW.md         # 本文档
│   ├── deploy.md                   # Stalwart + Bulwark 部署指南
│   └── stalwart-snappymail-deploy.md  # Stalwart + SnappyMail 部署指南
├── minimal-web/                    # 极简演示系统（自研）
│   ├── README.md                   # 演示系统说明 + 快速开始
│   ├── docs/
│   │   ├── first-plan.md           # 架构设计文档
│   │   └── integration-test.md     # 联调复现指南
│   ├── host-demo/
│   │   └── index.html              # 宿主管理程序（单文件，~660 行）
│   └── message-center/             # 消息中心 Vue 3 SPA
│       ├── src/
│       │   ├── main.ts             # Vue 入口（等路由就绪再挂载）
│       │   ├── App.vue             # 根组件 + 导航
│       │   ├── api/jmap.ts         # JMAP 客户端封装（414 行）
│       │   ├── router/index.ts     # hash 路由
│       │   ├── stores/user.ts      # 用户状态 + 自动创建用户
│       │   ├── utils/
│       │   │   ├── derivePassword.ts   # 用户名 → 密码派生
│       │   │   └── structuredBody.ts  # JSON 正文检测
│       │   ├── data/demoUsers.ts   # 收件人候选列表
│       │   ├── components/JsonCard.vue  # 递归键值对卡片
│       │   └── views/

│       │       ├── Inbox.vue       # 收件箱
│       │       ├── MessageDetail.vue  # 消息详情（JSON → 卡片）
│       │       └── Compose.vue     # 发消息弹窗（纯文本 / 结构化通知→JSON）
│       ├── tests/                  # vitest 单元测试（9 文件，85+ 用例）
│       ├── package.json
│       ├── vite.config.ts          # base: './' 便于 iframe 嵌入
│       ├── vitest.config.ts        # jsdom 环境
│       └── tsconfig.json
├── stalwart/                       # Stalwart 数据卷（gitignore）
│   ├── config/
│   └── data/
├── local.env.info.md               # 本地管理员账号密码（本地测试专用）
└── .gitignore
```

> `bulwark-webmail/`（Bulwark 源码）与 `node_modules/` 均被 gitignore，按需 clone/install。

---

## 4. 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| 邮件后端 | Stalwart v0.16 (Rust) | SMTP/IMAP/JMAP/POP3，RocksDB 存储，内置 WebAdmin |
| Webmail (可选 A) | Bulwark Webmail | Next.js 16 + React 19 + TS + Tailwind v4，JMAP 直连 |
| Webmail (可选 B) | SnappyMail | PHP，RainLoop 现代分支，IMAP/SMTP |
| 演示宿主 | 纯 HTML + JS | 单文件，无构建 |
| 演示消息中心 | Vue 3.5 + TypeScript 5.9 + Vite 7 | hash 路由，`base: './'` 便于子路径/iframe 嵌入 |
| 测试 | Vitest 3 + jsdom 26 + @vue/test-utils 2 | 85+ 用例，mock JMAP client |
| 容器编排 | Docker Compose | `mailnet` bridge 网络互通 |

---

## 5. 核心模块详解

### 5.1 Stalwart 邮件服务器

- **镜像**：`stalwartlabs/stalwart:v0.16`（见 `docker-compose.yml`）。
- **协议端口**：SMTP 25/587、IMAPS 993、HTTPS 443、WebAdmin+JMAP 8082（映射自容器 8080）。
- **存储**：RocksDB 嵌入式，数据卷 `./stalwart/config` 与 `./stalwart/data`。
- **关键环境变量**：`STALWART_PUBLIC_URL=http://localhost:8082`。JMAP session（`/.well-known/jmap`）返回的 `apiUrl`/`downloadUrl` 由它决定；不设置则回退为 `https://<server.hostname>`（即 `https://mail.local`），浏览器无法访问，所有 JMAP 客户端都会 `Failed to fetch`。
- **CORS**：浏览器直连 JMAP 需在 WebAdmin → Settings → HTTP → Security 开启 *Permissive CORS policy*。
- **初始化**：首次启动走 Setup Wizard，设置 `mail.local` / `local.test`，关闭 TLS/DKIM；完成后生成永久管理员（密码只显示一次），需 `docker restart stalwart` 生效。

### 5.2 Bulwark Webmail（可选）

- **镜像**：`ghcr.io/bulwarkmail/webmail:latest`，端口 3000。
- 通过 JMAP 直连 Stalwart（非 IMAP），支持邮件/日历/联系人/文件、PWA、多语言、Admin Dashboard。
- 源码可 clone 到 `bulwark-webmail/` 定制，`npm run dev` 跑在 3001。

### 5.3 minimal-web 演示系统

对外是一个「消息中心」，内部仍是邮件。核心验证点：JMAP 直连、用户批量自动创建、结构化 JSON 消息渲染、多标签页多用户并发。

#### 5.3.1 host-demo（宿主管理程序）

`minimal-web/host-demo/index.html`，单文件约 660 行，无构建。功能：

- **环境配置弹窗**：填写管理员账号密码、JMAP 服务器地址、消息中心入口地址，存 `localStorage`。
- **批量创建测试用户**：`demo001@local.test ~ demo100@local.test`，密码 `DemoNNN!Mc7`（`!Mc7` 后缀为通过 Stalwart 的 zxcvbn 强度检查）。幂等可重复点击。
- **打开消息中心**：以 iframe 或新标签页加载消息中心，URL 用 hash query 传 `user`/`server`/`adminUser`/`adminPass`/`domain`。多个 iframe 水平并排，各自独立会话（凭证在各自标签页的 `sessionStorage`）。

#### 5.3.2 message-center（Vue 3 SPA）

##### JMAP 客户端 `src/api/jmap.ts`

封装 RFC 8620/8621，仅用原生 `fetch`。核心能力：

| 方法 | JMAP 方法 | 用途 |
|---|---|---|
| `getSession` | `GET /.well-known/jmap` | 会话发现，缓存失败不缓存 |
| `getAccountId` | — | 从 session.primaryAccounts 取 mail 账号 |
| `queryInboxIds` | `Mailbox/query` + `Email/query` | 按 `receivedAt` 倒序取收件箱 id |
| `listInbox` | + `Email/get` | 摘要列表（id/subject/from/receivedAt/preview/keywords） |
| `getEmails` | `Email/get` | 完整邮件，含 `textBody`/`bodyValues` 正文 |
| `sendEmail` | `Identity/get` + `Email/set` + `EmailSubmission/set` | 取发信身份 → 建草稿 → 提交发送 |
| `deleteEmails` | `Email/set` (destroy) | 删除 |
| `markAsRead` | `Email/set` (update keywords `$seen`) | 标记已读 |

- **认证**：HTTP Basic Auth，`Authorization: Basic base64(user:pass)`。
- **能力声明**：`using` 包含 `urn:ietf:params:jmap:core`、`urn:ietf:params:jmap:mail`、`urn:ietf:params:jmap:submission`。缺 `submission` 会报 `unknownMethod`。
- **错误模型**：`JmapError`（含 `status`/`type`），HTTP 401 单独识别为认证失败；错误消息绝不包含密码。
- **可注入 fetch**：`JmapClientOptions.fetchImpl` 供测试 mock。

##### 用户状态 `src/stores/user.ts`

- `useUserStore()`：`reactive` + `readonly`，凭证存 `sessionStorage`（键 `mc.username`/`mc.password`/`mc.server`），模块加载时自动恢复。
- `loginWithUsername(username, server, opts)`：派生密码 → 尝试 `getSession` → 401 则用管理员凭证调 `x:Domain/query`+`x:Domain/get` 取域名 → `x:Account/set` 自动创建用户 → 重新登录。URL 只需传 `user` 即可完成全流程。
- 域名/服务器地址优先读 `localStorage`（host-demo 写入），回退 `local.test` / `http://localhost:8082`。

##### 工具

- `utils/derivePassword.ts`：`demoNNN` → `DemoNNN!Mc7`（兼容存量）；其他用户名走 djb2 哈希 + `!Mc7` 后缀。
  > ⚠️ **SECURITY（仅限本地演示）**：口令可由用户名公开推导，等同于无密码保护；严禁用于对外 / 生产环境（见审计报告 AUDIT-03）。
- `utils/structuredBody.ts`：`parseStructuredBody(text)` 仅当整段正文是 JSON 对象/数组时返回解析值，纯量 JSON 不算结构化。

##### 组件

- `components/JsonCard.vue`：递归键值对卡片。对象 → `<dl>` 键值对，数组 → `<ul>` 列表，纯量 → 文本。通过文件名自引用递归。

##### 视图

| 视图 | 路由 | 职责 |
|---|---|---|

| `Inbox.vue` | `/inbox` | 从 URL `user` 自动登录 → 加载收件箱列表 → 点击进详情、行内删除、刷新；内置「发消息」按钮弹出 `Compose` 弹窗 |
| `MessageDetail.vue` | `/message/:id` | 加载单封邮件，正文 JSON 渲染为 `JsonCard`，否则 `<pre>`；打开即 `markAsRead`；删除二次确认 |
| `Compose.vue` | （弹窗组件） | 由 Inbox 通过 `visible` prop 打开；收件人用户名（逗号分隔）→ 邮箱；主题；消息形式切「纯文本」或「结构化通知」（填标题/级别/内容，发送时序列化为 JSON）；成功后 emit `sent` |

##### 路由

`src/router/index.ts`：`createWebHashHistory`。hash 模式是刻意选择——构建产物常以子路径或 `file://` 被 iframe 嵌入，history 模式会 404 且刷新丢参数，hash 模式下入口始终是 `index.html`，凭证参数（hash query）刷新后保留。

##### 入口

`src/main.ts`：`router.isReady().then(() => app.mount('#app'))`。等初始导航完成再挂载，避免视图 `onMounted` 时 `route.query` 还是空导致自动登录偶发失败（时序竞争）。

---

## 6. 关键流程

### 6.1 自动登录与用户自动创建

```
URL: …/index.html#/inbox?user=david&server=http://localhost:8082&adminUser=…&adminPass=…
   │
   ▼
Inbox.onMounted → loginWithUsername(david, server, opts)
   │
   ├─ password = derivePassword('david')
   ├─ createJmapClient(...).getSession()
   │     ├─ 200 → 登录成功
   │     └─ 401 → autoCreateUser(server, david, password, adminUser, adminPass)
   │                ├─ x:Domain/query → x:Domain/get  取默认域名
   │                ├─ x:Account/set  创建 User（Password 凭证）
   │                └─ 重新 createJmapClient + getSession
   └─ store.setCredentials(david, password)  写入 sessionStorage
```

### 6.2 发送一封邮件

```
Inbox 点「发消息」→ Compose 弹窗打开（visible=true）
Compose.send()
  → validate()（收件人/主题非空；纯文本模式内容非空；结构化通知模式标题/内容非空）
  → makeClient().sendEmail({ to, subject, text })
      → Identity/get            取发信身份（email 即当前用户地址，避免硬编码域名）
      → Mailbox/query(role=drafts)  取草稿箱 id
      → Email/set create draft  建草稿（mailboxIds/keywords=$draft/from/to/subject/textBody/bodyValues）
      → EmailSubmission/set     提交发送，onSuccessDestroyEmail 销毁草稿
  → emit('sent') → Inbox 关闭弹窗 + 刷新列表
```

### 6.3 结构化消息渲染

```
MessageDetail.load()
  → client.getEmails([id])  → email.text
  → parseStructuredBody(text)
        ├─ 是 JSON 对象/数组 → structured = value
        └─ 否则              → structured = null
  → <JsonCard :value="structured" />  递归渲染键值对/列表/纯量
     或 <pre>{{ email.text }}</pre>   纯文本原样展示
```

### 6.4 多标签页多用户通信

宿主 Demo 每个标签页/iframe 用各自 `sessionStorage` 保存凭证，互不串号。A 以 david 身份发消息给 alice → B 以 alice 身份刷新收件箱看到未读 → B 发结构化通知（填标题/级别/内容，系统序列化为 JSON）→ A 刷新看到结构化卡片。每个邮箱持有自己副本，一方删除不影响对方。

---

## 7. 测试体系

`minimal-web/message-center/tests/`，Vitest + jsdom + mock JMAP client，共 9 个文件、85+ 用例：

| 测试文件 | 覆盖范围 |
|---|---|
| `jmap.test.ts` | `basicAuthHeader`、session discovery、`queryInboxIds`、`getEmails`、`listInbox`、`sendEmail`、`deleteEmails`（含 401、unknownMethod、notCreated/notDestroyed 错误路径） |
| `user-store.test.ts` | 凭证持久化、server 回退、session 恢复 |
| `inbox.test.ts` | Inbox 视图：自动登录、加载/错误/删除/未读标记 |
| `message-detail.test.ts` | 详情页：加载、JSON 渲染、删除二次确认、返回收件箱 |
| `compose.test.ts` | 发消息：收件人解析、表单校验、结构化通知序列化为 JSON、发送成功/失败 |
| `router.test.ts` | 路由表与重定向 |
| `structured-body.test.ts` | `parseStructuredBody` 边界（空串、纯量、对象、数组、非法 JSON） |
| `demo-users.test.ts` | demo 用户列表生成与 localStorage 覆盖 |
| `host-demo.test.ts` | 宿主 Demo：批量创建、iframe 嵌入 URL 契约、localStorage 持久化 |

运行：

```bash
cd minimal-web/message-center
npm test
```

> 协议层与真实 Stalwart 的集成差异（`using` 能力集、session URL 等）只能靠浏览器联调暴露，mock 覆盖不到——这是历次联调的主要缺陷来源，详见 `integration-test.md`。

---

## 8. 部署与运行

### 8.1 启动后端

```bash
cd magic-mail-box
docker compose up -d stalwart        # 仅 Stalwart
# 或
docker compose up -d                 # Stalwart + Bulwark
```

首次启动后：
1. `docker logs stalwart 2>&1 | grep -i password` 取临时管理员密码。
2. 浏览器打开 `http://localhost:8082/admin` 完成 Setup Wizard（`mail.local` / `local.test`，关 TLS/DKIM）。
3. `docker restart stalwart` 使配置生效，用永久管理员登录。
4. WebAdmin → Settings → HTTP → Security → 开启 Permissive CORS policy。

管理员账号密码见 `local.env.info.md`（本地测试专用）。

### 8.2 跑演示系统

```bash
# 构建消息中心
cd minimal-web/message-center
npm ci && npm run build              # 产物在 dist/，资源相对路径

# 起静态服务
cd minimal-web
python3 -m http.server 8777 --bind 127.0.0.1
```

浏览器打开 `http://127.0.0.1:8777/host-demo/` → 环境配置填管理员密码 → 批量创建 demo 用户 → 打开消息中心测试。

开发模式：`cd minimal-web/message-center && npm run dev`（5173），宿主 Demo 中把消息中心入口地址改为 `http://localhost:5173`。

### 8.3 端口一览

| 端口 | 服务 | 用途 |
|---|---|---|
| 8082 | Stalwart | WebAdmin + JMAP API（映射自容器 8080） |
| 8777 | Python HTTP | host-demo + message-center 静态服务 |
| 5173 | Vite dev | message-center 开发模式（可选） |
| 3000 | Bulwark | Webmail（Docker） |
| 3001 | Bulwark | Webmail 开发模式（npm run dev） |
| 25 / 587 / 993 / 443 | Stalwart | SMTP / SMTP 提交 / IMAPS / HTTPS |

---

## 9. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `JMAP API 请求失败: Failed to fetch` | `apiUrl` 返回 `https://mail.local` | 确认 `STALWART_PUBLIC_URL=http://localhost:8082` 并 `docker compose up -d --force-recreate stalwart` |
| 创建用户报跨域 / Failed to fetch | Stalwart 未开 permissive CORS | WebAdmin → Settings → HTTP → Security → 开启 Permissive CORS |
| 页面空白、只有导航栏 | 旧构建缓存 | 强制刷新；确认 `dist/` 是最新构建 |
| `未提供用户名` / `未提供用户凭证` | URL 缺 `user` 参数，或参数放在 hash 外 | 用 `#/inbox?user=用户名` 形式（宿主 Demo 已自动拼好） |
| 发送报 `unknownMethod` | 旧构建缺 `jmap:submission` 能力 | 重新 `npm run build` |
| 自动创建用户失败 | 未配置管理员凭证 | 宿主 Demo「环境配置」填管理员账号密码 |
| Setup Wizard 后配置不生效 | 未重启容器 | `docker restart stalwart` |

---

## 10. 文档索引

| 文档 | 内容 |
|---|---|
| `docs/PROJECT_OVERVIEW.md` | 本文档，项目全景 |
| `docs/deploy.md` | Stalwart + Bulwark 详细部署 |
| `docs/stalwart-snappymail-deploy.md` | Stalwart + SnappyMail 部署 |
| `minimal-web/README.md` | 演示系统说明 + 快速开始 |
| `minimal-web/docs/first-plan.md` | 演示系统架构设计 |
| `minimal-web/docs/integration-test.md` | 演示系统联调复现指南 |
| `local.env.info.md` | 本地管理员账号密码（本地测试专用，勿提交真实环境） |