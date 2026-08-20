// AUDIT-19: 本文件 mock 掉真实 JMAP client 以隔离视图逻辑；真实 Basic Auth/凭证流由 jmap.test.ts 覆盖
// TEST tests/host-demo.test.ts — 验证宿主 Demo 单文件应用的真实行为
// SCOPE: ../host-demo/index.html 内联脚本 —— 配置加载/持久化、批量创建用户的
//        JMAP 请求构造（x:Domain/query → x:Domain/get → x:Account/set）、幂等跳过、
//        失败处理、用户列表渲染、消息中心面板 iframe URL 凭证传参契约
// ENV: jsdom（vitest）。从磁盘读取真实的 host-demo/index.html，把 <body> 注入
//      jsdom，再用 new Function 执行页面内联脚本（避免重复 eval 的 const 重声明）。
//      fetch 被 mock 成假 JMAP 服务器并记录请求体；无真实网络。
// GATES: 通过则证明：1) 点击「创建测试用户」发出的 Account/set 请求形状与
//        Stalwart 管理 API 契约一致（100 个 User、credentials 数字键 map、
//        domainId 来自 Domain/get）；2) 创建成功后用户列表渲染 demo001~demo100
//        且写入 localStorage；3) primaryKeyViolation 视为幂等跳过而非失败，
//        其他错误不写入用户列表；4) 「打开消息中心」把选中用户的
//        user/server 以 URL 参数写进 iframe.src（与 message-center
//        Inbox.vue 的 route.query 自动登录契约一致）；5) 刷新（重新执行脚本）后
//        无需网络即可恢复配置与用户列表。
// RISK: mock 的 JMAP 响应是按 Stalwart v1.0.0 真实响应形状手工构造的，
//        若 Stalwart 升级改变响应形状测试不会发现——该风险由手工 curl/浏览器
//        联调覆盖（见任务报告）。测试不验证 CSS 与视觉呈现。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// vitest 以 message-center 为 root 运行，host-demo 是其兄弟目录。
const html = readFileSync(join(process.cwd(), '..', 'host-demo', 'index.html'), 'utf8')
const bodyHtml = html.match(/<body>([\s\S]*?)<script>/)![1]
const scriptSrc = html.match(/<script>([\s\S]*?)<\/script>/)![1]

/** 把页面 body 注入 jsdom 并执行其内联脚本（等价于浏览器打开该文件）。 */
function loadPage() {
  document.body.innerHTML = bodyHtml
  new Function(scriptSrc)()
}

interface JmapCall {
  method: string
  args: Record<string, unknown>
  authorization: string | null
}

