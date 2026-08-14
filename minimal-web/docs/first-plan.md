# Minimal Web — 计划文档

## 项目目标

构建一个极简的演示系统，展示 Stalwart Mail Server 作为**消息中心**的使用方式。整个系统对外看不出是邮件系统，而是一个普通的消息/通知平台。

核心验证点：
- 通过 JMAP API 与 Stalwart 对接（不经过 IMAP/SMTP）
- 账户可批量创建（API 自动化，无需手动操作管理界面）
- 消息可收发、可展示详情、可删除
- 消息内容支持结构化 JSON，前端可按需渲染为自定义 UI
- 多用户并发测试：打开多个浏览器标签页，每个标签页切换不同用户，模拟多人通信

---

## 参考项目

| 项目 | 路径 | 参考内容 |
|---|---|---|
| Bulwark Webmail | `../bulwark-webmail/` | JMAP 客户端实现方式、认证流程、API 调用模式 |

**不直接引用或复制 Bulwark 的代码**，仅参考其 JMAP 交互模式。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 消息中心前端 | Vue 3 + TypeScript + Vite |
| 宿主 Demo | 纯 HTML + JS（无需框架，单文件即可） |
| 后端 | 无（纯前端直连 Stalwart JMAP API） |
| 样式 | 简洁实用，不引入重型 UI 库 |

---

## 目录结构

```
minimal-web/
├── docs/
│   └── plan.md                    # 本文档
├── host-demo/
│   └── index.html                 # 宿主管理程序（单文件，含内联 JS/CSS）
└── message-center/
    ├── src/
    │   ├── main.ts                # Vue 入口
    │   ├── App.vue                # 根组件
    │   ├── api/
    │   │   └── jmap.ts            # JMAP 客户端封装
    │   ├── stores/
    │   │   └── user.ts            # 当前用户状态（Pinia 或 reactive）
    │   ├── views/
    │   │   ├── Login.vue          # 登录页（自动登录，由宿主传参）
    │   │   ├── Inbox.vue          # 消息列表（收件箱）
    │   │   ├── MessageDetail.vue  # 消息详情
    │   │   └── Compose.vue        # 发消息（选收件人、写主题、写内容）
    │   └── router/
    │       └── index.ts           # 路由
    ├── index.html
    ├── vite.config.ts
    ├── tsconfig.json
    └── package.json
```

---

## 架构说明

### 1. 宿主 Demo（`host-demo/index.html`）

这是一个模拟的"管理系统"，单 HTML 文件，无需构建。功能：

- **用户选择器**：下拉框，列出已创建的所有测试用户（如 demo001 ~ demo100），选择后当前标签页以此用户身份操作
- **创建测试用户按钮**：点击后调用 Stalwart JMAP API 批量创建 100 个用户
  - 用户名格式：`demo001` ~ `demo100`
  - 邮箱：`demo001@local.test` ~ `demo100@local.test`
  - 密码格式：统一规则生成（如 `Demo@001` ~ `Demo@100`）
- **消息中心按钮**：点击后在 iframe 中加载消息中心，URL 带上当前选中用户的凭证参数
- **多标签页测试**：打开多个浏览器标签页，各自选择不同用户，即可模拟多人互发消息

### 2. 消息中心（`message-center/`）

Vue 3 SPA，通过 iframe 被宿主嵌入。核心页面：

#### 登录
- 不需要用户手动登录，由宿主通过 URL 参数传入用户名和密码（或 token）
- 启动时自动用 JMAP basic auth 认证

#### 消息列表（Inbox）
- 展示当前用户收到的所有消息
- 每条消息显示：发送者、主题、时间、未读标记
- 点击打开详情
- 支持删除

#### 消息详情（MessageDetail）
- 显示完整内容
- 如果内容是 JSON 格式，解析后渲染为结构化卡片/UI 元素（而不是显示原始文本）
- 支持删除

#### 发消息（Compose）
- 选择收件人（从用户列表中搜索/选择，支持多选）
- 填写主题
- 填写内容（纯文本或 JSON）
- 发送

### 3. JMAP 客户端（`api/jmap.ts`）

封装与 Stalwart 的 JMAP 交互：

- 认证：HTTP Basic Auth（用户名 + 密码）
- 核心操作：
  - 查询邮箱（Email/query）
  - 获取邮件详情（Email/get）
  - 发送邮件（Email/set）
  - 删除邮件（Email/set + destroy）
- 参考 `bulwark-webmail/lib/` 下的 JMAP 客户端实现

---

## 测试场景构造

### 用户批量创建

宿主 Demo 点击"创建测试用户"后：

1. 调用 Stalwart JMAP API（Account/set）创建 100 个用户
2. 用户名：`demo001` ~ `demo100`
3. 邮箱：`demo001@local.test` ~ `demo100@local.test`
4. 密码：`Demo001!` ~ `Demo100!`（固定格式）
5. 创建成功后，用户选择器自动加载这些用户

### 多用户通信测试

1. 浏览器标签页 A：选择用户 `demo001`
2. 浏览器标签页 B：选择用户 `demo002`
3. 在 A 中给 demo002 发消息
4. 在 B 中刷新，看到新消息
5. 回复、删除等操作同理

---

## 实现顺序

1. **搭建 message-center 项目骨架** — Vue 3 + Vite + TypeScript，路由配置
2. **实现 JMAP 客户端** — 认证、查询、发送、删除
3. **实现消息列表页** — 展示收件箱
4. **实现消息详情页** — 展示详情，JSON 内容渲染
5. **实现发消息页** — 选用户、写主题、写内容、发送
6. **实现宿主 Demo** — 用户选择器、批量创建、iframe 嵌入
7. **联调测试** — 多标签页多用户通信

---

## 待确认事项

- 消息中心是否需要处理日历/联系人等功能？（计划中仅做消息）
- JSON 结构化消息的渲染规则是什么？（先做最简单的 JSON → 卡片展示）
- 宿主 Demo 是否需要持久化用户列表？（计划中每次创建测试用户后存 localStorage）
