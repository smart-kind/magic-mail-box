// TEST tests/user-store.test.ts — 验证全局用户状态 store 的写入与清除
// SCOPE: src/stores/user.ts（useUserStore: setCredentials / clear / 只读状态）
// ENV: 纯内存 reactive 状态，无 DOM、无网络；模块级单例，用例间需自行清理
// GATES: 通过则证明凭证写入后 loggedIn 为 true 且字段可读，clear 后回到未登录态，
//        且外部无法通过返回值直接改状态（readonly）
// RISK: store 尚未接入 JMAP 认证，loggedIn 仅代表「凭证已写入」而非「认证成功」；
//        若未来把真实认证结果混入此标志，本测试无法发现。
import { describe, it, expect } from 'vitest'
import { useUserStore } from '../src/stores/user'

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
})