/** 假 JMAP 服务器：按方法名路由到响应，记录所有调用。 */
function mockJmapServer(handlers: Record<string, (args: never) => unknown>) {
  const calls: JmapCall[] = []
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    for (const [method, args] of body.methodCalls) {
      calls.push({
        method,
        args,
        authorization: (init.headers as Record<string, string>).Authorization ?? null,
      })
    }
    const methodResponses = body.methodCalls.map(([method, args, tag]: [string, never, string]) => {
      const handler = handlers[method]
      if (!handler) return ['error', { type: 'unknownMethod', description: method }, tag]
      return [method, handler(args), tag]
    })
    return { ok: true, json: async () => ({ methodResponses, sessionState: 's' }) } as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

/** 标准「成功」处理器：单域名 local.test（id b），全部创建成功。 */
function okHandlers() {
  return {
    'x:Domain/query': () => ({ ids: ['b'] }),
    'x:Domain/get': () => ({ list: [{ id: 'b', name: 'local.test' }] }),
    'x:Account/set': (args: { create: Record<string, unknown> }) => {
      const created: Record<string, { id: string }> = {}
      let i = 0
      for (const key of Object.keys(args.create)) created[key] = { id: 'id-' + i++ }
      return { created }
    },
  }
}

function $(id: string) {
  return document.getElementById(id) as HTMLInputElement & HTMLSelectElement
}

function statusText() {
  return $('status').textContent ?? ''
}

async function waitForStatus(substr: string) {
  await vi.waitFor(() => {
    expect(statusText()).toContain(substr)
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  document.body.innerHTML = ''
})

describe('host-demo 初始状态', () => {
  it('无 localStorage 时配置字段使用默认值', () => {
    loadPage()
    expect($('cfg-server').value).toBe('http://localhost:8082')
    expect($('cfg-mc-url').value).toBe('../message-center/dist/index.html')
  })
})

describe('批量创建测试用户', () => {
  it('按 Stalwart 管理 API 契约依次发出 query/get/set 三次调用', async () => {
    const { calls } = mockJmapServer(okHandlers())
    loadPage()
    $('cfg-admin-user').value = 'admin@local.test'
    $('cfg-admin-pass').value = 'secret'
    $('btn-create').click()
    await waitForStatus('新建 100 个')

    expect(calls.map((c) => c.method)).toEqual(['x:Domain/query', 'x:Domain/get', 'x:Account/set'])
    // 三次调用都带管理员 Basic Auth
    for (const c of calls) {
      expect(c.authorization).toBe('Basic ' + btoa('admin@local.test:secret'))
    }
    // Domain/get 使用 query 返回的 id
    expect(calls[1].args.ids).toEqual(['b'])
  })

  it('Account/set 请求体符合 Stalwart 契约：100 个 User、数字键 credentials、密码规则', async () => {
    const { calls } = mockJmapServer(okHandlers())
    loadPage()
    $('cfg-admin-pass').value = 'secret'
    $('btn-create').click()
    await waitForStatus('新建 100 个')

    const create = calls[2].args.create as Record<string, Record<string, unknown>>
    expect(Object.keys(create)).toHaveLength(100)
    expect(create.demo001).toEqual({
      '@type': 'User',
      name: 'demo001',
      domainId: 'b',
      credentials: { 0: { '@type': 'Password', secret: 'Demo001!Mc7' } },
      roles: { '@type': 'User' },
      permissions: { '@type': 'Inherit' },
      quotas: {},
      memberGroupIds: {},
      aliases: {},
      encryptionAtRest: { '@type': 'Disabled' },
    })
    expect((create.demo100.credentials as Record<string, { secret: string }>)[0].secret).toBe(
      'Demo100!Mc7',
    )
  })

  it('创建成功后用户列表渲染 demo001~demo100 并写入 localStorage', async () => {
    mockJmapServer(okHandlers())
    loadPage()
    $('cfg-admin-pass').value = 'secret'
    $('btn-create').click()
    await waitForStatus('完成')

    const items = document.querySelectorAll('.user-list-item')
    expect(items.length).toBe(100)
    expect(items[0].textContent).toBe('demo001')
    expect(items[99].textContent).toBe('demo100')
    const stored = JSON.parse(localStorage.getItem('hostDemo.users')!)
    expect(stored).toHaveLength(100)
    expect(stored[0]).toEqual({
      name: 'demo001',
      email: 'demo001@local.test',
      password: 'Demo001!Mc7',
    })
  })

  it('已存在的用户（primaryKeyViolation）视为幂等跳过，不算失败', async () => {
    const handlers = okHandlers()
    handlers['x:Account/set'] = (args: { create: Record<string, unknown> }) => {
      const notCreated: Record<string, unknown> = {}
      for (const key of Object.keys(args.create)) {
        notCreated[key] = { type: 'primaryKeyViolation', properties: ['email'] }
      }
      return { created: {}, notCreated }
    }
    mockJmapServer(handlers)
    loadPage()
    $('cfg-admin-pass').value = 'secret'
    $('btn-create').click()
    await waitForStatus('已存在跳过 100 个')

    expect(statusText()).not.toContain('部分用户创建失败')
    expect(JSON.parse(localStorage.getItem('hostDemo.users')!)).toHaveLength(100)
    expect(document.querySelectorAll('.user-list-item').length).toBe(100)
  })

  it('其他创建错误（如密码过弱）不写入用户列表并显示错误', async () => {
    const handlers = okHandlers()
    handlers['x:Account/set'] = (args: { create: Record<string, unknown> }) => {
      const notCreated: Record<string, unknown> = {}
      for (const key of Object.keys(args.create)) {
        notCreated[key] = { type: 'invalidProperties', description: 'Password is too weak.' }
      }
      return { created: {}, notCreated }
    }
    mockJmapServer(handlers)
    loadPage()
    $('cfg-admin-pass').value = 'secret'
    $('btn-create').click()
    await waitForStatus('部分用户创建失败')

    expect(statusText()).toContain('Password is too weak.')
    expect(localStorage.getItem('hostDemo.users')).toBeNull()
    expect(document.querySelectorAll('.user-list-item').length).toBe(0)
  })

  it('HTTP 层失败（如凭证错误）给出可读错误且不写入用户', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401 }) as Response),
    )
    loadPage()
    $('cfg-admin-pass').value = 'secret'
    $('btn-create').click()
    await waitForStatus('JMAP HTTP 401')
    expect(localStorage.getItem('hostDemo.users')).toBeNull()
  })
})

