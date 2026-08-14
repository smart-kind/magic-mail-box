# Report — T260814-06-host-demo

## Development
实现了 `minimal-web/host-demo/index.html`：一个零构建、纯前端单文件的宿主管理页面。用户可以直接用浏览器打开它，填写 Stalwart 服务器地址和管理员凭证（存 localStorage），一键通过 JMAP 管理 API 批量创建 demo001~demo100 共 100 个测试用户（幂等，可重复点击），在用户选择器中挑选当前标签页身份，然后把消息中心以 iframe 嵌入页面（或新标签页打开），用户凭证通过 `?user=<邮箱>&pass=<密码>&server=<JMAP 地址>` URL 参数传给消息中心做自动登录（参数名与已落地的 `Inbox.vue` 自动登录逻辑逐一核对一致）。多开标签页各选不同用户即可模拟多人通信。开发过程中对本地 Stalwart v1.0.0 实例做了真实 API 探测与无头浏览器联调，修正了多处与计划文档的偏差（见 Caveats）。

## Files changed
- `minimal-web/host-demo/index.html`（新建）— 宿主 Demo 全部功能（内联 JS/CSS，无外部依赖）。
- `minimal-web/message-center/tests/host-demo.test.ts`（新建）— 宿主 Demo 的 jsdom 行为测试。放在 message-center 的测试目录是为了复用其 vitest/jsdom 依赖、让 `npm test` 一条命令覆盖全部测试；测试从磁盘读取真实的 `../host-demo/index.html` 并执行其内联脚本，不是复制品。
- `minimal-web/message-center/package.json` / `package-lock.json` — 新增 devDependency `@types/node`：测试用了 `node:fs`/`node:path` 读取被测 HTML，而 `npm run build` 的 `vue-tsc --noEmit` 会类型检查 `tests/**`，没有 node 类型会报错。
- `.schedule-tasks-data/reports/T260814-06-host-demo.md`（本报告）。

## Commits
（已 rebase 到 origin/dev 最新（含 T260814-02/03/04），以下为提交主题，rebase 后 hash 以 `git log origin/dev..HEAD --oneline` 实时输出为准）
```
report: final — contract realignment, integration findings
fix(host-demo): align iframe URL contract with inbox-view auto-auth (user/pass/server)
report: fill final commit list
chore(message-center): add @types/node for test type-check; update task report
report: task T260814-06-host-demo (done)
test(host-demo): jsdom tests driving real index.html against mocked JMAP server
fix(host-demo): strengthen demo password rule for Stalwart zxcvbn check; document file:// iframe caveat
feat(host-demo): single-file host admin page with user selector, batch create, iframe embed
```

## Gates verified
- **直接在浏览器打开，无需构建** — 通过：`$B goto file://.../host-demo/index.html`（gstack browse 无头 Chromium）页面正常渲染，无构建步骤。
- **用户选择器 / 占位** — 通过：初始显示「尚未创建用户」占位；有 localStorage 数据时直接加载 demo001~demo100。
- **批量创建 100 用户（JMAP Account/set）** — 通过（真实服务器 + 真实浏览器）：点击按钮 → `x:Domain/query` → `x:Domain/get` → `x:Account/set`（100 个 create），真实创建 demo001@local.test~demo100@local.test；抽查 demo042 用生成的密码 Basic Auth 登录 JMAP 返回 200。再次点击幂等跳过（0 新建、100 跳过）。
- **创建后选择器自动加载 + localStorage 持久化** — 通过：reload 后选择器仍有 100 个选项且恢复上次选中项。
- **iframe 加载消息中心并传凭证** — 通过（rebase 后对集成结果实测）：iframe.src 为 `http://localhost:5173/?user=demo005%40local.test&pass=...&server=...`；message-center 路由重定向后参数保留，落在 `/inbox?user=...&pass=...&server=...`，Inbox.vue 成功读到凭证并发起 JMAP 认证（认证之后的失败是 message-center 侧已落地代码的问题，见 Caveats 第一条）。构建产物经静态服务渲染也验证过（`base: './'` 相对路径生效）。
- **样式简洁、无重型 UI 库** — 通过：单文件内联 CSS，零依赖。

## Mutation check
`cd minimal-web/message-center && npm test` — 无回归。集成验证做过两轮：
1. rebase 到含 T260814-02（JMAP 客户端）的 origin/dev：38 个用例全过，`npm run build` 通过；发现 build 会类型检查 tests/，补了 `@types/node` devDependency。
2. rebase 到含 T260814-03（inbox 视图）的 origin/dev：46 个用例全过（5 个测试文件），build 通过。**契约冲突在此处发现并解决**：T260814-03 的自动登录用 `user`/`pass`/`server`，我原先实现的是 `username`/`password`，已将 host-demo 对齐到已落地的一侧（guardrail 要求与 message-center 自动登录逻辑一致）。

