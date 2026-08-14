// TEST tests/user-store.test.ts — 验证全局用户状态 store 的写入、清除与会话持久化
// SCOPE: src/stores/user.ts（useUserStore: setCredentials / clear / 只读状态；
//        sessionStorage 持久化：写入后刷新可恢复、模块加载时水合；
//        persistServer/persistedServer 的 server 参数记忆）
// ENV: 内存 reactive 状态 + jsdom sessionStorage，无网络；模块级单例，用例间需自行清理
// GATES: 通过则证明凭证写入后 loggedIn 为 true 且字段可读，clear 后回到未登录态；
//        外部无法通过返回值直接改状态（readonly）；
//        setCredentials 同时写 sessionStorage、clear 同步清除，
//        模块重新加载（模拟页面刷新）时能从 sessionStorage 恢复登录态；
//        persistServer 记忆非空 server、persistedServer 在无记录时返回空串。
// RISK: store 尚未接入 JMAP 认证，loggedIn 仅代表「凭证已写入」而非「认证成功」；
//       水合用例通过 vi.resetModules 模拟刷新，与真实浏览器加载顺序可能有差异；
//       若未来把真实认证结果混入此标志，本测试无法发现。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { persistedServer, persistServer, useUserStore } from '../src/stores/user'

beforeEach(() => {
  useUserStore().clear()
  sessionStorage.clear()
})

describe('user store', () => {
  it('sets credentials and marks the user logged in', () => {
    const store = useUserStore()
    store.setCredentials('demo001', 'Demo001!')
    expect(store.state.username).toBe('demo001')
    expect(store.state.password).toBe('Demo001!')
    expect(store.state.loggedIn).toBe(true)
  })

  it('clears credentials back to logged-out state', () => {
    const store = useUserStore()
    store.setCredentials('demo002', 'Demo002!')
    store.clear()
    expect(store.state.username).toBe('')
    expect(store.state.password).toBe('')
    expect(store.state.loggedIn).toBe(false)
  })

  it('exposes readonly state to consumers', () => {
    const store = useUserStore()
    // readonly 代理在开发模式下会对直接赋值发出警告并保持原值
    expect(() => {
      // @ts-expect-error 故意违反类型以验证运行时只读行为
      store.state.username = 'hacker'
    }).not.toThrow()
    expect(store.state.username).not.toBe('hacker')
  })

  it('persists credentials to sessionStorage and clear removes them', () => {
    const store = useUserStore()
    store.setCredentials('demo005', 'Demo005!')
    expect(sessionStorage.getItem('mc.username')).toBe('demo005')
    expect(sessionStorage.getItem('mc.password')).toBe('Demo005!')
    store.clear()
    expect(sessionStorage.getItem('mc.username')).toBeNull()
    expect(sessionStorage.getItem('mc.password')).toBeNull()
  })

  it('hydrates credentials from sessionStorage on module load (page refresh)', async () => {
    sessionStorage.setItem('mc.username', 'demo009')
    sessionStorage.setItem('mc.password', 'Demo009!')
    vi.resetModules()
    const fresh = await import('../src/stores/user')
    const state = fresh.useUserStore().state
    expect(state.loggedIn).toBe(true)
    expect(state.username).toBe('demo009')
    expect(state.password).toBe('Demo009!')
  })

  it('remembers a non-empty server param and ignores empty ones', () => {
    expect(persistedServer()).toBe('')
    persistServer('')
    expect(persistedServer()).toBe('')
    persistServer('http://mail.example.test:8082')
    expect(persistedServer()).toBe('http://mail.example.test:8082')
  })
})
