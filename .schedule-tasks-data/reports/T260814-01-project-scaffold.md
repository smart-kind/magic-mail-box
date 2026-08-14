# Report — T260814-01-project-scaffold

## Development
在 `minimal-web/message-center/` 新建了 Vue 3 + TypeScript + Vite 的项目骨架，完成了基础路由配置。应用壳（App.vue）展示「消息中心」标题和导航；`/login`、`/inbox`、`/message/:id`、`/compose` 四条路由分别渲染对应的占位视图，`/` 重定向到 `/inbox`。目录结构严格遵循 `minimal-web/docs/first-plan.md` 的约定（`api/`、`stores/`、`views/`、`router/`）。全局用户状态用 Vue reactive 实现（`stores/user.ts`），JMAP 客户端仅放了 basic auth 头的最小骨架（`api/jmap.ts`），具体 JMAP 交互留给下一个任务。

## Files changed
- `minimal-web/message-center/package.json` / `package-lock.json` — 依赖与脚本（dev/build/preview/test）
- `minimal-web/message-center/index.html`、`vite.config.ts`（`base: './'` 便于 iframe 嵌入）、`vitest.config.ts`、`tsconfig.json`
- `src/main.ts`、`src/App.vue`、`src/router/index.ts` — 入口、应用壳、路由（createWebHistory + 4 路由 + 重定向）
- `src/views/Login.vue`、`Inbox.vue`、`MessageDetail.vue`、`Compose.vue` — 占位视图
- `src/stores/user.ts` — reactive 用户状态（setCredentials / clear / readonly 暴露）
- `src/api/jmap.ts` — JMAP 客户端骨架（`basicAuthHeader`）
- `tests/router.test.ts`、`tests/user-store.test.ts` — 新测试

## Commits
```
548a904 test(message-center): router and user-store tests with TEST_HEADER
a1e1c70 feat(message-center): Vue 3 + TS + Vite scaffold with 4 base routes
```

## Gates verified
- `cd minimal-web/message-center && npm install` — 成功，`found 0 vulnerabilities`，无依赖冲突。
- `npm run dev` — Vite 7.3.6 正常启动（286 ms ready，无 TS/Vite 配置错误）；curl 验证 `/`、`/login`、`/inbox`、`/message/msg-1`、`/compose` 均返回 200。
- `npm run build` — `vue-tsc --noEmit && vite build` 通过，产出 `dist/`（index.html + js/css assets）。
- 路由渲染 — 由 `tests/router.test.ts` 在 jsdom 中挂载 App 验证：四条路由均渲染对应占位视图，App 壳显示「消息中心」标题。

## Mutation check
仓库中此前不存在任何测试套件（无其他 package.json、无 *.test.* 文件，`bulwark-webmail/` 为 gitignore 的外部参考仓库且不在 worktree 中），无回归面。新增测试 6/6 通过。

## Self-review
- 修复了测试自身的缺陷：路由跳转未 await，导致挂载时视图尚未渲染（假失败，非假通过）。
- 确认无死代码：每个源文件都被入口或路由引用；`api/jmap.ts` 的 `basicAuthHeader` 是下一个任务的明确接口，保留为骨架。
- 占位视图均只含注释 + 模板，无多余逻辑；样式集中在 App.vue，未引入 UI 库，符合计划「简洁实用」。

## Tests
- `tests/router.test.ts`（TEST_HEADER 完整）：断言四条路由的 name/path 与生产路由表一致（直接从 `src/router` 导入路由定义，避免复制失真）、`/` → `/inbox` 重定向、四个路由下 App 挂载后渲染出对应占位内容。使用 `createMemoryHistory`，无网络依赖。
- `tests/user-store.test.ts`（TEST_HEADER 完整）：setCredentials 后字段与 loggedIn 正确、clear 复位、readonly 状态不可被外部直接改写。
- 已知脆弱点：路由测试断言的是占位文本，视图实现后需要更新断言（RISK 行已注明）。

## Caveats
- 这是骨架任务：JMAP 交互、自动登录、消息列表/详情/发送的真实功能均不在本任务范围（first-plan.md 步骤 2-5）。
- `basicAuthHeader` 使用 `btoa`，仅支持 ASCII 凭证；测试用户密码（Demo001! 等）为 ASCII，无影响。
- 路由用 `createWebHistory`：dev/preview 下 vite 有 SPA fallback 没问题；若未来以静态文件直接部署到子路径，需服务器配置 fallback 或改 hash 路由。
- 审查重点：`vite.config.ts` 的 `base: './'` 与 history 路由的组合是否满足宿主 iframe 嵌入场景；store 用 reactive 而非 Pinia 是否符合后续任务预期。
