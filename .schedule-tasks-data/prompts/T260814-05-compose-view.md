# Task — 实现发消息页              (T260814-05-compose-view, full-chain)

> MUST read `templates/harness-common.md` first — it is a binding constraint on
> this plan (knowledge graph, execution protocol, TEST_HEADER convention, resume).

## Mission
实现 `minimal-web/message-center/src/views/Compose.vue` 发消息页：允许当前用户选择收件人（从 demo 用户列表中搜索/多选）、填写主题、填写内容（纯文本或 JSON），并通过 JMAP 发送邮件。JSON 内容应作为邮件正文发送，详情页可解析渲染。

## References
- Plan / spec: `minimal-web/docs/first-plan.md`
- Relevant code / docs: `minimal-web/message-center/src/views/Compose.vue`（新建或完善）、`minimal-web/message-center/src/api/jmap.ts`

## Acceptance gates  (natural language — YOU discover the concrete commands for this repo)
- `npm run build` 在 `message-center` 目录下成功。
- 在 Compose 页可以选择一个或多个收件人（至少 demo001~demo100 的预定义用户列表）。
- 填写主题和纯文本内容后能成功发送邮件，发送成功后给出反馈并返回收件箱或清空表单。
- 填写 JSON 内容后能成功发送，且该邮件在 MessageDetail 页能被解析为结构化卡片。
- 对空收件人、空主题、空内容做前端校验并提示。
- 发送失败时展示清晰错误信息。

## Guardrails
- Branch: `automation/T260814-05-compose-view` — your own `automation/<id>` branch, inside your task worktree.
  Never touch main. Commit cadence: 每个可运行的小阶段都提交。
- Work in the task worktree only; your branch is an isolated workspace. You merge
  ONLY your own work (see the merge protocol below) — never anyone else's.
- Architecture invariants: 用户列表先使用预定义 demo 用户（demo001~demo100）或 localStorage 缓存；收件人选择器简洁可用；内容区支持纯文本与 JSON 两种模式；发送调用走 jmap.ts；不对真实邮件服务器做破坏性操作。
- Batch: `B260814-01-minimal-web`; this task depends on T260814-03-inbox-view.

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
Write your consolidated report to `.schedule-tasks-data/reports/T260814-05-compose-view.md`:

```markdown
# Report — T260814-05-compose-view

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
5. Print exactly `[[TASK_DONE T260814-05-compose-view commit=<sha>]]`. The runner then fast-forwards
   `<inbox>` to your branch, pushes it, and deletes your worktree + branch.

If you genuinely cannot resolve a merge conflict: DO NOT delete anything —
commit all work on your branch, `git push origin <branch>`, write the report
including the exact conflict details, and end FAILED (no `[[TASK_DONE]]`). The
author will re-dispatch against your branch.
