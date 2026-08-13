# Task — 实现消息详情页              (T260814-04-message-detail, full-chain)

> MUST read `templates/harness-common.md` first — it is a binding constraint on
> this plan (knowledge graph, execution protocol, TEST_HEADER convention, resume).

## Mission
实现 `minimal-web/message-center/src/views/MessageDetail.vue` 消息详情页：展示单条邮件的完整内容，包括发送者、收件人、时间、主题和正文；如果正文是 JSON 格式，则解析并渲染为结构化卡片/UI 元素；支持删除邮件。

## References
- Plan / spec: `minimal-web/docs/first-plan.md`
- Relevant code / docs: `minimal-web/message-center/src/views/MessageDetail.vue`（新建或完善）、`minimal-web/message-center/src/api/jmap.ts`

## Acceptance gates  (natural language — YOU discover the concrete commands for this repo)
- `npm run build` 在 `message-center` 目录下成功。
- 通过 `/message/:id` 路由能正确加载指定邮件详情。
- 普通文本邮件展示原始正文。
- JSON 格式正文能解析并以卡片/键值对形式结构化展示，而不是显示原始 JSON 字符串。
- 点击删除后邮件被删除并返回收件箱列表。
- 无法加载邮件（404/500/id 不存在）时有友好的错误提示。

## Guardrails
- Branch: `automation/T260814-04-message-detail` — your own `automation/<id>` branch, inside your task worktree.
  Never touch main. Commit cadence: 每个可运行的小阶段都提交。
- Work in the task worktree only; your branch is an isolated workspace. You merge
  ONLY your own work (see the merge protocol below) — never anyone else's.
- Architecture invariants: JSON 渲染先做简单规则（递归键值对卡片），不引入 JSON Schema 或复杂配置；删除操作确认弹窗/二次确认；所有数据访问走 jmap.ts；URL 中的 id 参数做基础校验。
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
Write your consolidated report to `.schedule-tasks-data/reports/T260814-04-message-detail.md`:

```markdown
# Report — T260814-04-message-detail

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
5. Print exactly `[[TASK_DONE T260814-04-message-detail commit=<sha>]]`. The runner then fast-forwards
   `<inbox>` to your branch, pushes it, and deletes your worktree + branch.

If you genuinely cannot resolve a merge conflict: DO NOT delete anything —
commit all work on your branch, `git push origin <branch>`, write the report
including the exact conflict details, and end FAILED (no `[[TASK_DONE]]`). The
author will re-dispatch against your branch.
