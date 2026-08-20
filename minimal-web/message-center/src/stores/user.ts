import { reactive, readonly } from 'vue'
import { derivePassword } from '../utils/derivePassword'
import { createJmapClient, basicAuthHeader } from '../api/jmap'

// 当前登录用户状态。URL 只传用户名（无邮箱概念），密码由用户名自动派生。
// 用户在邮件系统中不存在时自动创建（需要 localStorage 中有管理员凭证）。

export interface UserState {
  username: string
  password: string
  loggedIn: boolean
}

const SS_KEYS = {
  username: 'mc.username',
  password: 'mc.password',
  server: 'mc.server',
} as const

// localStorage 键（host-demo 写入，message-center 读取）
// SECURITY: adminPass 为管理员明文口令，由 host-demo 写入 localStorage（AUDIT-09），仅限本机演示；
// 对外应改用 JMAP session token 或服务端会话，不应在浏览器持久化管理员凭证。
const LS_KEYS = {
  adminUser: 'mc.adminUser',
  adminPass: 'mc.adminPass',
  domain: 'mc.domain',
  server: 'mc.server',
} as const

const state = reactive<UserState>({
  username: '',
  password: '',
  loggedIn: false,
})

// 模块加载时从 sessionStorage 恢复（站内跳转场景）。
try {
  const username = sessionStorage.getItem(SS_KEYS.username) ?? ''
  const password = sessionStorage.getItem(SS_KEYS.password) ?? ''
  if (username && password) {
    state.username = username
    state.password = password
    state.loggedIn = true
  }
} catch (e) {
  // sessionStorage 不可用时按未登录处理。
  console.warn('从 sessionStorage 恢复登录态失败:', e)
}

export function useUserStore() {
  function setCredentials(username: string, password: string) {
    state.username = username
    state.password = password
    state.loggedIn = true
    try {
      sessionStorage.setItem(SS_KEYS.username, username)
      // SECURITY: 本地演示凭证明文存 storage（AUDIT-09），仅限本机；对外应改用 JMAP session token 或服务端会话
      sessionStorage.setItem(SS_KEYS.password, password)
    } catch (e) {
      // 持久化失败时内存态仍可用，仅记录。
      console.warn('写入 sessionStorage(凭证) 失败:', e)
    }
  }

  function clear() {
    state.username = ''
    state.password = ''
    state.loggedIn = false
    try {
      sessionStorage.removeItem(SS_KEYS.username)
      sessionStorage.removeItem(SS_KEYS.password)
    } catch (e) {
      // 同上，仅记录。
      console.warn('清除 sessionStorage(凭证) 失败:', e)
    }
  }

  return { state: readonly(state), setCredentials, clear }
}

/** 记住 server 到 sessionStorage。 */
export function persistServer(server: string) {
  if (!server) return
  try {
    sessionStorage.setItem(SS_KEYS.server, server)
  } catch (e) {
    console.warn('写入 sessionStorage(server) 失败:', e)
  }
}

/** 读取 sessionStorage 中的 server。 */
export function persistedServer(): string {
  try {
    return sessionStorage.getItem(SS_KEYS.server) ?? ''
  } catch (e) {
    console.warn('读取 sessionStorage(server) 失败:', e)
    return ''
  }
}

/** 获取邮件域名（优先 localStorage，回退默认值）。 */
export function getMailDomain(): string {
  try {
    return localStorage.getItem(LS_KEYS.domain) || 'local.test'
  } catch (e) {
    console.warn('读取 localStorage(domain) 失败:', e)
    return 'local.test'
  }
}

/** 获取服务器地址（优先 localStorage，回退默认值）。 */
export function getServerUrl(): string {
  try {
    return localStorage.getItem(LS_KEYS.server) || 'http://localhost:8082'
  } catch (e) {
    console.warn('读取 localStorage(server) 失败:', e)
    return 'http://localhost:8082'
  }
}

// ── 自动创建用户 ──

/**
 * JMAP 方法调用三元组：[methodName, arguments, clientTag]。
 * AUDIT-20: 替换原先的 any[]，提供精确的元组类型约束。
 */
type JmapMethodCall = [string, Record<string, unknown>, string]

