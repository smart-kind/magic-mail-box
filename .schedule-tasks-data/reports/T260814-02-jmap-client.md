# Report — T260814-02-jmap-client

## Development
在 `minimal-web/message-center/src/api/jmap.ts` 实现了完整的 JMAP 客户端封装（`createJmapClient`），供 Inbox / MessageDetail / Compose 页面调用。客户端通过 `GET {baseUrl}/.well-known/jmap` 做会话发现（HTTP Basic Auth），提取 accountId / downloadUrl；核心操作包括：`queryInboxIds`（Mailbox/query 按 role=inbox 定位收件箱 + Email/query 按 receivedAt 倒序取 id）、`listInbox`（Email/get 摘要列表）、`getEmails`（含 textBody/bodyValues 的完整正文）、`sendEmail`（Identity/get 取发信身份 → Email/set 建草稿 → EmailSubmission/set 提交，`onSuccessDestroyEmail` 自动清理草稿）、`deleteEmails`（Email/set destroy）。全部仅使用原生 `fetch`，所有方法返回带类型定义的 Promise；错误统一为 `JmapError`（含 HTTP status / JMAP error type），覆盖 401、500、无 accountId、无 identity、notCreated/notDestroyed 等场景，错误信息绝不包含密码。注：任务参考的 `../bulwark-webmail/` 在本 worktree 中不存在，实现依据 JMAP RFC 8620/8621 与 Stalwart 的标准行为。

## Files changed
- `minimal-web/message-center/src/api/jmap.ts` — JMAP 客户端实现（在原骨架的 `basicAuthHeader` 基础上扩展，导出名保持兼容）。
- `minimal-web/message-center/tests/jmap.test.ts` — 新增测试（见下）。

## Commits
```
9e14a29 test(message-center): JMAP client tests with TEST_HEADER; retry session fetch after failure
5014a7f feat(message-center): JMAP client with session, query, get, send, delete
```
（基线：`f9e647b report: task T260814-01-project-scaffold (done)`）

## Gates verified
- `npm run build`（vue-tsc --noEmit && vite build）：通过，无类型错误。
- Session 发现 + accountId/downloadUrl 提取：测试 `session discovery` 组验证（含 Basic Auth 头断言）。
- `Email/query` 返回 id 列表：`queryInboxIds` 测试验证请求体（role=inbox → inMailbox 过滤、receivedAt 倒序）与返回值。
- `Email/get` 获取含 body 的完整邮件：`getEmails` 测试验证 textBody/bodyValues 解析出正文文本。
- `Email/set` 发送邮件：`sendEmail` 测试验证 Identity → 草稿创建 → EmailSubmission 全链路请求体（identityId、#draft 引用、onSuccessDestroyEmail）。
- `Email/set` + destroy 删除：`deleteEmails` 测试验证 destroy 参数与空列表 no-op。
- 错误处理：401 / 500 / 无 accountId / 无 identity / 方法级 error / notCreated / notDestroyed 各有测试，并断言错误信息不含密码。

以上均以 mock fetch（注入 `fetchImpl`）的单元测试验证；未对真实 Stalwart 实例做联调（见 Caveats）。

## Mutation check
既有测试套件（router 3 + user-store 3）在改动后全部通过，无回归。改动仅新增/扩展 `src/api/jmap.ts`，未触碰既有模块。

## Self-review
- 发现并修复：`sendEmail` 初版在同一请求里用 `identityId: '#i'` 引用了 Identity/get 的结果——这不是合法的 JMAP result reference；改为先取 identity（同时用 identity.email 作为发件人，去掉硬编码 `@local.test` 域名），再发 Email/set + EmailSubmission/set。
- 发现并修复：session 缓存失败后永久复用 rejected promise，凭证修正后无法恢复；改为失败时清除缓存（并防止竞态清掉新 promise）。
- 检查：无死代码、无无关改动；`from` 地址、drafts 定位均走服务器数据；密码只出现在 Authorization 头，不进入日志/错误。

## Tests
新增 `minimal-web/message-center/tests/jmap.test.ts`（18 个用例，全部通过），含 TEST_HEADER 块。覆盖：basicAuthHeader 格式、session 发现/缓存/401/500/无账号、queryInboxIds 请求结构与无 inbox 错误、getEmails 正文解析/notFound/方法级 error、listInbox 空收件箱短路、sendEmail 全链路/notCreated/无 identity、deleteEmails destroy/notDestroyed/空列表 no-op。
脆弱点说明：mock 按客户端发出的请求回包，无法发现「结构合法但语义错误」的请求（RISK 行已注明）。

## Caveats
- 仅做了 mock 级验证，未连真实 Stalwart 联调；T260814-07（联调）阶段若发现 Stalwart 特有问题（如 role 大小写、drafts 邮箱不存在、Identity 缺失）需在此层适配。
- `getEmails` 只取 `textBody[0]` 的纯文本正文，HTML-only 邮件会得到空 text（符合本任务纯文本/JSON 消息的定位）。
- 分页未实现：`queryInboxIds`/`listInbox` 固定 limit=50 单页，对演示场景足够。
- Reviewer 可重点审查：`sendEmail` 的两段式流程（Identity 单独一次调用）是否可接受，以及 session 失败重试逻辑。
