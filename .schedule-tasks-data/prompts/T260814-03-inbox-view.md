# Task — 实现消息列表页（收件箱）              (T260814-03-inbox-view, full-chain)

> MUST read `templates/harness-common.md` first — it is a binding constraint on
> this plan (knowledge graph, execution protocol, TEST_HEADER convention, resume).

## Mission
实现 `minimal-web/message-center/src/views/Inbox.vue` 消息列表页：展示当前用户收到的所有邮件，显示发送者、主题、时间、未读标记，支持点击进入详情、支持删除。页面启动时自动用当前用户凭证认证并拉取邮件。

## References
- Plan / spec: `minimal-web/docs/first-plan.md`
- Relevant code / docs: `minimal-web/message-center/src/views/Inbox.vue`（新建或完善）、`minimal-web/message-center/src/api/jmap.ts`（依赖 T260814-02）

## Acceptance gates  (natural language — YOU discover the concrete commands for this repo)
- `npm run build` 在 `message-center` 目录下成功。
- 在宿主 Demo 或手动传入 demo 用户凭证后，Inbox 页能展示至少包含发送者、主题、接收时间、未读状态的邮件列表。
- 点击邮件能跳转到 `/message/:id` 路由（详情页占位或已实现页）。
- 删除邮件后能刷新列表并移除该邮件条目。
- 空收件箱状态有友好的空状态提示。

## Guardrails
- Branch: `automation/T260814-03-inbox-view` — your own `automation/<id>` branch, inside your task worktree.
  Never touch main. Commit cadence: 每个可运行的小阶段都提交。
- Work in the task worktree only; your branch is an isolated workspace. You merge
  ONLY your own work (see the merge protocol below) — never anyone else's.
- Architecture invariants: 使用 Vue 3 Composition API；邮件列表数据通过 JMAP 客户端获取并做最小化的格式化转换；不直接调用 `fetch`，全部走已封装的 jmap.ts；样式简洁实用，不引入重型 UI 库。
- Batch: `B260814-01-minimal-web`; this task depends on T260814-02-jmap-client.

## Full-chain workflow

You are a developer completing a full-chain task. Work through these stages in
order. Do NOT skip stages. If any stage fails fatally (not recoverable), stop
and write the report explaining what happened.

### Stage 1: Development
Implement the feature or fix described in the Mission. Write clean, well-tested
code. Commit at each meaningful checkpoint.

### Stage 2: Mutation check
Run the existing test suite to verify your changes don't break anything. Fix any
regressions before moving on.

### Stage 3: Self-review
Review your own production code:
- Is the code clear and maintainable?
- Are edge cases handled?
- Are there unnecessary changes or dead code?
- Do the tests actually test meaningful behavior (not just fake-data passing)?

Fix anything you find before moving on.

### Stage 4: Testing
Write and run tests for the NEW work you did. Use the TEST_HEADER convention from
harness-common.md. Tests must be meaningful — a test that passes with fake data
is worse than no test.

### Stage 5: Full-chain report (REQUIRED before finishing)
Write your consolidated report to `.schedule-tasks-data/reports/T260814-03-inbox-view.md`:

```markdown
# Report — T260814-03-inbox-view

## Development
<what was done, one paragraph, from the user's perspective>

## Files changed
<key files/dirs touched and why>

## Commits
<git log <inbox>..HEAD --oneline>

## Gates verified
<which acceptance gates you ran and their results>

## Mutation check
<existing test suite result — pass/fail, any regressions found and fixed>

## Self-review
<what you found and fixed during review>

## Tests
<new tests written, TEST_HEADER blocks, anything skipped or fragile>

## Caveats
<known limitations, design decisions, what the reviewer should scrutinize>
```

Commit the report on your branch.

## Merge protocol (REQUIRED after the report is committed)
Your work lands on `<inbox>` (default dev) — YOU resolve the integration; the
runner does the mechanical fast-forward:
1. `git fetch origin`.
2. Rebase (or merge) `origin/<inbox>` into your branch. Resolve conflicts
   yourself — you wrote the code, the repo's tests are the referee. Never punt.
3. Re-run the acceptance gates on the integrated result — they must pass on the
   merged branch, not just your original work.
4. Commit the report (already done above). Do NOT push anything on success.
5. Print exactly `[[TASK_DONE T260814-03-inbox-view commit=<sha>]]`. The runner then fast-forwards
   `<inbox>` to your branch, pushes it, and deletes your worktree + branch.

If you genuinely cannot resolve a merge conflict: DO NOT delete anything —
commit all work on your branch, `git push origin <branch>`, write the report
including the exact conflict details, and end FAILED (no `[[TASK_DONE]]`). The
author will re-dispatch against your branch.
