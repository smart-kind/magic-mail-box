# Minimal Web — 联调复现指南

按本文档可以从零复现 first-plan.md 的完整验证流程：批量创建 demo 用户、
多标签页多用户互发消息（纯文本 + JSON 结构化卡片）、查看详情、删除消息。

## 前置条件

- Docker + Docker Compose（Stalwart 测试环境）
- Node.js 22+
- Python 3（或任意静态文件服务器）

## 第一步：启动 Stalwart

```bash
cd magic-mail-box
docker compose up -d stalwart
```

`docker-compose.yml` 中必须设置 `STALWART_PUBLIC_URL=http://localhost:8082`
（仓库已配置）。JMAP session（`/.well-known/jmap`）里的 `apiUrl` 由它决定；
不设置时会回退成 `https://<server.hostname>`（即 `https://mail.local`），
浏览器无法解析，表现为消息中心报「JMAP API 请求失败: Failed to fetch」。

> 已运行的容器改了 compose 需要重建才生效：
> `docker compose up -d --force-recreate stalwart`

浏览器直连 JMAP 还需要 Stalwart 开启 permissive CORS
（WebAdmin → Settings → HTTP → Security → Permissive CORS policy）。
验证：

```bash
curl -sL -u 'admin@local.test:<管理员密码>' http://localhost:8082/.well-known/jmap \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['apiUrl'])"
# 期望输出: http://localhost:8082/jmap/
```

管理员账号密码见仓库根目录 `local.env.info.md`（本地测试环境专用）。

## 第二步：构建消息中心

```bash
cd minimal-web/message-center
npm ci
npm run build    # 产物在 dist/，资源用相对路径（vite base: './'）
```

## 第三步：起静态服务

```bash
cd minimal-web
python3 -m http.server 8777 --bind 127.0.0.1
```

> 不要用 `file://` 直接打开：浏览器会拦截 `file://` 下 ES module 的加载。

## 第四步：批量创建 demo 用户

1. 浏览器打开 `http://127.0.0.1:8777/host-demo/`
2. 「连接设置」保持默认（服务器 `http://localhost:8082`，消息中心地址
   `../message-center/dist/index.html`），填入管理员密码
3. 点击「创建测试用户（demo001 ~ demo100）」
4. 状态区显示「新建 100 个」或「已存在跳过 100 个」（幂等，可重复点击）

用户规则：`demoNNN@<默认域名>`（本环境为 `local.test`），密码 `DemoNNN!Mc7`
（`!Mc7` 后缀是为了通过 Stalwart 的 zxcvbn 密码强度检查）。

## 第五步：多标签页多用户通信

宿主 Demo 通过 hash query 把凭证传给消息中心：
`…/message-center/dist/index.html#/inbox?user=<邮箱>&pass=<密码>&server=<JMAP 地址>`
（必须是 hash query；参数放在 `index.html?…` 里 vue-router 读不到。）

1. **标签页 A**：宿主 Demo 选择 `demo001@local.test`，点「在新标签页打开」
   （或「在 iframe 中打开」）。消息中心自动登录，显示收件箱。
2. **标签页 B**：换个浏览器标签页打开宿主 Demo，选择 `demo002@local.test`，
   同样打开消息中心。（凭证保存在各标签页自己的 sessionStorage，互不串号。）
3. **A 发纯文本**：A 中点「发消息」→ 收件人选 demo002 → 填主题、内容（纯文本）
   → 发送，显示「已发送给 demo002」。
4. **B 收信**：B 中刷新收件箱，能看到 demo001 的消息（带未读蓝点）。
   点击条目可查看详情（发送者/收件人/时间/正文）。
5. **B 回 JSON**：B 中「发消息」→ 收件人选 demo001 → 内容格式切到 **JSON**，
   输入如 `{"type":"notice","title":"回复确认","count":1}` → 发送。
6. **A 看结构化卡片**：A 中刷新收件箱，打开 demo002 的回复，
   正文渲染为键值对卡片（而不是原始 JSON 文本）。
7. **删除**：任一方在列表点「删除」，或在详情页「删除 → 确认删除」；
   刷新后该消息从自己收件箱消失。

> 邮件语义说明：每个邮箱持有自己的副本。demo001 删除自己收件箱里的消息，
> 不影响 demo002 收件箱里的副本，反之亦然。

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 「JMAP API 请求失败： Failed to fetch」 | `apiUrl` 是 `https://mail.local` | 设置 `STALWART_PUBLIC_URL` 并重建容器（见第一步） |
| 创建用户报跨域 / Failed to fetch | Stalwart 未开 permissive CORS | WebAdmin 开启后重启容器 |
| 页面空白、只有导航栏 | 用了旧构建/缓存 | 强制刷新（Cmd+Shift+R）；确认 `dist/index.html` 的 JS 是最新 hash |
| 「未提供用户凭证」 | URL 参数放在了 hash 外面 | 用 `#/inbox?user=…&pass=…` 形式（宿主 Demo 已自动拼好） |
| 发送报 unknownMethod | 旧构建缺 `jmap:submission` 能力 | 重新 `npm run build` |

## 测试

```bash
cd minimal-web/message-center
npm test     # vitest，85+ 个用例（视图用 jsdom + mock JMAP client）
```

协议层与真实 Stalwart 的集成差异（如 `using` 能力集、session URL）只能靠
上面的浏览器联调暴露，mock 测试覆盖不到——这是历次联调发现的主要缺陷来源。
