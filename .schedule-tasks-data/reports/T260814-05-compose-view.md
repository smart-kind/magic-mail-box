# Report — T260814-05-compose-view

## Development

实现了消息中心的发消息页（Compose.vue）：用户可以从 demo 用户列表（默认
demo001~demo100@local.test，支持 localStorage 覆盖以适配宿主自定义域名）中
搜索并多选收件人（选中后以 chips 展示、可移除），填写主题和内容（纯文本 /
JSON 两种模式切换），通过 jmap.ts 的 sendEmail 发送。JSON 模式会在发送前
校验内容必须是合法的 JSON 对象/数组（与详情页 parseStructuredBody 共用同一
识别规则），保证该邮件在 MessageDetail 页能渲染为结构化卡片。空收件人/空
主题/空内容有前端校验提示；发送失败显示 JMAP 错误信息且保留表单内容；发送
成功显示反馈并清空表单，便于连续发送。凭证接入与 Inbox/MessageDetail 一致
（user store 优先，否则 URL query user/pass/server 自动登录，挂载时即检查）。

## Files changed

- `minimal-web/message-center/src/views/Compose.vue` — 发消息页完整实现
  （原为占位页）：收件人搜索/多选 chips、主题、纯文本/JSON 内容模式、校验、
  发送、成功/失败反馈、返回收件箱（保留 server 参数）。
- `minimal-web/message-center/src/data/demoUsers.ts` — 新增：demo 用户列表
  数据模块（默认 demo001~demo100@local.test + localStorage 覆盖回退逻辑）。
- `minimal-web/message-center/tests/compose.test.ts` — 新增：Compose 视图测试。
- `minimal-web/message-center/tests/demo-users.test.ts` — 新增：demoUsers 数据
  模块测试。

## Commits

```
5a36757 test(message-center): compose view + demo-users tests; mount-time credential check
7b5b066 feat(message-center): implement compose view with demo-user recipient picker
```
（`git log dev..HEAD --oneline`）

## Gates verified

- `npm run build`（vue-tsc + vite build）：通过。
- 收件人选择：候选默认含 demo001~demo100，支持搜索过滤与多选（chips），
  由 compose.test.ts 「lists default demo users…」「adds recipients as chips…」
  「sends plain text to multiple recipients…」覆盖。
- 纯文本发送：sendEmail 收到正确的 to/subject/text，成功反馈展示且表单清空
  （「sends plain text…」用例）。
- JSON 发送：合法 JSON 对象原样（trim 后）发送；视图与详情页共用
  parseStructuredBody 规则，JSON 标量/非法 JSON 被拦截（「sends valid JSON…」
  「rejects invalid JSON…」「rejects JSON scalars…」用例）。
- 空收件人/空主题/空内容校验：「validates empty recipients…」用例，三项提示
  均断言且不调用 sendEmail。
- 发送失败：显示 JMAP 错误信息且表单内容保留（「shows the error and keeps…」
  用例）。

## Mutation check

改动前基线：7 个测试文件 66 个用例全通过。改动后（含新增测试前单独跑过一
次）：无回归。最终全套 9 个文件 85 个用例全通过（`npm test`）。
（user-store.test.ts 中 readonly 警告为既有现象，与本次改动无关。）

## Self-review

自审中发现并修复：
- 模板编译错误：textarea 误用自闭合标签（非 void 元素导致后续内容被吞），
  改为显式闭合标签；SFC 末尾笔误多出的 `</template>` 已删除。
- JSON 占位符中的引号/换行原本写在模板属性里靠 HTML 实体转义，脆弱且触发
  编译错误，挪到 script 中的 JSON_PLACEHOLDER 常量。
- `candidates` 不需要响应式（加载后不变），从 ref 改为普通常量。
- 补了挂载时的凭证检查（onMounted），直接进入本页时立即提示而非等点发送。

未发现死代码或不必要改动；jmap.ts 未改动（sendEmail 能力已够用）。

## Tests

新增两个测试文件，均带 TEST_HEADER：
- `tests/compose.test.ts`（11 用例）：凭证接入（无凭证提示/URL query 传参）、
  候选列表与搜索过滤、chips 添加/去重/移除、三项空值校验、纯文本多收件人
  发送+反馈+清表单、JSON 非法/标量拦截、合法 JSON 发送参数断言、失败时错误
  展示+表单保留、返回收件箱保留 server 参数。jmap 模块整体 mock（与
  inbox.test.ts 同一模式），RISK 行已注明协议层由 jmap.test.ts 保证。
- `tests/demo-users.test.ts`（8 用例）：命名规则、默认 100 用户、localStorage
  覆盖、损坏/非数组/无有效项/空数组/无 storage 各种回退。
未对真实 Stalwart 服务器做端到端发送（破坏性操作 guardrail）；真实链路依赖
jmap.test.ts 的协议级契约。

## Caveats

- 未做真实服务器联调：发送链路只验证到「以正确参数调用 sendEmail」，SMTP/
  JMAP 真实往返需按 first-plan.md 的多标签页场景人工验证。
- 候选下拉每次最多渲染 10 条（slice(0, 10)），100 个用户需配合搜索定位；这是
  刻意的简洁取舍。
- 收件人去重以 email 为键；已选中用户从候选中隐藏来实现「不可重复添加」。
- JSON 模式发送的是 trim 后的原文（不重排/不压缩），详情页能解析即可。
- localStorage 覆盖键为 `message-center.demo-users`，host-demo 目前不会写入
  该键——宿主用非 local.test 域名时需自行写入，或后续任务打通。
- 发送成功后停留在 Compose 页（反馈+清表单），未自动跳回收件箱；验收门
  允许二选一。
