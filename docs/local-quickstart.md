# Magic Mail Box — 本地启动指南（实操记录）

> 本文档记录在 Windows + Docker Desktop 环境下从零启动并测试 magic-mail-box 的完整步骤，含实际踩坑与解法。命令按 **bash**（Git Bash / WSL）风格给出。与 [`deploy.md`](./deploy.md)（Stalwart + Bulwark 通用部署）、[`stalwart-snappymail-deploy.md`](./stalwart-snappymail-deploy.md) 互补，后者是参考文档，本文是**实操手册**。
>
> 演示系统（minimal-web）的设计见 [`../minimal-web/docs/first-plan.md`](../minimal-web/docs/first-plan.md)，联调复现见 [`../minimal-web/docs/integration-test.md`](../minimal-web/docs/integration-test.md)。

---

## 0. 环境前置

| 项 | 要求 | 本次实测 |
|---|---|---|
| OS | Windows + bash（Git Bash 或 WSL） | win32 |
| Docker | Docker Desktop + Compose | Docker 29.6.2 / Compose v5.3.1 |
| Node | 22+ | v22.22.2 |
| Python | 3.x（起静态服务） | 用 `uv run --no-project python`（uv 0.12.3，Python 3.12.13） |
| 浏览器 | 任意现代浏览器 | — |

> 不需要域名、DNS、TLS 证书。本地测试用 `mail.local` / `local.test`。
>
> 下文命令假设当前目录为项目根 `magic-mail-box/`。若需切换：`cd /e/Work/zskj/magic-mail-box`（Git Bash）或 `cd /mnt/e/Work/zskj/magic-mail-box`（WSL）。

---

## 1. 启动 Stalwart

```bash
docker compose up -d stalwart
```

首次会拉镜像（约几百 MB），耐心等待。启动后确认：

```bash
docker ps --filter "name=stalwart" --format "{{.Status}}"
# 期望: Up X seconds (healthy)
```

端口映射（见 `docker-compose.yml`）：

| 宿主端口 | 容器端口 | 用途 |
|---|---|---|
| 8082 | 8080 | WebAdmin + JMAP API |
| 25 / 587 / 993 / 443 | 同 | SMTP / SMTP 提交 / IMAPS / HTTPS |

**关键环境变量**（已在 `docker-compose.yml` 配好）：

- `STALWART_PUBLIC_URL=http://localhost:8082`：JMAP session 返回的 `apiUrl` 由它决定。不设会回退 `https://mail.local`，浏览器无法访问，所有 JMAP 客户端报 `Failed to fetch`。
- `STALWART_RECOVERY_ADMIN`：管理员恢复密码，从 `.env` 读取（见第 3 节）。**勿在 docker-compose.yml 写明文口令。**

---

## 2. 首次初始化（Setup Wizard，仅首次）

仅当 `./stalwart/config/` 为空（全新环境）时需要。**已初始化过可跳过本节，直接用第 3 节的恢复密码。**

### 2.1 取临时管理员密码

```bash
docker logs stalwart 2>&1 | grep -iE "password|bootstrap"
```

输出形如：

```
🔑 Stalwart bootstrap mode - temporary administrator account
   username: admin
   password: <临时密码>
```

> 若输出为空，说明容器已初始化过（配置已存在，不再走 bootstrap 模式），属正常现象。直接跳到第 3 节用恢复密码 `admin / <你的管理员口令>` 登录。

### 2.2 浏览器完成向导

打开 `http://localhost:8082/admin` → 用户名 `admin` + 临时密码 → Setup Wizard：

| 步骤 | 字段 | 填写值 |
|---|---|---|
| Step 1 Server Identity | Server Hostname | `mail.local` |
| | Default Email Domain | `local.test` |
| | Automatically Obtain TLS Certificate | **关闭** |
| | Generate Email Signing Keys | **关闭** |
| Step 2 Storage | 全部 | 默认（RocksDB） |
| Step 3 Account Directory | | 默认（Internal Directory） |
| Step 4 Logging | | 选 **Console** |
| Step 5 Automatic DNS Management | | 默认 |

### 2.3 记下永久管理员凭证

向导完成时生成**永久管理员账号 + 密码**，页面只显示一次，务必记下。

### 2.4 重启使配置生效

```bash
docker restart stalwart
```

重启后用永久管理员登录。**临时密码此时已失效**。

> ⚠️ 踩坑：临时密码在 wizard 完成后立即失效。如果没记下永久密码，见第 3 节恢复。

---

## 3. 管理员密码恢复（忘掉永久密码时）

永久密码哈希存在 RocksDB 里，读不出明文。用 `STALWART_RECOVERY_ADMIN` 环境变量重置：

