// TEST tests/compose.test.ts — 验证发消息页的凭证接入、收件人输入、校验与发送
// SCOPE: src/views/Compose.vue（store 凭证接入；收件人用户名文本输入；
//        空收件人/空主题/空内容校验；JSON 模式合法性校验；发送成功
//        后反馈并清空表单；发送失败展示错误且保留表单内容）
// ENV: jsdom（vitest）+ 内存路由；无网络——vi.mock('../src/api/jmap') 用内存假
//      client（sendEmail 为 vi.fn），createJmapClient 参数被记录以验证凭证传递；
//      每个用例前清空 user store 与 localStorage。
// GATES: 通过则证明——未登录时显示提示且不创建 client；store 凭证正确传给
//        createJmapClient；收件人用逗号分隔的用户名输入并自动追加域名；
//        三项空值校验与 JSON 校验阻止发送并给出对应提示；纯文本/JSON 内容
//        分别以正确参数调用 sendEmail；成功后显示反馈且表单清空；失败后显示
//        错误且表单内容保留。
// RISK: jmap 模块被整体 mock，视图与真实 JMAP 协议的集成不在本测试覆盖范围
//       （协议层由 tests/jmap.test.ts 保证）；「JSON 内容发送后详情页可解析」
//       依赖视图层 parseStructuredBody 与详情页共用同一规则，若两侧规则各自
//       漂移会漏检（共用 src/utils/structuredBody.ts 降低该风险）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import Compose from '../src/views/Compose.vue'
import { createJmapClient, JmapError, type SendMessageInput } from '../src/api/jmap'
import { useUserStore } from '../src/stores/user'

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn<(input: SendMessageInput) => Promise<void>>(),
}))

vi.mock('../src/api/jmap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/jmap')>()
  return {
    ...actual,
    createJmapClient: vi.fn(() => ({
      sendEmail: mocks.sendEmail,
    })),
  }
})

/**
 * 挂载 Compose。测试需预先在 store 中设置登录状态（Compose 不再从 URL 读取凭证）。
 */
async function mountCompose(path = '/compose') {
  const testRouter = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/compose', component: Compose },
      { path: '/inbox', component: { template: '<div />' } },
    ],
  })
  await testRouter.push(path)
  await testRouter.isReady()
  const wrapper = mount(Compose, { global: { plugins: [testRouter] } })
  await flushPromises()
  return { wrapper, testRouter }
}

/** 填写收件人（逗号分隔用户名）、主题与内容。 */
async function fillForm(
  wrapper: Awaited<ReturnType<typeof mountCompose>>['wrapper'],
  options: { recipients: string[]; subject: string; body: string },
) {
  await wrapper.find('#recipient-input').setValue(options.recipients.join(', '))
  await wrapper.find('#subject').setValue(options.subject)
  await wrapper.find('#body').setValue(options.body)
}

async function submit(wrapper: Awaited<ReturnType<typeof mountCompose>>['wrapper']) {
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  useUserStore().clear()
  localStorage.clear()
  sessionStorage.clear()
  mocks.sendEmail.mockResolvedValue()
  // 大多数测试需要登录态。
  useUserStore().setCredentials('demo001', '3411949991!Mc7')
})