async function jmapAdminCall(server: string, adminUser: string, adminPass: string, methodCalls: JmapMethodCall[]) {
  // AUDIT-31: 用 basicAuthHeader（内部 toBase64 支持 Unicode）替代 btoa，避免中文/emoji 凭证编码失败。
  const auth = basicAuthHeader(adminUser, adminPass)
  const res = await fetch(server.replace(/\/+$/, '') + '/jmap/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({
      using: ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'],
      methodCalls,
    }),
  })
  if (!res.ok) throw new Error('Admin JMAP HTTP ' + res.status)
  return (await res.json()).methodResponses
}

async function fetchDefaultDomain(server: string, adminUser: string, adminPass: string): Promise<{ id: string; name: string }> {
  const [qr] = await jmapAdminCall(server, adminUser, adminPass, [
    ['x:Domain/query', { filter: {} }, 'c1'],
  ])
  if (qr[0] !== 'x:Domain/query' || !qr[1].ids?.length)
    throw new Error('未查询到域名')
  const [gr] = await jmapAdminCall(server, adminUser, adminPass, [
    ['x:Domain/get', { ids: qr[1].ids }, 'c2'],
  ])
  const d = gr[1]?.list?.[0]
  if (!d) throw new Error('无法获取域名详情')
  return { id: d.id, name: d.name }
}

async function autoCreateUser(server: string, username: string, password: string, adminUser: string, adminPass: string): Promise<void> {
  // SECURITY: demo-only — 调用方传入的 password 通常由 derivePassword(username) 派生，
  // 即新用户口令可由用户名公开推导，等同于无密码保护。仅限本地联调演示，
  // 严禁用于对外环境。见 derivePassword.ts 顶部警示与审计报告 AUDIT-03。
  if (!adminUser || !adminPass) {
    throw new Error('未配置管理员凭证，无法自动创建用户。请在「环境配置」中填写管理员账号密码。')
  }

  const domain = await fetchDefaultDomain(server, adminUser, adminPass)
  // 缓存域名
  try { localStorage.setItem(LS_KEYS.domain, domain.name) } catch (e) { console.warn('缓存域名到 localStorage 失败:', e) }

  const [setResp] = await jmapAdminCall(server, adminUser, adminPass, [
    ['x:Account/set', {
      create: {
        [username]: {
          '@type': 'User',
          name: username,
          domainId: domain.id,
          credentials: { 0: { '@type': 'Password', secret: password } },
          roles: { '@type': 'User' },
          permissions: { '@type': 'Inherit' },
          quotas: {},
          memberGroupIds: {},
          aliases: {},
          encryptionAtRest: { '@type': 'Disabled' },
        },
      },
    }, 'c3'],
  ])

  // 检查业务级创建结果
  const notCreated = (setResp[1]?.notCreated) || {}
  const failure = notCreated[username]
  if (failure) {
    if (failure.type === 'primaryKeyViolation') {
      // 用户已存在，视为正常，让调用方重试登录
      return
    }
    throw new Error(`自动创建用户失败：${failure.description || failure.type}`)
  }
}

export interface LoginOptions {
  adminUser?: string
  adminPass?: string
  domain?: string
}

/**
 * 用用户名登录：派生密码 → 尝试认证 → 失败则自动创建 → 重试。
 * URL 只需传 user 参数即可完成全部登录流程。
 */
export async function loginWithUsername(username: string, server: string, opts: LoginOptions = {}): Promise<void> {
  const password = derivePassword(username)
  const client = createJmapClient({ baseUrl: server, username, password })

  try {
    await client.getSession()
  } catch (err) {
    // 认证失败（用户不存在），尝试自动创建
    if ((err as any).status === 401 || String((err as any).message).includes('401')) {
      await autoCreateUser(server, username, password, opts.adminUser || '', opts.adminPass || '')
      // 重新创建 client 并登录（session 缓存已清除）
      const retryClient = createJmapClient({ baseUrl: server, username, password })
      await retryClient.getSession()
    } else {
      throw err
    }
  }

  // 缓存域名
  if (opts.domain) {
    try { localStorage.setItem(LS_KEYS.domain, opts.domain) } catch (e) { console.warn('缓存域名到 localStorage 失败:', e) }
  }

  // 登录成功，写入 store
  const store = useUserStore()
  store.setCredentials(username, password)
}
