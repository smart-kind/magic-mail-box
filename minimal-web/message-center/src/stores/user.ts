import { reactive, readonly } from 'vue'

// 当前登录用户状态。宿主通过 URL 参数传入凭证后写入这里。
// 使用 Vue reactive（而非 Pinia）保持骨架最小，见 first-plan.md 目录结构约定。
export interface UserState {
  username: string
  password: string
  loggedIn: boolean
}

// 凭证同时写入 sessionStorage：站内跳转后 hash query 里的 user/pass 会丢失，
// 此时刷新页面需要从这里恢复。sessionStorage 按标签页隔离，正好匹配
// first-plan.md「多标签页各登录不同用户」的测试场景（localStorage 会串号）。
const SS_KEYS = {
  username: 'mc.username',
  password: 'mc.password',
  server: 'mc.server',
} as const

const state = reactive<UserState>({
  username: '',
  password: '',
  loggedIn: false,
})

// 模块加载时从 sessionStorage 恢复（刷新页面场景）。
try {
  const username = sessionStorage.getItem(SS_KEYS.username) ?? ''
  const password = sessionStorage.getItem(SS_KEYS.password) ?? ''
  if (username && password) {
    state.username = username
    state.password = password
    state.loggedIn = true
  }
} catch {
  // sessionStorage 不可用时按未登录处理。
}

export function useUserStore() {
  function setCredentials(username: string, password: string) {
    state.username = username
    state.password = password
    state.loggedIn = true
    try {
      sessionStorage.setItem(SS_KEYS.username, username)
      sessionStorage.setItem(SS_KEYS.password, password)
    } catch {
      // 忽略持久化失败，内存态仍可用。
    }
  }

  function clear() {
    state.username = ''
    state.password = ''
    state.loggedIn = false
    try {
      sessionStorage.removeItem(SS_KEYS.username)
      sessionStorage.removeItem(SS_KEYS.password)
    } catch {
      // 同上。
    }
  }

  return { state: readonly(state), setCredentials, clear }
}

/** 记住 URL query 里的 server 参数，站内跳转后刷新仍能连上非默认服务器。 */
export function persistServer(server: string) {
  if (!server) return
  try {
    sessionStorage.setItem(SS_KEYS.server, server)
  } catch {
    // 忽略。
  }
}

/** 读取已记住的 server；没有则返回空串（调用方回退到默认地址）。 */
export function persistedServer(): string {
  try {
    return sessionStorage.getItem(SS_KEYS.server) ?? ''
  } catch {
    return ''
  }
}
