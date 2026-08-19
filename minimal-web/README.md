# Minimal Web — 消息中心演示系统

基于 [Stalwart Mail Server](https://stalw.art/) 的极简演示系统，将邮件后端包装为通用的"消息中心"。对外看不出是邮件系统，而是一个普通的消息/通知平台。

核心验证点：

- 通过 JMAP API 直连 Stalwart（不经过 IMAP/SMTP）
- 用户批量创建（API 自动化，无需手动操作管理界面）
- 消息收发、详情查看、删除
- 结构化 JSON 消息渲染为自定义卡片 UI
- 多标签页多用户并发通信测试

## 目录结构

```
minimal-web/
├── host-demo/
│   └── index.html              # 宿主管理程序（单文件，含用户创建、切换、消息中心入口）
├── message-center/
│   ├── src/
│   │   ├── api/jmap.ts         # JMAP 客户端封装（RFC 8620/8621）
│   │   ├── stores/user.ts      # 当前用户状态
│   │   ├── views/
│   │   │   ├── Login.vue       # 自动登录（由宿主传参）
│   │   │   ├── Inbox.vue       # 收件箱
│   │   │   ├── MessageDetail.vue  # 消息详情（JSON 渲染为卡片）
│   │   │   └── Compose.vue     # 发消息
│   │   └── router/index.ts
│   ├── package.json
│   └── vite.config.ts
└── docs/
    ├── first-plan.md           # 架构设计文档
    └── integration-test.md     # 联调复现指南
```

## 技术栈

| 组件 | 技术 |
|------|------|
| 消息中心 | Vue 3 + TypeScript + Vite + vue-router（hash 模式） |
| 宿主 Demo | 纯 HTML + JS 单文件，无需构建 |
| 邮件后端 | Stalwart Mail Server（JMAP，非 IMAP/SMTP） |
| 测试 | Vitest + jsdom（85+ 用例） |

## 前置条件

- Docker + Docker Compose
- Node.js 22+
- Python 3（用于起静态文件服务器）

## 快速开始

### 1. 启动 Stalwart 邮件服务器

```bash
cd magic-mail-box
docker compose up -d stalwart
```

> **关键**：`docker-compose.yml` 中的 `STALWART_PUBLIC_URL=http://localhost:8082` 必须设置，否则 JMAP session 返回的 `apiUrl` 是 `https://mail.local`，浏览器无法解析，所有请求会失败。
>
> 如果修改了 compose 配置，需要重建容器才能生效：
> ```bash
> docker compose up -d --force-recreate stalwart
> ```

首次启动需要完成初始化向导：

1. 获取管理员初始密码：`docker logs stalwart 2>&1 | grep -i password`
2. 浏览器打开 `http://localhost:8082/admin`
3. 按向导设置：服务器主机名 `mail.local`，默认域名 `local.test`，不选 TLS 证书，不选 DKIM
4. 向导完成后用新密码登录管理界面

开启浏览器直连所需的 CORS：

- WebAdmin → Settings → HTTP → Security → 开启 **Permissive CORS policy**

验证 JMAP 可用：

```bash
curl -sL -u 'admin@local.test:<管理员密码>' http://localhost:8082/.well-known/jmap \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['apiUrl'])"
# 期望输出: http://localhost:8082/jmap/
```

管理员账号密码见仓库根目录 `local.env.info.md`。

### 2. 构建消息中心

```bash
cd minimal-web/message-center
npm ci
npm run build    # 产物在 dist/，资源使用相对路径
```

### 3. 启动静态文件服务

```bash
cd minimal-web
python3 -m http.server 8777 --bind 127.0.0.1
```

> 不要用 `file://` 直接打开，浏览器会拦截 `file://` 下 ES module 的加载。

### 4. 环境配置

1. 打开 `http://127.0.0.1:8777/host-demo/`
2. 点击「环境配置」，填入管理员账号密码（用于自动创建用户），保存
3. 可选：点击「批量创建 demo001 ~ demo100」预建测试用户

消息中心会根据用户名自动派生密码。用户不存在时会自动创建。

### 5. 多标签页多用户通信测试

宿主 Demo 通过 hash query 把用户名传给消息中心：

```
…/index.html#/inbox?user=<用户名>&server=<JMAP地址>
```

密码由用户名自动派生，无需传递。

**测试流程：**

1. 点「打开消息中心」→ 输入用户名（如 `david`）→ 打开 iframe
2. 再点「打开消息中心」→ 输入另一个用户名（如 `alice`）→ 再开一个 iframe
3. 两个 iframe 水平并排，各自以不同用户身份运行
4. **david 发消息**：发消息 → 收件人输入 `alice` → 填主题和内容 → 发送
5. **alice 收信**：点「刷新消息」，看到 david 的消息（带未读蓝点），点击查看详情
6. **alice 回 JSON**：发消息 → 内容格式切到 JSON → 输入 `{"type":"notice","title":"回复确认","count":1}` → 发送
7. **david 看结构化卡片**：刷新收件箱，打开 alice 的回复，正文渲染为键值对卡片
8. **删除测试**：任一方删除消息，刷新后从自己收件箱消失（不影响对方副本）

## 开发模式

如果不构建而是用 Vite 开发服务器：

```bash
cd minimal-web/message-center
npm run dev    # 默认 http://localhost:5173
```

宿主 Demo 中将「消息中心入口地址」改为 `http://localhost:5173`。

## 运行测试

```bash
cd minimal-web/message-center
npm test       # vitest，85+ 个用例
```

> 单元测试用 jsdom + mock JMAP client，覆盖视图交互逻辑。协议层与真实 Stalwart 的集成差异（能力集、session URL 等）需要通过浏览器联调暴露。

## 端口一览

| 端口 | 服务 | 用途 |
|------|------|------|
| 8082 | Stalwart | Web Admin + JMAP API |
| 8777 | Python HTTP | host-demo + message-center 静态服务 |
| 5173 | Vite dev | message-center 开发模式（可选） |
| 25 / 587 / 993 / 443 | Stalwart | SMTP / IMAPS / HTTPS |

## 常见问题

| 现象 | 原因 | 处理 |
|------|------|------|
| 「JMAP API 请求失败: Failed to fetch」 | `apiUrl` 返回 `https://mail.local` | 确认 `STALWART_PUBLIC_URL=http://localhost:8082` 并重建容器 |
| 创建用户报跨域 / Failed to fetch | Stalwart 未开 permissive CORS | WebAdmin → Settings → HTTP → Security → 开启 Permissive CORS |
| 页面空白、只有导航栏 | 旧构建缓存 | 强制刷新（Cmd+Shift+R）；确认 `dist/` 是最新构建 |
| 「未提供用户名」 | URL 缺少 user 参数 | 必须用 `#/inbox?user=用户名` 形式（宿主 Demo 已自动拼好） |
| 发送报 unknownMethod | 旧构建缺 `jmap:submission` 能力 | 重新 `npm run build` |
