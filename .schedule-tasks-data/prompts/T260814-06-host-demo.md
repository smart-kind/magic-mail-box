# Task — 实现宿主 Demo              (T260814-06-host-demo, full-chain)

> MUST read `templates/harness-common.md` first — it is a binding constraint on
> this plan (knowledge graph, execution protocol, TEST_HEADER convention, resume).

## Mission
实现 `minimal-web/host-demo/index.html` 宿主管理程序：一个单 HTML 文件（内联 JS/CSS，无需构建），包含 demo 用户选择器、批量创建 100 个测试用户按钮、在 iframe 中嵌入消息中心按钮。用户切换和凭证通过 iframe URL 参数传递给消息中心，用于多标签页多用户通信测试。

## References
- Plan / spec: `minimal-web/docs/first-plan.md`
- Relevant code / docs: `minimal-web/host-demo/index.html`（新建）、`minimal-web/message-center/`（构建产物入口）

## Acceptance gates  (natural language — YOU discover the concrete commands for this repo)
- `minimal-web/host-demo/index.html` 能直接在浏览器打开，无需构建步骤。
- 页面包含用户选择器，列出 demo001 ~ demo100（初始可从 localStorage 加载，或显示占位）。
- “创建测试用户”按钮调用 Stalwart JMAP API（Account/set）成功创建 demo001@local.test ~ demo100@local.test，密码统一规则生成（如 Demo001! ~ Demo100!）。
- 创建成功后用户选择器自动加载这些用户，并存入 localStorage 以便刷新后可用。
- “打开消息中心”按钮能在 iframe 中加载 `message-center` 的入口，并通过 URL 参数传入当前选中用户的用户名与密码。
- 页面样式简洁实用，无外部重型 UI 库依赖。

## Guardrails
- Branch: `automation/T260814-06-host-demo` — your own `automation/<id>` branch, inside your task worktree.
  Never touch main. Commit cadence: 每个可运行的小阶段都提交。
- Work in the task worktree only; your branch is an isolated workspace. You merge
  ONLY your own work (see the merge protocol below) — never anyone else's.
- Architecture invariants: 宿主 Demo 是纯前端单文件，不依赖构建工具；批量创建用户时正确构造 JMAP Account/set 请求；iframe URL 传参方式与 message-center 的自动登录逻辑保持一致；不要把真实生产服务器地址硬编码为不可配置。
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
Write your consolidated report to `.schedule-tasks-data/reports/T260814-06-host-demo.md`:

```markdown
# Report — T260814-06-host-demo

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
5. Print exactly `[[TASK_DONE T260814-06-host-demo commit=<sha>]]`. The runner then fast-forwards
   `<inbox>` to your branch, pushes it, and deletes your worktree + branch.

If you genuinely cannot resolve a merge conflict: DO NOT delete anything —
commit all work on your branch, `git push origin <branch>`, write the report
including the exact conflict details, and end FAILED (no `[[TASK_DONE]]`). The
author will re-dispatch against your branch.
