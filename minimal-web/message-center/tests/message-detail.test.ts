// AUDIT-19: 本文件 mock 掉真实 JMAP client 以隔离视图逻辑；真实 Basic Auth/凭证流由 jmap.test.ts 覆盖
// TEST tests/message-detail.test.ts — 验证消息详情页的加载、渲染、JSON 卡片与删除
// SCOPE: src/views/MessageDetail.vue（URL/store 凭证接入；getEmails([id]) 加载并渲染
//        发送者/收件人/时间/主题/正文；JSON 正文渲染为结构化键值对卡片而非原始字符串；
//        纯文本正文原样展示；删除二次确认后 deleteEmails([id]) 并返回 /inbox；
//        id 缺失、邮件不存在、加载失败的友好错误；JsonCard 递归渲染嵌套/数组/空值）
// ENV: jsdom（vitest）+ 内存路由；无网络——vi.mock('../src/api/jmap') 用内存假 client
//      （getEmails/deleteEmails 为 vi.fn），createJmapClient 参数被记录以验证凭证传递；
//      每个用例前清空 user store（模块级单例）。
// GATES: 通过则证明——无凭证时显示提示且不发起请求；凭证来自 URL query 或 user store；
//        详情各字段正确渲染；JSON 正文以卡片键值对呈现且页面不含原始 JSON 串；
//        删除必须先点一次进入确认态再确认才真正调用 API，成功后路由到 /inbox 并
//        携带 server 参数；notFound/空列表/HTTP 错误均显示友好错误与重试入口。
// RISK: jmap 模块被整体 mock，视图与真实 JMAP 协议的集成不在本测试覆盖范围
//       （协议层由 tests/jmap.test.ts 保证）；卡片断言依赖 class 名（json-card/
//       json-key），重命名样式会误报；「不含原始 JSON 串」用整串断言，若模板把
//       正文拆成多段渲染仍可能漏检。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import MessageDetail from '../src/views/MessageDetail.vue'
import { createJmapClient, JmapError, type EmailDetail } from '../src/api/jmap'
import { useUserStore } from '../src/stores/user'

const mocks = vi.hoisted(() => ({
  getEmails: vi.fn<(ids: string[]) => Promise<EmailDetail[]>>(),
  deleteEmails: vi.fn<(ids: string[]) => Promise<void>>(),
}))

vi.mock('../src/api/jmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/jmap')>()
  return {
    ...actual,
    createJmapClient: vi.fn(() => ({
      getEmails: mocks.getEmails,
      deleteEmails: mocks.deleteEmails,
      // AUDIT-16: MessageDetail 现走 loginWithUsername（同 Inbox），需要 getSession。
      getSession: vi.fn().mockResolvedValue({}),
    })),
  }
})

const TEXT_MAIL: EmailDetail = {
  id: 'm1',
  subject: '会议纪要',
  from: [{ name: 'Alice', email: 'alice@local.test' }],
  to: [{ email: 'demo001@local.test' }],
  receivedAt: '2026-08-14T01:00:00Z',
  preview: '',
  keywords: {},
  text: '明天上午十点开会，请准时参加。',
}

const JSON_MAIL: EmailDetail = {
  ...TEXT_MAIL,
  id: 'm2',
  subject: '系统通知',
  text: JSON.stringify({
    type: 'deploy',
    title: '版本发布',
    meta: { version: '1.2.0', success: true },
    hosts: ['web-1', 'web-2'],
    note: null,
  }),
}

async function mountDetail(path: string) {
  const testRouter = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/inbox', component: { template: '<div />' } },
      { path: '/message/:id', component: MessageDetail },
    ],
  })
  await testRouter.push(path)
  await testRouter.isReady()
  const wrapper = mount(MessageDetail, { global: { plugins: [testRouter] } })
  await flushPromises()
  return { wrapper, testRouter }
}

beforeEach(() => {
  vi.clearAllMocks()
  useUserStore().clear()
  sessionStorage.clear()
  mocks.getEmails.mockResolvedValue([TEXT_MAIL])
  mocks.deleteEmails.mockResolvedValue()
})