`docker-compose.yml` 的 stalwart `environment` 已含：

```yaml
- STALWART_RECOVERY_ADMIN=admin:<你的管理员口令>  # 实际值从 .env 注入，勿提交明文
```

重建容器即生效：

```bash
docker compose up -d --force-recreate stalwart
```

验证：

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" -L -u "admin:<你的管理员口令>" http://localhost:8082/.well-known/jmap
# 期望: HTTP 200
```

> ⚠️ 注意：只要 `STALWART_RECOVERY_ADMIN` 在，每次 `--force-recreate` 都会把 admin 密码重置为 `.env` 中的值。登录 WebAdmin 改成自己密码后，若不想被覆盖，从 docker-compose.yml 删掉这行。
>
> 登录用户名是 `admin`（不是邮箱格式 `admin@local.test`）。

### 3.1 验证 JMAP session

```bash
curl -sL -u "admin:<你的管理员口令>" http://localhost:8082/.well-known/jmap
```

确认返回 JSON 里：

- `"apiUrl":"http://localhost:8082/jmap/"`（`STALWART_PUBLIC_URL` 生效）
- `"username":"admin"`
- `capabilities` 含 `urn:ietf:params:jmap:submission`（发送邮件需要）

---

## 4. 开启 CORS（浏览器直连 JMAP 必需，一次性）

> ⚠️ **SECURITY（仅限本地演示，AUDIT-07）**：Permissive CORS（`access-control-allow-origin: *`）允许任意网站跨域访问 JMAP，配合明文 Basic Auth 风险大。仅限本机演示；对外环境必须收窄到实际前端来源（如 `http://localhost:8777`）。

host-demo 从 `http://127.0.0.1:8777` 跨域请求 `http://localhost:8082`，需 Stalwart 开 permissive CORS。

### 4.1 WebAdmin 操作

`http://localhost:8082/admin` → **Settings → HTTP → Security → 开启 Permissive CORS policy** → Save

### 4.2 重启容器使生效

> ⚠️ 踩坑：开了 CORS 但不重启，响应头不会出现，host-demo 仍报 `Failed to fetch（检查 CORS 设置）`。

```bash
docker restart stalwart
```

### 4.3 验证 CORS

```bash
curl -s -i -X OPTIONS \
  -H "Origin: http://127.0.0.1:8777" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization" \
  http://localhost:8082/jmap/ | grep -i "access-control"
```

期望输出含：

```
access-control-allow-origin: *
access-control-allow-headers: Authorization, Content-Type, Accept, X-Requested-With
access-control-allow-methods: POST, GET, PATCH, PUT, DELETE, HEAD, OPTIONS
```

---

## 5. 构建消息中心前端

```bash
cd minimal-web/message-center
npm ci
npm run build
```

产物在 `dist/`，资源用相对路径（`vite.config.ts` 的 `base: './'`），便于被宿主 iframe 从子路径嵌入。

> 单元测试（可选）：`npm test` → vitest，9 文件 86 用例。

---

## 6. 起静态服务

新开一个终端窗口，**保持运行**：

```bash
cd minimal-web
uv run --no-project python -m http.server 8777 --bind 127.0.0.1
```

看到 `Serving HTTP on 127.0.0.1 port 8777` 即成功，**这个窗口不要关**。

> ⚠️ 不要用 `file://` 直接打开 `dist/index.html`：浏览器会拦截 `file://` 下 ES module 加载。
>
> 也可用任意静态服务器（`npx serve`、nginx 等），端口 8777 只是约定。

---

## 7. 宿主 Demo 测试流程

### 7.1 打开宿主

浏览器访问 `http://127.0.0.1:8777/host-demo/`

### 7.2 环境配置

点「环境配置」弹窗：

| 字段 | 值 |
|---|---|
| 服务器地址 | `http://localhost:8082` |
| 消息中心地址 | `../message-center/dist/index.html` |
| 管理员账号 | `admin` |
| 管理员密码 | `<你的管理员口令>` |

保存。凭证写入 `localStorage`。

### 7.3 批量创建测试用户

点「创建测试用户（demo001 ~ demo100）」。状态区显示「新建 100 个」或「已存在跳过 100 个」（幂等可重复点）。

用户规则：`demoNNN@local.test`，密码 `DemoNNN!Mc7`（`!Mc7` 后缀为通过 Stalwart 的 zxcvbn 强度检查）。

> 若报 `Failed to fetch（检查 CORS 设置）`：回到第 4 节确认 CORS 已开且已重启容器。

### 7.4 多标签页多用户通信

