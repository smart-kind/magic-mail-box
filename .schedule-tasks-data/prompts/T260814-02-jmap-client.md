# Task — 实现 JMAP 客户端封装              (T260814-02-jmap-client, full-chain)

> MUST read `templates/harness-common.md` first — it is a binding constraint on
> this plan (knowledge graph, execution protocol, TEST_HEADER convention, resume).

## Mission
在 `minimal-web/message-center/src/api/jmap.ts` 中实现与 Stalwart Mail Server 通信的 JMAP 客户端封装，支持 HTTP Basic Auth 登录、查询邮件、获取邮件详情、发送邮件、删除邮件。所有核心 JMAP 交互应统一封装，供 Inbox、MessageDetail、Compose 页面调用。

## References
- Plan / spec: `minimal-web/docs/first-plan.md`
- Relevant code / docs: `minimal-web/message-center/src/api/jmap.ts`（新建）、`../bulwark-webmail/lib/`（仅参考 JMAP 交互模式，不复制代码）

## Acceptance gates  (natural language — YOU discover the concrete commands for this repo)
- `npm run build` 在 `message-center` 目录下成功，无类型错误。
- 使用真实或 mock 的 Stalwart JMAP 端点能完成以下操作（至少通过单元/集成测试验证）：
  - 用用户名+密码获取 session 对象并提取 accountId / downloadUrl。
  - `Email/query` 查询收件箱返回邮件 id 列表。
  - `Email/get` 根据 id 列表获取完整邮件内容（含 body）。
  - `Email/set` 发送一封邮件到指定收件人。
  - `Email/set` + destroy 删除指定邮件。
- 对 JMAP 错误码（401、500、无 accountId 等）有合适的异常处理与清晰错误信息。

## Guardrails
- Branch: `automation/T260814-02-jmap-client` — your own `automation/<id>` branch, inside your task worktree.
  Never touch main. Commit cadence: 每个可运行的小阶段都提交。
- Work in the task worktree only; your branch is an isolated workspace. You merge
  ONLY your own work (see the merge protocol below) — never anyone else's.
- Architecture invariants: 仅使用原生 `fetch` 或项目内一致的工具库，不引入重型 HTTP 库；所有 JMAP API 调用方法返回 Promise 并带类型定义；HTTP Basic Auth 头构造正确；不暴露真实密码到日志。
- Batch: `B260814-01-minimal-web`; this task depends on T260814-01-project-scaffold.

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
Write your consolidated report to `.schedule-tasks-data/reports/T260814-02-jmap-client.md`:

```markdown
# Report — T260814-02-jmap-client

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
5. Print exactly `[[TASK_DONE T260814-02-jmap-client commit=<sha>]]`. The runner then fast-forwards
   `<inbox>` to your branch, pushes it, and deletes your worktree + branch.

If you genuinely cannot resolve a merge conflict: DO NOT delete anything —
commit all work on your branch, `git push origin <branch>`, write the report
including the exact conflict details, and end FAILED (no `[[TASK_DONE]]`). The
author will re-dispatch against your branch.