describe('MessageDetail view', () => {
  it('shows a hint and does not call the API when credentials are missing', async () => {
    const { wrapper } = await mountDetail('/message/m1')
    expect(wrapper.text()).toContain('未提供用户凭证')
    expect(createJmapClient).not.toHaveBeenCalled()
  })

  it('loads the message by route id and renders all fields', async () => {
    const { wrapper } = await mountDetail(
      '/message/m1?user=demo001&pass=Demo001!&server=http://mail.test:8082',
    )

    // AUDIT-16: MessageDetail 不再从 URL 读 pass，改走 loginWithUsername（同 Inbox），
    // 密码由 derivePassword('demo001') 派生为 'Demo001!Mc7'。
    expect(createJmapClient).toHaveBeenCalledWith({
      baseUrl: 'http://mail.test:8082',
      username: 'demo001',
      password: 'Demo001!Mc7',
    })
    expect(mocks.getEmails).toHaveBeenCalledWith(['m1'])

    const text = wrapper.text()
    expect(text).toContain('会议纪要')
    expect(text).toContain('Alice')
    expect(text).toContain('demo001')
    expect(text).toContain('2026')
    expect(text).toContain('明天上午十点开会')
  })

  it('renders plain text body as-is without a JSON card', async () => {
    const { wrapper } = await mountDetail('/message/m1?user=demo001&pass=Demo001!')
    expect(wrapper.find('.body-text').text()).toBe('明天上午十点开会，请准时参加。')
    expect(wrapper.find('.json-card').exists()).toBe(false)
  })

  it('renders a JSON body as structured cards, not the raw string', async () => {
    mocks.getEmails.mockResolvedValue([JSON_MAIL])
    const { wrapper } = await mountDetail('/message/m2?user=demo001&pass=Demo001!')

    const card = wrapper.find('.json-card')
    expect(card.exists()).toBe(true)

    // 顶层键与嵌套对象的键都被渲染（递归）。
    const keys = wrapper.findAll('.json-key').map((k) => k.text())
    expect(keys).toEqual(['type', 'title', 'meta', 'version', 'success', 'hosts', 'note'])

    const text = wrapper.text()
    expect(text).toContain('deploy')
    expect(text).toContain('版本发布')
    expect(text).toContain('1.2.0')
    expect(text).toContain('true')
    expect(text).toContain('web-1')
    expect(text).toContain('web-2')
    expect(text).toContain('null')
    // 嵌套对象也被渲染为卡片（递归）。
    expect(wrapper.findAll('.json-card').length).toBeGreaterThanOrEqual(2)
    // 原始 JSON 字符串不应出现在页面上。
    expect(text).not.toContain(JSON_MAIL.text)
    expect(wrapper.find('.body-text').exists()).toBe(false)
  })

  it('requires a second confirmation before deleting, then returns to inbox', async () => {
    const { wrapper, testRouter } = await mountDetail(
      '/message/m1?user=demo001&pass=Demo001!&server=http://mail.test:8082',
    )

    // 第一次点击只进入确认态，不调用 API。
    await wrapper.find('.action-delete').trigger('click')
    expect(mocks.deleteEmails).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('确认删除这条消息')

    await wrapper.find('.action-delete.confirm').trigger('click')
    await flushPromises()

    expect(mocks.deleteEmails).toHaveBeenCalledWith(['m1'])
    expect(testRouter.currentRoute.value.path).toBe('/inbox')
    expect(testRouter.currentRoute.value.query.server).toBe('http://mail.test:8082')
  })

  it('cancels deletion without calling the API', async () => {
    const { wrapper } = await mountDetail('/message/m1?user=demo001&pass=Demo001!')
    await wrapper.find('.action-delete').trigger('click')
    await wrapper.find('.action-cancel').trigger('click')
    expect(mocks.deleteEmails).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('确认删除这条消息')
  })

  it('stays on the page and shows the error when deletion fails', async () => {
    mocks.deleteEmails.mockRejectedValue(new JmapError('删除邮件 m1 失败（forbidden）: 无权限'))
    const { wrapper, testRouter } = await mountDetail('/message/m1?user=demo001&pass=Demo001!')
    await wrapper.find('.action-delete').trigger('click')
    await wrapper.find('.action-delete.confirm').trigger('click')
    await flushPromises()
    expect(testRouter.currentRoute.value.path).toBe('/message/m1')
    expect(wrapper.find('[role="alert"]').text()).toContain('无权限')
  })

  it('shows a friendly error when the message does not exist', async () => {
    mocks.getEmails.mockRejectedValue(new JmapError('邮件不存在或无权访问：m404'))
    const { wrapper } = await mountDetail('/message/m404?user=demo001&pass=Demo001!')
    expect(wrapper.find('[role="alert"]').text()).toContain('邮件不存在或无权访问')
    expect(wrapper.find('[role="alert"]').text()).toContain('重试')
  })

  it('shows a friendly error when the server fails', async () => {
    mocks.getEmails.mockRejectedValue(new JmapError('JMAP API 请求失败：HTTP 500', 500))
    const { wrapper } = await mountDetail('/message/m1?user=demo001&pass=Demo001!')
    expect(wrapper.find('[role="alert"]').text()).toContain('HTTP 500')
  })

  it('shows a friendly error when the response list is empty', async () => {
    mocks.getEmails.mockResolvedValue([])
    const { wrapper } = await mountDetail('/message/m1?user=demo001&pass=Demo001!')
    expect(wrapper.find('[role="alert"]').text()).toContain('没有找到这条消息')
  })

  it('navigates back to the inbox via the back button', async () => {
    const { wrapper, testRouter } = await mountDetail('/message/m1?user=demo001&pass=Demo001!')
    await wrapper.find('.nav-back').trigger('click')
    await flushPromises()
    expect(testRouter.currentRoute.value.path).toBe('/inbox')
  })

  it('reuses store credentials when the URL has no user/pass', async () => {
    useUserStore().setCredentials('demo007', 'Demo007!')
    await mountDetail('/message/m1')
    expect(createJmapClient).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:8082',
      username: 'demo007',
      password: 'Demo007!',
    })
  })
})
