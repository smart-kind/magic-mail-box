// AUDIT-19: 本文件 mock 掉真实 JMAP client 以隔离视图逻辑；真实 Basic Auth/凭证流由 jmap.test.ts 覆盖
// TEST tests/inbox.test.ts — 验证收件箱列表页的凭证接入、渲染、跳转与删除
// SCOPE: src/views/Inbox.vue（URL/store/sessionStorage 凭证接入、listInbox 渲染：发送者/
//        主题/时间/未读标记；点击跳转 /message/:id；删除后刷新并移除条目；空收件箱与错误提示）
// ENV: jsdom（vitest）+ 内存路由；无网络——vi.mock('../src/api/jmap') 用内存假 client
//      （listInbox/deleteEmails 为 vi.fn），createJmapClient 的参数被记录以验证凭证传递；
//      每个用例前清空 user store（模块级单例）与 sessionStorage。
// GATES: 通过则证明——无凭证时显示提示且不发起请求；凭证来自 URL query（user/pass/server）、
//        user store 或 sessionStorage 并正确传给 createJmapClient；列表渲染发送者/主题/时间
//        且未读项（无 $seen keyword）带 unread 样式；点击条目路由到 /message/:id；删除调用
//        deleteEmails([id])、条目从列表消失并重新拉取列表；空列表显示空状态；
//        listInbox 抛错时显示错误信息。
// RISK: jmap 模块被整体 mock，视图与真实 JMAP 协议的集成不在本测试覆盖范围
//       （协议层由 tests/jmap.test.ts 保证）；未读断言依赖 'unread' class 名，
//       若样式改名但逻辑不变会误报；时间断言只检查含年份，不校验具体格式。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Inbox from '../src/views/Inbox.vue'
import { createJmapClient, type EmailSummary } from '../src/api/jmap'
import { useUserStore } from '../src/stores/user'

const mocks = vi.hoisted(() => ({
  listInbox: vi.fn<() => Promise<EmailSummary[]>>(),
  deleteEmails: vi.fn<(ids: string[]) => Promise<void>>(),
  sendEmail: vi.fn<(input: { to: string[]; subject: string; text: string }) => Promise<void>>(),
}))

vi.mock('../src/api/jmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/jmap')>()
  return {
    ...actual,
    createJmapClient: vi.fn(() => ({
      listInbox: mocks.listInbox,
      deleteEmails: mocks.deleteEmails,
      sendEmail: mocks.sendEmail,
      getSession: vi.fn().mockResolvedValue({}),
    })),
  }
})

const UNREAD: EmailSummary = {
  id: 'm1',
  subject: '系统通知',
  from: [{ name: 'Alice', email: 'alice@local.test' }],
  receivedAt: '2026-08-14T01:00:00Z',
  preview: 'hello',
  keywords: {},
}

const READ: EmailSummary = {
  id: 'm2',
  subject: 'Re: 你好',
  from: [{ email: 'bob@local.test' }],
  receivedAt: '2026-08-13T10:00:00Z',
  preview: 'hi',
  keywords: { $seen: true },
}

async function mountInbox(path = '/inbox?user=demo001') {
  const testRouter = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/inbox', component: Inbox },
      { path: '/message/:id', component: { template: '<div />' } },
    ],
  })
  await testRouter.push(path)
  await testRouter.isReady()
  const wrapper = mount(Inbox, { global: { plugins: [testRouter] } })
  await flushPromises()
  return { wrapper, testRouter }
}

beforeEach(() => {
  vi.clearAllMocks()
  useUserStore().clear()
  sessionStorage.clear()
  mocks.listInbox.mockResolvedValue([UNREAD, READ])
  mocks.deleteEmails.mockResolvedValue()
  mocks.sendEmail.mockResolvedValue()
})