describe('Compose view', () => {
  it('shows a hint and does not create a client when not logged in', async () => {
    useUserStore().clear() // 清除 beforeEach 设置的登录态。
    const { wrapper } = await mountCompose('/compose')
    expect(wrapper.text()).toContain('未登录')
    expect(createJmapClient).not.toHaveBeenCalled()
  })

  it('uses store credentials and passes them to the client', async () => {
    useUserStore().setCredentials('demo003', '884195429!Mc7')
    sessionStorage.setItem('mc.server', 'http://mail.test:8082')
    const { wrapper } = await mountCompose()
    await fillForm(wrapper, { recipients: ['demo002'], subject: '你好', body: '正文' })
    await submit(wrapper)

    expect(createJmapClient).toHaveBeenCalledWith({
      baseUrl: 'http://mail.test:8082',
      username: 'demo003',
      password: '884195429!Mc7',
    })
    expect(useUserStore().state.loggedIn).toBe(true)
  })

  it('accepts comma-separated usernames as recipients', async () => {
    const { wrapper } = await mountCompose()
    await wrapper.find('#recipient-input').setValue('alice, bob, charlie')
    expect((wrapper.find('#recipient-input').element as HTMLInputElement).value).toBe(
      'alice, bob, charlie',
    )
  })

  it('validates empty recipients, subject and body before sending', async () => {
    const { wrapper } = await mountCompose()
    await submit(wrapper)

    expect(mocks.sendEmail).not.toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).toContain('请填写至少一个收件人')
    expect(text).toContain('请填写主题')
    expect(text).toContain('请填写内容')
    expect(wrapper.findAll('[role="alert"]').length).toBeGreaterThanOrEqual(3)
  })

  it('sends plain text to multiple recipients, gives feedback and clears the form', async () => {
    const { wrapper } = await mountCompose()
    await fillForm(wrapper, {
      recipients: ['demo002', 'demo007'],
      subject: '  会议通知  ',
      body: '明天上午十点开会。',
    })
    await submit(wrapper)

    expect(mocks.sendEmail).toHaveBeenCalledWith({
      to: ['demo002@local.test', 'demo007@local.test'],
      subject: '会议通知',
      text: '明天上午十点开会。',
    })
    expect(wrapper.find('[role="status"]').text()).toContain('已发送')
    expect(wrapper.find('[role="status"]').text()).toContain('demo002')
    // 表单已清空，可继续发送下一封。
    expect((wrapper.find('#recipient-input').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#subject').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#body').element as HTMLTextAreaElement).value).toBe('')
  })

  it('rejects invalid JSON content in JSON mode and does not send', async () => {
    const { wrapper } = await mountCompose()
    await wrapper.findAll('.mode-btn')[1].trigger('click')
    await fillForm(wrapper, { recipients: ['demo002'], subject: 'JSON 消息', body: '{oops' })
    await submit(wrapper)

    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('JSON 内容不合法')
  })

  it('rejects JSON scalars that the detail page would not render as a card', async () => {
    const { wrapper } = await mountCompose()
    await wrapper.findAll('.mode-btn')[1].trigger('click')
    await fillForm(wrapper, { recipients: ['demo002'], subject: 'JSON 消息', body: '42' })
    await submit(wrapper)

    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('JSON 内容不合法')
  })

  it('sends valid JSON content so the detail page can parse it as a card', async () => {
    const { wrapper } = await mountCompose()
    await wrapper.findAll('.mode-btn')[1].trigger('click')
    const json = '{\n  "type": "notice",\n  "level": "info"\n}'
    await fillForm(wrapper, { recipients: ['demo002'], subject: 'JSON 消息', body: json })
    await submit(wrapper)

    expect(mocks.sendEmail).toHaveBeenCalledWith({
      to: ['demo002@local.test'],
      subject: 'JSON 消息',
      text: json.trim(),
    })
    expect(wrapper.find('[role="status"]').text()).toContain('已发送')
  })

  it('shows the error and keeps the form content when sending fails', async () => {
    mocks.sendEmail.mockRejectedValue(new JmapError('发送失败（forbidden）: 无权发送'))
    const { wrapper } = await mountCompose()
    await fillForm(wrapper, { recipients: ['demo002'], subject: '主题', body: '正文' })
    await submit(wrapper)

    expect(wrapper.find('.compose-error').text()).toContain('无权发送')
    // 失败后表单内容保留，用户可以修正后重试。
    expect((wrapper.find('#recipient-input').element as HTMLInputElement).value).toBe('demo002')
    expect((wrapper.find('#subject').element as HTMLInputElement).value).toBe('主题')
    expect((wrapper.find('#body').element as HTMLTextAreaElement).value).toBe('正文')
  })

  it('navigates back to the inbox preserving the server param', async () => {
    const { wrapper, testRouter } = await mountCompose(
      '/compose?server=http://mail.test:8082',
    )
    await wrapper.find('.nav-back').trigger('click')
    await flushPromises()
    expect(testRouter.currentRoute.value.path).toBe('/inbox')
    expect(testRouter.currentRoute.value.query.server).toBe('http://mail.test:8082')
  })
})
