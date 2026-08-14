import { reactive, readonly } from 'vue'

// 当前登录用户状态。宿主通过 URL 参数传入凭证后写入这里。
// 使用 Vue reactive（而非 Pinia）保持骨架最小，见 first-plan.md 目录结构约定。
export interface UserState {
  username: string
  password: string
  loggedIn: boolean
}

const state = reactive<UserState>({
  username: '',
  password: '',
  loggedIn: false,
})

export function useUserStore() {
  function setCredentials(username: string, password: string) {
    state.username = username
    state.password = password
    state.loggedIn = true
  }

  function clear() {
    state.username = ''
    state.password = ''
    state.loggedIn = false
  }

  return { state: readonly(state), setCredentials, clear }
}
