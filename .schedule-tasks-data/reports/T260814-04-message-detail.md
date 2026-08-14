# Report — T260814-04-message-detail (done)

- Attempts: 1
- Finished: 2026-08-14T02:55:47.764Z

## Development
实现了消息详情页：通过 `/message/:id` 路由按 id 加载单封邮件，展示发送者、收件人、时间、主题与正文；正文整段是 JSON 对象/数组时递归渲染为键值对卡片（嵌套对象、数组、null 都有对应展示），否则按纯文本原样展示；删除操作需二次确认（先点「删除」进入确认态，再点「确认删除」），成功后返回收件箱；邮件不存在、服务器错误、id 缺失、凭证缺失等场景均有友好错误提示与重试/返回入口。

## Files changed
- `minimal-web/message-center/src/views/MessageDetail.vue` — 详情页主体（凭证接入、加载、错误态、删除二次确认），替代原占位页。
- `minimal-web/message-center/src/utils/structuredBody.ts` — `parseStructuredBody`：仅当正文整段为 JSON 对象/数组时返回解析值，纯量 JSON 与非法 JSON 一律回退为纯文本。
- `minimal-web/message-center/src/components/JsonCard.vue` — 递归键值对卡片组件（对象→dl 键值对、数组→列表、纯量→文本，含空对象/空数组态）。
- `minimal-web/message-center/tests/router.test.ts` — 更新占位断言：详情页已非占位，断言改为「返回收件箱」入口；同步更新 TEST_HEADER。
- `minimal-web/message-center/tests/message-detail.test.ts`、`tests/structured-body.test.ts` — 新增测试（见下）。

## Commits
```
a158bae test(message-center): message detail view and structured body parser tests with TEST_HEADER
30094a6 test(message-center): update router test for implemented message detail view
7ae568e feat(message-center): message detail view with JSON structured body and delete
```
（`git log origin/dev..HEAD --oneline`，origin/dev 自分支点后无新提交，rebase 为空操作。）

## Gates verified
- `npm run build`（vue-tsc + vite build）：通过。
- `/message/:id` 路由加载指定邮件：测试断言 `getEmails(['m1'])` 以路由 id 调用并渲染全部字段（router 测试 + message-detail 测试）。
- 普通文本邮件展示原始正文：测试断言 `.body-text` 原样呈现、无 `.json-card`。
- JSON 正文结构化展示：测试断言渲染出 `.json-card` 键值对（含嵌套递归、数组、null），且页面不含原始 JSON 字符串。
- 删除后返回收件箱：测试断言二次确认后 `deleteEmails(['m1'])` 被调用并路由到 `/inbox`（携带 server 参数）。
- 404/500/id 不存在的友好错误：测试覆盖 notFound、HTTP 500、空列表三种场景，均显示错误与重试入口。

## Mutation check
现有套件初跑 1 失败：`tests/router.test.ts` 断言详情占位页显示原始 id 文本「msg-123」，占位页被正式实现替代后该断言失效。已将该用例更新为断言已实现页面的「返回收件箱」入口（非逻辑回归，是占位契约的预期更替）。修复后全套件 52/52 通过，无其他回归。

## Self-review
- 详情页凭证/错误处理模式与 Inbox.vue 保持一致（URL query → user store → 缺凭证提示），未引入新范式。
- 删除失败时停留在详情页并显示错误、重置确认态；未读标记等其他逻辑未动。
- 返回收件箱时仅携带 `server` 参数（user/pass 已在 store 中，避免不必要的 URL 凭证扩散）。
- JSON 检测按 guardrail 保持简单规则：先做 `{`/`[` 首尾快速判断再 `JSON.parse`，纯量 JSON 不视为结构化内容。
- 自审查未发现需修复的问题；测试断言错误（嵌套键遗漏）已在测试阶段修正。

## Tests
新增两个测试文件，均带 TEST_HEADER：
- `tests/structured-body.test.ts`（8 例）— 解析规则：对象/数组/空白包裹解析成功；普通文本、含 JSON 片段的文本、非法 JSON、纯量 JSON、空串均返回 null。
- `tests/message-detail.test.ts`（12 例）— 视图行为：缺凭证不请求、URL/store 凭证传递、全字段渲染、纯文本原样展示、JSON 卡片渲染（含递归与原始串缺席断言）、删除二次确认/取消/失败驻留、notFound/500/空列表错误、返回按钮。
脆弱点（已写入 RISK 行）：卡片断言依赖 class 名；「不含原始 JSON 串」为整串断言。

## Caveats
- jmap 模块在视图测试中被整体 mock，详情页与真实 Stalwart 的端到端联调（真实 404/网络失败）未在本任务验证，协议层由 `tests/jmap.test.ts` 保障。
- 打开详情页不会把邮件标记为已读（`$seen`），Mission 未要求；如需「已读」行为建议后续任务补充。
- 删除后返回 `/inbox` 只带 `server` query：刷新收件箱页面时若 store 丢失且无 user/pass 参数，会显示凭证提示——与现有 Inbox 跳转行为一致。
- 建议 reviewer 重点看：`JsonCard.vue` 递归渲染对极端嵌套的样式表现，以及 `parseStructuredBody` 对「正文以 { 开头但实为普通文本」场景的误判面（已用 `{not json}` 用例覆盖回退）。