1. 选 `demo001@local.test` → 点「打开消息中心」→ 自动登录，显示收件箱
2. 新标签页再开宿主 Demo → 选 `demo002@local.test` → 打开消息中心
3. **demo001 发纯文本**：在收件箱页点「发消息」按钮 → 弹窗里收件人输 `demo002` → 填主题/内容 → 发送。发送后弹窗自动关闭，无需跳转单独页面。
4. **demo002 收信**：点「刷新消息」→ 看到 demo001 的消息（未读蓝点）→ 点开看详情
5. **demo002 发结构化通知**：在收件箱页点「发消息」→ 消息形式切「结构化通知」→ 填通知标题（如「回复确认」）、级别（提示/警告/错误）、内容 → 发送。系统自动序列化为 JSON 发送，用户无需手写 JSON。
6. **demo001 看结构化卡片**：点「刷新消息」→ 打开 demo002 的回复 → 正文自动渲染为键值对卡片（`type`/`title`/`level`/`content`）
7. **删除**：任一方删除，刷新后从自己收件箱消失（不影响对方副本）

> 每个邮箱持有自己副本。demo001 删除自己收件箱里的消息，不影响 demo002 收件箱里的副本。

---

## 8. 端口一览

| 端口 | 服务 | 用途 |
|---|---|---|
| 8082 | Stalwart | WebAdmin + JMAP API（映射自容器 8080） |
| 8777 | Python HTTP | host-demo + message-center 静态服务 |
| 5173 | Vite dev | message-center 开发模式（可选，`npm run dev`） |
| 25 / 587 / 993 / 443 | Stalwart | SMTP / SMTP 提交 / IMAPS / HTTPS |

---

## 9. 踩坑记录

| 现象 | 原因 | 解法 |
|---|---|---|
| `docker logs ... \| grep` 输出为空 | 容器已初始化过，不再走 bootstrap 模式 | 属正常，直接用第 3 节恢复密码 |
| 临时密码登录被拒 | wizard 完成后临时密码立即失效 | 用永久密码；丢了用 `STALWART_RECOVERY_ADMIN` 重置（第 3 节） |
| 永久密码丢失 | wizard 完成时只显示一次 | `STALWART_RECOVERY_ADMIN=admin:<密码>` + `--force-recreate`（第 3 节） |
| `apiUrl` 是 `https://mail.local` | 未设 `STALWART_PUBLIC_URL` | `docker-compose.yml` 已设 `http://localhost:8082` |
| 创建用户报 `Failed to fetch（检查 CORS 设置）` | Stalwart 未开 CORS，或开了没重启 | WebAdmin 开 Permissive CORS + `docker restart stalwart`（第 4 节） |
| 页面空白、只有导航栏 | 旧构建缓存 | 强制刷新；确认 `dist/` 是最新构建 |
| `未提供用户名` | URL 缺 `user` 参数 | 用 `#/inbox?user=用户名` 形式（宿主 Demo 已自动拼好） |
| 发送报 `unknownMethod` | 缺 `jmap:submission` 能力 | 重新 `npm run build` |
| 静态服务起不来 | 后台进程随 shell 退出被回收 | 在独立终端窗口起服务并保持运行（第 6 节） |

---

## 10. 开发模式（可选）

不用构建，直接跑 Vite 开发服务器：

```bash
cd minimal-web/message-center
npm run dev    # http://localhost:5173
```

宿主 Demo「环境配置」里把消息中心地址改为 `http://localhost:5173`。

---

## 11. 清理 / 重置

```bash
# 停止容器
docker compose stop stalwart

# 彻底删除容器 + 数据（会清掉所有邮箱用户和配置）
docker compose down -v
rm -rf stalwart/config stalwart/data

# 重新启动（回到首次初始化，需重走第 2 节 wizard）
docker compose up -d stalwart
```

> 删除 `docker-compose.yml` 里的 `STALWART_RECOVERY_ADMIN` 行可关闭密码自动重置（登录 WebAdmin 改密码后建议删除）。

---

## 12. 相关文档

| 文档 | 内容 |
|---|---|
| `docs/PROJECT_OVERVIEW.md` | 项目全景 |
| `docs/deploy.md` | Stalwart + Bulwark 通用部署 |
| `docs/stalwart-snappymail-deploy.md` | Stalwart + SnappyMail 部署 |
| `minimal-web/README.md` | 演示系统说明 |
| `minimal-web/docs/first-plan.md` | 演示系统架构设计 |
| `minimal-web/docs/integration-test.md` | 演示系统联调复现指南 |
| `local.env.info.md` | 本地管理员凭证（本地专用，勿提交真实环境） |
