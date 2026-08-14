# Magic Mail Box 部署指南

## 项目信息

| 组件 | GitHub | 文档 |
|---|---|---|
| **Stalwart** | https://github.com/stalwartlabs/stalwart | https://stalw.art/docs |
| **Bulwark Webmail** | https://github.com/bulwarkmail/webmail | https://bulwarkmail.org/docs |

## 组件说明

### Stalwart — 邮件服务器

- Rust 编写，单二进制文件
- 支持 SMTP / IMAP / JMAP / POP3
- 内置垃圾邮件过滤、DKIM/SPF/DMARC
- 存储：RocksDB（嵌入式，无需额外数据库）
- 自带 Web 管理后台
- 最低 512MB RAM 即可运行

### Bulwark Webmail — Web 收件箱界面

- Next.js 16 + React 19 + TypeScript + Tailwind CSS v4
- 通过 JMAP 协议直连 Stalwart（非 IMAP）
- 支持邮件、日历、联系人、文件管理
- 支持 PWA 安装、主题、多语言
- 自带 Admin Dashboard

---

## 前置要求

- Docker + Docker Compose
- 至少 2GB 可用磁盘空间
- Node.js 22+（如需定制 Bulwark 前端）
- 本地测试不需要域名，用 IP 即可

---

## 部署步骤

### 第一步：启动服务

```bash
cd magic-mail-box
docker compose up -d
```

### 第二步：获取 Stalwart 管理员临时密码

```bash
docker logs stalwart 2>&1 | grep -A8 'bootstrap mode'
```

输出示例：

```
🔑 Stalwart bootstrap mode - temporary administrator account
   username: admin
   password: xxxxxxxxxxxxxxxx
Use these credentials to complete the initial setup at the
/admin web UI. Once setup is done, Stalwart will provision a
permanent administrator and this temporary account will no
longer apply.
```

> 记下用户名和密码，下一步登录要用。
> **注意**：每次容器重启都会生成新的临时密码，以日志中最新的为准。

### 第三步：配置 Stalwart（Setup Wizard）

1. 浏览器打开 `http://localhost:8082/admin`
2. 输入用户名 `admin`，回车后会跳转到密码输入页面
3. 输入上面获取的临时密码

进入 Setup Wizard 后，按以下方式填写：

#### Step 1: Server Identity

| 字段 | 填写值 | 说明 |
|---|---|---|
| Server Hostname | `mail.local` | 内网用，随便填一个像域名的即可 |
| Default Email Domain | `local.test` | `.test` 是 IANA 保留的测试顶级域，Stalwart 明确支持 |
| Automatically Obtain TLS Certificate | **关闭** | 没有真实域名，Let's Encrypt 签不了 |
| Generate Email Signing Keys | **关闭** | 没有对外发信需求，DKIM 没意义 |

#### Step 2: Storage

全部保持默认（RocksDB）。

#### Step 3: Account Directory

保持默认（Use the Internal Directory）。

#### Step 4: Logging

选择 **Console**（容器化部署推荐）。

#### Step 5: Automatic DNS Management

保持默认（Manual DNS Server Management）。

#### 完成向导

向导完成后会生成**永久管理员账号**（邮箱 + 密码），页面上会显示一次。**务必记下这个密码**，之后无法再次查看。

向导完成后，需要**手动重启容器**使配置生效：

```bash
docker restart stalwart
```

重启后用新的永久管理员登录。

### 第四步：创建邮箱用户

1. 用永久管理员登录 `http://localhost:8082/admin`
2. 进入 **Management → Accounts → Add Account**
3. 填写用户名（如 `test001`）
4. 设置密码
5. 邮箱地址自动生成为 `test001@local.test`

### 第五步：配置 Bulwark Webmail

1. 浏览器打开 `http://localhost:3000`
2. 登录页输入上面创建的邮箱账号和密码
3. JMAP Server URL 填写 `https://localhost`（如果是 Docker 容器版）

---

## 定制 Bulwark 前端

Bulwark 源码已 clone 到 `bulwark-webmail/` 目录，可直接修改。

### 开发模式启动

```bash
cd bulwark-webmail
npm run dev
```

开发服务器运行在 `http://localhost:3001`（3000 被 Docker 容器占用）。

> 开发前需先停止 Docker 的 Bulwark 容器：`docker compose stop bulwark`

### 开发配置

`bulwark-webmail/.env.local` 已配置好：

```env
JMAP_SERVER_URL=https://localhost
APP_NAME=Magic Mail Box
```

### 关键环境变量

| 变量 | 说明 |
|---|---|
| `JMAP_SERVER_URL` | Stalwart JMAP 端点地址 |
| `ALLOW_CUSTOM_JMAP_ENDPOINT` | 允许登录页手动输入 JMAP 地址 |
| `SESSION_SECRET` | Session 加密密钥（dev 环境可用任意字符串） |

---

## 快速验证

```bash
# 检查容器状态
docker compose ps

# 查看 Stalwart 日志
docker logs stalwart

# 查看 Bulwark 日志
docker logs bulwark
```

---

## 端口说明

| 端口 | 服务 | 用途 |
|---|---|---|
| 25 | Stalwart | SMTP 入站（接收外部邮件） |
| 587 | Stalwart | SMTP 提交（客户端发信） |
| 993 | Stalwart | IMAPS（客户端收取邮件） |
| 443 | Stalwart | HTTPS（JMAP / WebAdmin） |
| 8082 | Stalwart | Web 管理后台（HTTP） |
| 3000 | Bulwark | Webmail 收件箱界面（Docker） |
| 3001 | Bulwark | Webmail 开发模式（npm run dev） |

> 如果本地端口 8082 被占用，修改 `docker-compose.yml` 中冒号前的主机端口映射即可。

---

## 数据持久化

| 组件 | 数据目录 | 说明 |
|---|---|---|
| Stalwart 配置 | `./stalwart/config` | 配置文件、TLS 证书 |
| Stalwart 数据 | `./stalwart/data` | RocksDB 邮件存储 |

---

## 目录结构

```
magic-mail-box/
├── docs/                          # 文档
├── docker-compose.yml             # Docker 编排
├── stalwart/                      # Stalwart 数据卷
│   ├── config/
│   └── data/
├── bulwark-webmail/               # Bulwark 前端源码（可定制）
│   ├── .env.local                 # 开发环境配置
│   ├── app/                       # Next.js 页面
│   ├── components/                # UI 组件
│   ├── stores/                    # Zustand 状态管理
│   └── ...
└── ...
```

---

## 注意事项

- `docker-compose.yml` 必须设置 `STALWART_PUBLIC_URL=http://localhost:8082`：JMAP session 里的 `apiUrl` 由它生成，不设置则是 `https://mail.local`，浏览器无法访问（详见 `minimal-web/docs/integration-test.md`）
- 本地测试不需要配 DNS（MX/SPF/DKIM）、SSL 证书
- Stalwart 默认使用 RocksDB 嵌入式存储，不需要额外数据库
- 每次容器重启，bootstrap 临时密码会更新，以最新日志为准
- 完成 Setup Wizard 后会生成永久管理员密码，只显示一次
- 如果端口 8082/3000 被占用，修改 docker-compose 中冒号前的端口号
- Bulwark 通过 JMAP 协议连接 Stalwart，不需要 IMAP/SMTP 配置
