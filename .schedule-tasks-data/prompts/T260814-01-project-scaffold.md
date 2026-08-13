# Task — 搭建 message-center 项目骨架              (T260814-01-project-scaffold, full-chain)

> MUST read `templates/harness-common.md` first — it is a binding constraint on
> this plan (knowledge graph, execution protocol, TEST_HEADER convention, resume).

## Mission
创建 minimal-web/message-center/ 目录下的 Vue 3 + TypeScript + Vite 项目骨架，并完成基础路由配置。这是整个 Minimal Web 系统的 UI 框架基础，后续所有消息中心页面都在此之上构建。

## References
- Plan / spec: `minimal-web/docs/first-plan.md`
- Relevant code / docs: `minimal-web/message-center/`（新建）、`../bulwark-webmail/`（仅参考 JMAP 认证与调用模式，不复制代码）

## Acceptance gates  (natural language — YOU discover the concrete commands for this repo)
- `cd minimal-web/message-center && npm install` 成功，没有依赖冲突或高危漏洞。
- `npm run dev` 能在本地启动开发服务器，没有 TypeScript 或 Vite 配置错误。
- `npm run build` 能成功产出 `dist/` 产物。
- 浏览器访问首页能看到“消息中心”雏形，且 `/login`、`/inbox`、`/message/:id`、`/compose` 四个路由都能正常渲染对应页面占位。

## Guardrails
- Branch: `automation/T260814-01-project-scaffold` — your own `automation/<id>` branch, inside your task worktree.
  Never touch main. Commit cadence: 每个可运行的小阶段都提交。
- Work in the task worktree only; your branch is an isolated workspace. You merge
  ONLY your own work (see the merge protocol below) — never anyone else's.
- Architecture invariants: 使用 Vue 3 Composition API + `<script setup>`；Pinia 或 Vue reactive 管理全局用户状态；路由使用 vue-router 4；目录结构必须严格遵循 first-plan.md 的约定。
- Batch: `B260814-01-minimal-web`; this task depends on nothing.

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
Write your consolidated report to `.schedule-tasks-data/reports/T260814-01-project-scaffold.md`:

```markdown
# Report — T260814-01-project-scaffold

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
5. Print exactly `[[TASK_DONE T260814-01-project-scaffold commit=<sha>]]`. The runner then fast-forwards
   `<inbox>` to your branch, pushes it, and deletes your worktree + branch.

If you genuinely cannot resolve a merge conflict: DO NOT delete anything —
commit all work on your branch, `git push origin <branch>`, write the report
including the exact conflict details, and end FAILED (no `[[TASK_DONE]]`). The
author will re-dispatch against your branch.