## Self-review
- 逐行重读了最终文件：无死代码，所有函数均被使用；错误路径（HTTP 非 2xx、JMAP error 响应、Domain 查询为空、localStorage 损坏）均有处理。
- 确认 `maxObjectsInSet: 500`（实测会话通告）远大于 100，单次 Account/set 批量创建安全。
- 计划偏差（密码规则）与契约来源（Inbox.vue）都在代码注释中注明。
- 集成阶段对「我自己的 URL 契约」做了一次推翻重做——初版参数名是我自定义的，rebase 后发现与已落地实现不一致，已改正。这正是 guardrail 防的问题。

## Tests
新增 `minimal-web/message-center/tests/host-demo.test.ts`（含 TEST_HEADER），14 个用例，全部通过：
- 初始占位状态与默认配置；配置字段默认值。
- 创建流程：三次 JMAP 调用的方法序列与 Basic Auth 头；Account/set 请求体形状（100 个 User、`domainId` 来自 Domain/get、`credentials` 数字键 map、密码 `DemoNNN!Mc7`）。
- 成功后选择器/localStorage 写入；`primaryKeyViolation` 幂等跳过不算失败；其他错误（密码过弱、HTTP 401）不写入用户并给出可读错误。
- iframe src 的 user/pass/server URL 参数契约（默认地址、自定义消息中心地址 + 自定义服务器地址）；未选用户时不加载 iframe；新标签页按钮走 `window.open` 同一契约。
- localStorage 恢复（刷新后无网络恢复列表与选中项）、切换用户持久化、损坏数据回退。

已知局限（TEST_HEADER RISK 行也写了）：mock 响应按 Stalwart v1.0.0 真实响应手工构造，Stalwart 升级改形状时单测不会发现——该风险由真实 curl 探测 + 无头浏览器联调覆盖。

## Caveats
- **【阻塞后续联调，非本任务代码】message-center 的 JMAP 客户端使用 session 通告的 `apiUrl` 发请求，而本地 Stalwart 通告的是 `https://mail.local/jmap/`（安装向导里配的 hostname），浏览器解析不了 → Inbox 报「JMAP API 请求失败: Failed to fetch」。** 证据：`browse network` 显示 session 获取成功（`GET localhost:8082/jmap/session → 200`），随后 `POST https://mail.local/jmap/ → pending/失败`。修复归属 T260814-02 的 `src/api/jmap.ts`（建议：apiUrl/downloadUrl 的 origin 替换为 baseUrl 的 origin，或允许配置覆盖）或服务器 hostname 重配；本任务未改动其他任务的已落地代码。host-demo 侧已验证到「参数被 message-center 正确接收并触发认证」为止。
- **message-center 构建产物放在无 SPA fallback 的静态服务器下路由不匹配**：`createWebHistory` + `python3 -m http.server` 时，访问 `.../dist/index.html` 不匹配任何前端路由（只渲染 App 壳）。用 vite dev 服务器（有 fallback）则正常。这是 message-center 的部署形态问题，建议后续任务评估 hash history 或服务器 rewrite 规则。
- **密码规则偏差（重要）**：计划文档写 `Demo001!`，但 Stalwart v1.0.0 的 zxcvbn 密码强度检查拒绝全部 100 个该格式密码（"Password is too weak"）。实测后确定为 `DemoNNN!Mc7`（追加固定后缀，对 007/050/100 等边界值实测通过）。代码注释与页面提示均已写明。
- **Stalwart 管理 API 细节**（实测得出，官方文档未写明）：管理调用走 `POST /jmap/`（不是 `/api`），`using` 需含 `urn:stalwart:jmap`；`credentials` 必须是以数字字符串为键的 map（`{"0": {"@type":"Password","secret":...}}`），数组或字符串键都会被拒；JMAP result reference（`"#ids"`）在 `x:Domain/get` 上不被支持，故分两次请求。
- **本地服务器配置变更**：为让浏览器跨域调用可用，通过 `x:Http/set` 把本地 dev Stalwart 的 `usePermissiveCors` 置为 `true` 并 `docker restart stalwart` 生效。这是 Stalwart 官方为「跨域 WebUI」场景提供的开关，message-center 直连 JMAP 同样需要。页面 hint 中已说明此要求。
- **file:// 打开时 iframe 受限**：file:// 直接打开本页时创建用户等 JMAP 功能可用（CORS 已开），但 Chromium 拦截 file:// 构建产物的 module script。页面 hint 已说明：在 `minimal-web/` 下起静态服务（如 `python3 -m http.server`）或将消息中心地址指向 vite dev 服务器即可。
- **凭证安全**：管理员密码与测试用户密码明文存 localStorage、iframe URL 明文带密码——这是测试/demo 场景的既定设计（计划文档即如此要求），请勿将本页面对准生产服务器。
- 联调在服务器上真实创建了 demo001~demo100 共 100 个账号（验收所需），未删除；探测用的 probe* 账号已清理。
