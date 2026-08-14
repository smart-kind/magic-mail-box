// TEST tests/router.test.ts — 验证消息中心路由表与应用壳渲染
// SCOPE: src/router/index.ts 路由定义；App.vue 标题与导航；各占位视图经路由渲染
// ENV: jsdom（vitest），内存路由（createMemoryHistory），无网络、无后端依赖
// GATES: 通过则证明 /login /inbox /message/:id /compose 四条路由存在且能渲染对应视图，
//        首页 / 重定向到 /inbox，App 壳显示「消息中心」标题
// RISK: 视图只是占位文本，测试只断言占位内容存在；若未来视图实现错误但保留占位文本，
//        测试仍会通过。路由表被复制进测试而非从 src 导入时会失真——本测试直接导入
//        src/router 的 routes，避免该问题。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../src/App.vue'
import { router } from '../src/router'

// 从生产路由实例取路由表，避免在测试里复制一份路由定义。
const routes = router.getRoutes()

async function mountAt(path: string) {
  const testRouter = createRouter({ history: createMemoryHistory(), routes: router.options.routes })
  await testRouter.push(path)
  await testRouter.isReady()
  return mount(App, { global: { plugins: [testRouter] } })
}

describe('router', () => {
  it('defines the four required routes', () => {
    const byName = new Map(routes.map((r) => [r.name, r.path]))
    expect(byName.get('login')).toBe('/login')
    expect(byName.get('inbox')).toBe('/inbox')
    expect(byName.get('message-detail')).toBe('/message/:id')
    expect(byName.get('compose')).toBe('/compose')
  })

  it('redirects / to /inbox', async () => {
    const testRouter = createRouter({ history: createMemoryHistory(), routes: router.options.routes })
    await testRouter.push('/')
    expect(testRouter.currentRoute.value.path).toBe('/inbox')
  })

  it('renders the app shell and each placeholder view at its route', async () => {
    const cases: Array<[string, string]> = [
      ['/login', '登录'],
      ['/inbox', '收件箱'],
      ['/compose', '发消息'],
      ['/message/msg-123', 'msg-123'],
    ]
    for (const [path, expected] of cases) {
      const wrapper = await mountAt(path)
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('消息中心')
      expect(wrapper.text()).toContain(expected)
      wrapper.unmount()
    }
  })
})
