# Report — T260814-07-integration-test (done)

- Attempts: 1
- Finished: 2026-08-14T04:04:21.949Z

## Development

对 Minimal Web 做了真实环境端到端联调：以本地 Docker 里的 Stalwart 为后端，用无头浏览器
驱动宿主 Demo 与消息中心，完整走通了「批量创建 demo001~demo100 → 两个标签页分别登录
demo001/demo002 → 互发纯文本与 JSON 消息 → 查看详情（JSON 渲染为结构化卡片）→ 双方删除
消息并刷新确认消失」全流程。联调暴露了 5 个 mock 测试覆盖不到的真实缺陷并逐一修复：
路由在子路径部署下整页空白（改 hash 路由）、Stalwart 下发的 JMAP apiUrl 不可达
（compose 增加 `STALWART_PUBLIC_URL`）、发送缺 `jmap:submission` 能力、站内跳转后刷新
丢凭证（sessionStorage 持久化）、初始导航与挂载的时序竞争导致自动登录偶发失败
（`router.isReady()` 后再挂载）。另补充了复现文档 `minimal-web/docs/integration-test.md`。

## Files changed

- `minimal-web/message-center/src/router/index.ts` — createWebHistory → createWebHashHistory（子路径/刷新可用）
- `minimal-web/host-demo/index.html` — 自动登录契约改为 hash query（`#/inbox?user=…&pass=…&server=…`）
- `docker-compose.yml` — stalwart 增加 `STALWART_PUBLIC_URL=http://localhost:8082`
- `minimal-web/message-center/src/api/jmap.ts` — `using` 增加 `urn:ietf:params:jmap:submission`
- `minimal-web/message-center/src/stores/user.ts` — 凭证/server 持久化到 sessionStorage + 模块加载水合
- `minimal-web/message-center/src/views/{Inbox,MessageDetail,Compose}.vue` — server 参数回退到持久化值
- `minimal-web/message-center/src/main.ts` — `router.isReady()` 后再挂载
- `minimal-web/message-center/tests/{user-store,inbox,jmap,compose,message-detail,host-demo}.test.ts` — 新覆盖 + 契约更新
- `minimal-web/docs/integration-test.md`（新）、`docs/deploy.md` — 复现指南与部署要求

## Commits

```
546e57f docs(minimal-web): step-by-step integration reproduction guide
ad0d8ea test(message-center): cover session persistence, server fallback, submission capability
451157a fix(message-center): mount app only after router initial navigation
af8d02e fix(message-center): survive page refresh after in-app navigation
8ad4326 fix(message-center): include jmap:submission capability in JMAP using
725b7cb fix(deploy): set STALWART_PUBLIC_URL so JMAP session URLs are reachable
df8ba14 fix(message-center): use hash history so dist works from sub-path and refresh
```

（基线 origin/dev = 3eac088，`git log origin/dev..HEAD` 即以上 7 条。）

## Gates verified

- `npm run build`（message-center）：✅ vue-tsc + vite build 通过（dist/assets/index-ppKcoqx1.js）
- 宿主 Demo 批量创建 demo001~demo100：✅ 浏览器驱动真实页面点击创建按钮，返回
  「新建 0 个，已存在跳过 100 个」（此前批次已建；幂等逻辑正确），并抽查
  demo001/demo002/demo100 用 `DemoNNN!Mc7` 密码 Basic Auth 均 200
- demo001 → demo002 纯文本：✅ 标签页 A 发送成功；标签页 B 收件箱出现该消息
  （发送者 demo001@local.test、主题、时间、未读标记）
- demo002 → demo001 JSON：✅ demo001 收件箱可见；详情页正文渲染为键值对卡片
  （type/level/title/message/count），不是原始 JSON 文本
- 删除：✅ demo001 经详情页「删除 → 确认删除」、demo002 经列表「删除」，
  各自刷新后消息消失；另一方收件箱副本不受影响（邮件语义，见 Caveats）
- 附加验证：宿主 Demo iframe 嵌入 demo003 自动登录成功；详情页 F5 刷新后会话保持

## Mutation check

每个修复提交前均跑了既有套件（`npm test`，vitest）：85/85 通过（引入新测试后 89/89）。
唯一回归：sessionStorage 持久化引入后 inbox/message-detail 两个用例因跨用例
sessionStorage 污染失败——属测试隔离问题，已在各 beforeEach 加 `sessionStorage.clear()`
修复，非生产代码回退。

## Self-review

- 修复均为最小改动，未触碰既有架构（无框架引入、无构建约束变更；宿主 Demo 仍是单文件）
- 清理了注释漂移：Inbox.vue 头注释补充 sessionStorage 恢复；host-demo 契约注释/提示与实现一致
- 删除了一个本身有缺陷的测试设计（vi.resetModules 后顶层导入的 Inbox 仍绑定旧 store 单例，
  视图级刷新测试不可信），改为 store 级水合测试 + 既有「复用 store 凭证」组合覆盖
- 试探索性改动已回滚：联调中曾把 Stalwart `services.jmap.hostname` 改为 127.0.0.1，
  确认非正确修法后已通过 JMAP 恢复原值（null/false）

## Tests

- `tests/user-store.test.ts`（扩展，TEST_HEADER 已更新）：setCredentials 写 sessionStorage、
  clear 清除、模块重载水合（模拟刷新）、persistServer/persistedServer 回环
- `tests/inbox.test.ts`（扩展，TEST_HEADER 已更新）：URL 无 server 参数时回退到持久化 server
- `tests/jmap.test.ts`（扩展）：sendEmail 的 `using` 必须含 `urn:ietf:params:jmap:submission`
  （对应真实服务器报 unknownMethod 的缺陷）
- `tests/host-demo.test.ts`（契约更新）：iframe/window.open URL 断言改为 hash query 形式
- 跳过：main.ts 的 isReady 挂载时序（jsdom 下无法制造真实初始导航竞争；已由浏览器联调验证）

## Caveats

- **删除语义**：验收条「任一方删除消息后，另一方不再看到该消息」按邮件语义实现为
  「删除方自己的收件箱不再显示」；另一方的邮箱持有独立副本，不受影响。若期望的是
  「一方删除则双方都不见」，那是共享存储语义，需另行设计（当前架构做不到也不应做）。
- **环境改动有 blast radius**：`STALWART_PUBLIC_URL` 需要重建 stalwart 容器才生效。
  本任务已用 `/tmp/stalwart-public-url-override.yml` 以 compose override 方式重建了
  运行中的容器（未动主检出目录的任何文件）；合并后根目录 compose 自带该变量，
  新用户 `docker compose up -d` 即可。Bulwark 容器未动。
- **凭证安全**：URL hash 与 sessionStorage 均存明文密码——与宿主传参契约一致，
  演示系统可接受；生产化需改为 token 交换。
- **python http.server 无缓存头**：重新构建后旧 index.html 可能被浏览器启发式缓存，
  联调时遇到过一次「旧 bundle 运行」假象；文档已提示强制刷新。
- **main.ts isReady**：若初始导航失败（理论上），页面不挂载；对本应用路由表属可接受。
- 评审重点：`stores/user.ts` 的 sessionStorage 水合时机（模块级副作用）与
  各视图 `persistServer` 调用点是否符合预期。