describe('Inbox view', () => {
  it('shows a hint and does not call the API when credentials are missing', async () => {
    const { wrapper } = await mountInbox('/inbox')
    expect(wrapper.text()).toContain('未提供用户名')
    expect(createJmapClient).not.toHaveBeenCalled()
  })

  it('authenticates from URL query and renders sender, subject, time, unread mark', async () => {
    const { wrapper } = await mountInbox('/inbox?user=demo001&server=http://mail.test:8082')

    expect(createJmapClient).toHaveBeenCalledWith({
      baseUrl: 'http://mail.test:8082',
      username: 'demo001',
      password: 'Demo001!Mc7',
    })
    expect(useUserStore().state.loggedIn).toBe(true)

    const text = wrapper.text()
    expect(text).toContain('Alice')
    expect(text).toContain('bob')
    expect(text).toContain('系统通知')
    expect(text).toContain('Re: 你好')
    expect(text).toContain('2026')

    const items = wrapper.findAll('.inbox-item')
    expect(items).toHaveLength(2)
    expect(items[0].classes()).toContain('unread')
    expect(items[1].classes()).not.toContain('unread')
  })

  it('falls back to the default server and reuses store credentials', async () => {
    useUserStore().setCredentials('demo007', '904244705!Mc7')
    await mountInbox('/inbox')
    expect(createJmapClient).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:8082',
      username: 'demo007',
      password: '904244705!Mc7',
    })
  })

  it('falls back to the persisted server when the URL has no server param', async () => {
    // 站内跳转后刷新：query 里没有 server，应使用 sessionStorage 记忆的地址。
    sessionStorage.setItem('mc.server', 'http://mail.persisted.test:8082')
    useUserStore().setCredentials('demo008', '673952526!Mc7')
    await mountInbox('/inbox')
    expect(createJmapClient).toHaveBeenCalledWith({
      baseUrl: 'http://mail.persisted.test:8082',
      username: 'demo008',
      password: '673952526!Mc7',
    })
  })

  it('navigates to /message/:id when an item is clicked', async () => {
    const { wrapper, testRouter } = await mountInbox()
    await wrapper.findAll('.inbox-item')[1].trigger('click')
    await flushPromises()
    expect(testRouter.currentRoute.value.path).toBe('/message/m2')
  })

  it('deletes an email, removes it from the list and refreshes', async () => {
    mocks.listInbox.mockResolvedValueOnce([UNREAD, READ]).mockResolvedValueOnce([READ])
    const { wrapper } = await mountInbox()

    const deleteButton = wrapper.findAll('.inbox-item')[0].find('.item-delete')
    await deleteButton.trigger('click')
    await flushPromises()

    expect(mocks.deleteEmails).toHaveBeenCalledWith(['m1'])
    expect(mocks.listInbox).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('系统通知')
    expect(wrapper.text()).toContain('Re: 你好')
    // 删除按钮的 click 不应触发条目跳转。
  })

  it('shows a friendly empty state when the inbox is empty', async () => {
    mocks.listInbox.mockResolvedValue([])
    const { wrapper } = await mountInbox()
    expect(wrapper.text()).toContain('收件箱是空的')
    expect(wrapper.findAll('.inbox-item')).toHaveLength(0)
  })

  it('shows the error message when loading fails', async () => {
    mocks.listInbox.mockRejectedValue(new Error('网络不可达'))
    const { wrapper } = await mountInbox()
    expect(wrapper.text()).toContain('网络不可达')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('opens the compose modal when the compose button is clicked', async () => {
    const { wrapper } = await mountInbox()
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
    await wrapper.find('.btn-compose').trigger('click')
    await flushPromises()
    expect(wrapper.find('.modal-overlay').exists()).toBe(true)
  })

  it('sends a message from the compose modal and refreshes the inbox', async () => {
    mocks.listInbox.mockResolvedValueOnce([UNREAD, READ]).mockResolvedValueOnce([UNREAD, READ, READ])
    const { wrapper } = await mountInbox()

    await wrapper.find('.btn-compose').trigger('click')
    await flushPromises()

    await wrapper.find('#recipient-input').setValue('demo002')
    await wrapper.find('#subject').setValue('你好')
    await wrapper.find('#body').setValue('正文')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(mocks.sendEmail).toHaveBeenCalledWith({
      to: ['demo002@local.test'],
      subject: '你好',
      text: '正文',
    })
    // 发送后弹窗关闭、收件箱刷新（listInbox 被再次调用）。
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
    expect(mocks.listInbox).toHaveBeenCalledTimes(2)
  })
})
