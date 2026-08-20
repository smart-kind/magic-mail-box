# Magic Mail Box

以 [Stalwart Mail Server](https://stalw.art/) 为后端的本地邮件/消息平台实验项目。浏览器绕过 IMAP/SMTP，直接用 **JMAP（RFC 8620/8621）** 与后端通信，并把邮件包装成对外的「消息中心」——用户看不到邮件概念，只看到消息/通知平台，且支持结构化 JSON 消息渲染为自定义卡片。

> ⚠️ **仅限本地演示**：演示用口令可由用户名公开推导、Basic Auth 走 http 明文、CORS 设为 permissive。严禁原样用于对外 / 生产环境。详见 [`docs/audit-report.md`](./docs/audit-report.md)。

---

## 特性

- **全协议邮件后端**：Stalwart 单容器（Rust，RocksDB 嵌入式存储，无外部数据库），SMTP/IMAP/JMAP/POP3 全协议
- **JMAP 直连**：浏览器仅用原生 `fetch` + HTTP Basic Auth 直连 JMAP，不经 IMAP/SMTP
- **消息中心 SPA**：Vue 3 + TypeScript + Vite，hash 路由，构建产物可被 iframe 从子路径嵌入
- **结构化消息**：正文为 JSON 对象/数组时自动渲染为递归键值对卡片，否则按纯文本展示
- **多用户并发演示**：宿主 Demo 同时打开多个用户会话（各自 `sessionStorage`），互发消息验证端到端链路
- **用户自动创建**：URL 只传用户名，密码由用户名派生；用户不存在时用管理员凭证自动创建
- **两套 Webmail 方案**：Stalwart + Bulwark（JMAP 直连）、Stalwart + SnappyMail（IMAP/SMTP）

---

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│                       宿主浏览器                              │
│  ┌────────────────────┐   ┌──────────────────────────────┐  │
│  │  host-demo         │   │  Bulwark / SnappyMail Webmail │  │
│  │  (单 HTML, 多标签)  │   │  (Docker 或源码定制)          │  │
│  └─────────┬──────────┘   └──────────────┬───────────────┘  │
│  ┌─────────▼──────────┐                   │                  │
│  │  message-center    │                   │ JMAP / IMAP      │
│  │  (Vue 3 SPA)       │───────────────────┘                  │
│  └─────────┬──────────┘                                      │
│            │ JMAP (HTTP Basic Auth + JSON)                   │
└────────────┼─────────────────────────────────────────────────┘
┌────────────▼─────────────────────────────────────────────────┐
│  Stalwart Mail Server (Rust, 单二进制)                        │
│  ├─ SMTP :25/:587   ├─ JMAP :8082 (映射自容器 8080)          │
│  ├─ IMAPS :993      ├─ HTTPS :443                           │
│  └─ WebAdmin        └─ 存储: RocksDB (嵌入式)                │
└──────────────────────────────────────────────────────────────┘
```

---

## 快速开始

完整实操步骤见 [`docs/local-quickstart.md`](./docs/local-quickstart.md)，以下是最短路径。

### 前置

- Docker + Docker Compose
- Node.js 18+
- Python 3（用于起静态服务）或任意静态服务器

### 1. 配置管理员口令

在项目根目录创建 `.env`（已被 `.gitignore` 忽略，勿提交）：

```bash
echo 'STALWART_RECOVERY_ADMIN=admin:<你的管理员口令>' > .env
```

### 2. 启动 Stalwart

```bash
docker compose up -d stalwart
docker ps --filter "name=stalwart" --format "{{.Status}}"   # 期望: Up ... (healthy)
```

首次启动需完成 WebAdmin 初始化向导（`http://localhost:8082/admin`）：服务器主机名 `mail.local`、默认域名 `local.test`、关闭 TLS/DKIM。详见 [`docs/local-quickstart.md`](./docs/local-quickstart.md) 第 2 节。

### 3. 开启 CORS（浏览器直连 JMAP 必需，一次性）

WebAdmin → Settings → HTTP → Security → 开启 **Permissive CORS policy** → `docker restart stalwart`

### 4. 构建消息中心并起静态服务

```bash
cd minimal-web/message-center
npm ci && npm run build          # 产物在 dist/，资源用相对路径
cd ..
python3 -m http.server 8777 --bind 127.0.0.1   # 保持运行
```

### 5. 打开宿主 Demo

浏览器访问 `http://127.0.0.1:8777/host-demo/` → 点「环境配置」填入管理员凭证 → 批量创建 demo 用户 → 选用户打开消息中心 → 多标签页互发消息。

---

## 目录结构

```
magic-mail-box/
├── docker-compose.yml              # Stalwart + Bulwark 编排
├── .env                            # 管理员口令（gitignore，本地创建）
├── docs/
│   ├── PROJECT_OVERVIEW.md         # 项目全景
│   ├── local-quickstart.md         # 本地启动实操手册
│   ├── deploy.md                   # Stalwart + Bulwark 通用部署
│   ├── stalwart-snappymail-deploy.md  # Stalwart + SnappyMail 部署
│   └── audit-report.md             # 安全审计报告
└── minimal-web/                    # 极简演示系统（自研）
    ├── README.md                   # 演示系统说明
    ├── host-demo/index.html        # 宿主管理程序（单文件）
    └── message-center/             # 消息中心 Vue 3 SPA
        ├── src/
        │   ├── api/jmap.ts         # JMAP 客户端封装
        │   ├── stores/user.ts      # 用户状态 + 自动创建用户
        │   ├── utils/              # derivePassword / structuredBody / serverUrl
        │   ├── components/JsonCard.vue  # 递归键值对卡片
        │   └── views/              # Inbox / MessageDetail / Compose
        └── tests/                  # vitest 单元测试
```

> `stalwart/config/`、`stalwart/data/`、`bulwark-webmail/`、`node_modules/`、`dist/` 均被 gitignore。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 邮件后端 | Stalwart v0.16 (Rust)，RocksDB 存储，SMTP/IMAP/JMAP/POP3 |
| Webmail (可选 A) | Bulwark Webmail (Next.js 16 + React 19，JMAP 直连) |
| Webmail (可选 B) | SnappyMail (PHP，IMAP/SMTP) |
| 演示宿主 | 纯 HTML + JS 单文件，无构建 |
| 演示消息中心 | Vue 3.5 + TypeScript 5.9 + Vite 7，hash 路由 |
| 测试 | Vitest 3 + jsdom 26 + @vue/test-utils 2（85+ 用例） |
| 容器编排 | Docker Compose，`mailnet` bridge 网络 |

---

## 常用命令

```bash
# 后端
docker compose up -d stalwart          # 启动
docker compose up -d --force-recreate stalwart  # 重建（使 .env / compose 改动生效）
docker compose down -v                # 彻底删除容器 + 数据

# 前端
cd minimal-web/message-center
npm run dev          # Vite 开发服务器 http://localhost:5173
npm run build        # 类型检查 + 构建，产物在 dist/
npm test             # vitest 单元测试
```

---

## 端口一览

| 端口 | 服务 | 用途 |
|---|---|---|
| 8082 | Stalwart | WebAdmin + JMAP API（映射自容器 8080） |
| 8777 | Python HTTP | host-demo + message-center 静态服务 |
| 5173 | Vite dev | message-center 开发模式（可选） |
| 25 / 587 / 993 / 443 | Stalwart | SMTP / SMTP 提交 / IMAPS / HTTPS（均绑定 127.0.0.1） |

---

## 文档导航

| 文档 | 内容 |
|---|---|
| [`docs/PROJECT_OVERVIEW.md`](./docs/PROJECT_OVERVIEW.md) | 项目全景：架构、模块、关键流程、测试体系 |
| [`docs/local-quickstart.md`](./docs/local-quickstart.md) | 本地启动实操手册（含踩坑记录） |
| [`docs/deploy.md`](./docs/deploy.md) | Stalwart + Bulwark 通用部署 |
| [`docs/stalwart-snappymail-deploy.md`](./docs/stalwart-snappymail-deploy.md) | Stalwart + SnappyMail 部署 |
| [`docs/audit-report.md`](./docs/audit-report.md) | 安全审计报告与修复说明 |
| [`minimal-web/README.md`](./minimal-web/README.md) | 演示系统说明 + 快速开始 |

---

## 安全说明

本项目为**本地联调演示**，有意做了如下取舍（详见 [`docs/audit-report.md`](./docs/audit-report.md)）：

- 用户口令由用户名确定性派生，等同于无密码保护（仅限本地）
- Basic Auth 走 http 明文传输；CORS 设为 permissive
- 管理员凭证由宿主页面写入浏览器 `localStorage` 供消息中心自动创建用户

走向非本机环境前，需替换为：随机强口令 + 安全渠道交付、HTTPS、收窄 CORS、JMAP session token 或服务端会话。`docker-compose.yml` 与源码中以 `AUDIT-XX` 注释标注了对应风险与修复建议。