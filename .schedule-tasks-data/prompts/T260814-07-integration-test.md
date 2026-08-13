# Task — 联调测试：多标签页多用户通信              (T260814-07-integration-test, full-chain)

> MUST read `templates/harness-common.md` first — it is a binding constraint on
> this plan (knowledge graph, execution protocol, TEST_HEADER convention, resume).

## Mission
对 Minimal Web 系统进行端到端联调验证：确保在多个浏览器标签页中分别切换不同 demo 用户后，用户可以互发消息、查看详情、删除消息。修复联调过程中发现的问题，补充关键缺失或文档，确保整个 first-plan.md 的目标可被复现。

## References
- Plan / spec: `minimal-web/docs/first-plan.md`
- Relevant code / docs: `minimal-web/host-demo/index.html`、`minimal-web/message-center/src/` 下所有页面与 API、`../bulwark-webmail/`（仅参考 JMAP 交互模式）

## Acceptance gates  (natural language — YOU discover the concrete commands for this repo)
- `npm run build` 在 `message-center` 目录下成功。
- 在本地启动 Stalwart 或指向可用测试环境后，宿主 Demo 能批量创建 demo001 ~ demo100。
- 使用两个浏览器标签页分别登录 demo001 与 demo002：
  - demo001 给 demo002 发送一条纯文本消息，demo002 刷新收件箱后能看到该消息。
  - demo002 回复一条 JSON 结构消息，demo001 刷新后能看到结构化卡片展示。
  - 任一方删除消息后，另一方不再看到该消息（在自己的收件箱中）。
- 发现并修复的 bug 都要有对应提交说明；无法修复的必须记录为 caveat。
- 更新/补充 `minimal-web/docs/` 下的说明，使得新用户能按文档复现上述流程。

## Guardrails
- Branch: `automation/T260814-07-integration-test` — your own `automation/<id>` branch, inside your task worktree.
  Never touch main. Commit cadence: 每个可运行的小阶段都提交。
- Work in the task worktree only; your branch is an isolated workspace. You merge
  ONLY your own work (see the merge protocol below) — never anyone else's.
- Architecture invariants: 修复问题时不重写已完成任务的整体架构，只做最小必要改动；保留宿主 Demo 的单文件无构建约束；不要把测试专用代码混入生产代码；文档更新保持与实现一致。
- Batch: `B260814-01-minimal-web`; this task depends on T260814-04-message-detail, T260814-05-compose-view, T260814-06-host-demo.

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
Write your consolidated report to `.schedule-tasks-data/reports/T260814-07-integration-test.md`:

```markdown
# Report — T260814-07-integration-test

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
5. Print exactly `[[TASK_DONE T260814-07-integration-test commit=<sha>]]`. The runner then fast-forwards
   `<inbox>` to your branch, pushes it, and deletes your worktree + branch.

If you genuinely cannot resolve a merge conflict: DO NOT delete anything —
commit all work on your branch, `git push origin <branch>`, write the report
including the exact conflict details, and end FAILED (no `[[TASK_DONE]]`). The
author will re-dispatch against your branch.