describe('消息中心 iframe 嵌入', () => {
  async function createUsers() {
    mockJmapServer(okHandlers())
    loadPage()
    $('cfg-admin-pass').value = 'secret'
    $('btn-create').click()
    await waitForStatus('完成')
  }

  it('iframe src 携带选中用户的 user/server URL 参数（自动登录契约）', async () => {
    await createUsers()
    // 打开弹窗并点击 quick-user 按钮。
    $('btn-open-mc').click()
    const quickBtns = document.querySelectorAll('.quick-user')
    expect(quickBtns.length).toBeGreaterThan(0)
    ;(quickBtns[1] as HTMLElement).click() // demo002

    const panels = document.querySelectorAll('.panel')
    expect(panels.length).toBe(1)
    const iframe = panels[0].querySelector('iframe')!
    expect(iframe.src).toContain('user=demo002')
    expect(iframe.src).toContain('server=' + encodeURIComponent('http://localhost:8082'))
    // URL 不应包含 pass 参数（密码由消息中心自动派生）。
    expect(iframe.src).not.toContain('pass=')
  })

  it('自定义消息中心地址与自定义 JMAP 服务器都被正确使用', async () => {
    await createUsers()
    $('cfg-mc-url').value = 'http://localhost:5173'
    $('cfg-server').value = 'http://mail.example.test:8082'
    // 用文本输入方式打开（demo100 不在 quick-users 列表中）。
    $('btn-open-mc').click()
    $('pick-username').value = 'demo100'
    $('btn-pick-open').click()

    const panels = document.querySelectorAll('.panel')
    expect(panels.length).toBe(1)
    const iframe = panels[0].querySelector('iframe')!
    expect(iframe.src).toContain('http://localhost:5173')
    expect(iframe.src).toContain('user=demo100')
    expect(iframe.src).toContain('server=' + encodeURIComponent('http://mail.example.test:8082'))
  })

  it('未创建用户时打开面板仍创建 iframe（用户由消息中心自动创建）', () => {
    loadPage()
    $('btn-open-mc').click()
    $('pick-username').value = ''
    $('btn-pick-open').click() // 空用户名 → alert 并返回
    // 没有面板被创建
    expect(document.querySelectorAll('.panel').length).toBe(0)
  })
})

describe('localStorage 持久化', () => {
  it('刷新后（重新执行脚本）无需网络即可恢复配置与用户列表', () => {
    const users = [
      { name: 'demo001', email: 'demo001@local.test', password: 'Demo001!Mc7' },
      { name: 'demo042', email: 'demo042@local.test', password: 'Demo0042!Mc7' },
    ]
    localStorage.setItem('hostDemo.users', JSON.stringify(users))
    localStorage.setItem('hostDemo.server', 'http://mail.custom.test:8082')
    localStorage.setItem('hostDemo.mcUrl', 'http://mc.custom.test/index.html')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    loadPage()
    // 配置字段从 localStorage 恢复。
    expect($('cfg-server').value).toBe('http://mail.custom.test:8082')
    expect($('cfg-mc-url').value).toBe('http://mc.custom.test/index.html')
    expect(fetchSpy).not.toHaveBeenCalled()

    // 打开配置弹窗查看用户列表。
    $('btn-config').click()
    const items = document.querySelectorAll('.user-list-item')
    expect(items.length).toBe(2)
    expect(items[0].textContent).toBe('demo001')
    expect(items[1].textContent).toBe('demo042')
  })

  it('hostDemo.users 损坏时回退到空列表而不崩溃', () => {
    localStorage.setItem('hostDemo.users', '{not json')
    loadPage()
    $('btn-config').click()
    expect(document.querySelectorAll('.user-list-item').length).toBe(0)
  })
})
