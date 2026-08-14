// TEST tests/compose.test.ts — 验证发消息页的凭证接入、收件人选择、校验与发送
// SCOPE: src/views/Compose.vue（URL/store 凭证接入；demo 用户候选的搜索/多选/
//        移除 chips；空收件人/空主题/空内容校验；JSON 模式合法性校验；发送成功
//        后反馈并清空表单；发送失败展示错误且保留表单内容）
// ENV: jsdom（vitest）+ 内存路由；无网络——vi.mock('../src/api/jmap') 用内存假
//      client（sendEmail 为 vi.fn），createJmapClient 参数被记录以验证凭证传递；
//      每个用例前清空 user store 与 localStorage（demo 用户列表回退默认
//      demo001~demo100）。
// GATES: 通过则证明——无凭证时显示提示且不创建 client；凭证来自 URL query 并
//        正确传给 createJmapClient；候选列表默认含 demo001~demo100，搜索可过滤；
//        点击候选加入已选 chips 且不可重复，chips 可移除；三项空值校验与 JSON
//        校验阻止发送并给出对应提示；纯文本/JSON 内容分别以正确参数调用
//        sendEmail；成功后显示反馈且表单清空；失败后显示错误且表单内容保留。
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

async function mountCompose(path = '/compose?user=demo001&pass=Demo001!') {
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

/** 填写主题与内容，并从候选列表中点选指定用户为收件人。 */
async function fillForm(
  wrapper: Awaited<ReturnType<typeof mountCompose>>['wrapper'],
  options: { recipients: string[]; subject: string; body: string },
) {
  for (const name of options.recipients) {
    await wrapper.find('#recipient-search').setValue(name)
    const candidate = wrapper
      .findAll('.candidate')
      .find((c) => c.find('.candidate-name').text() === name)
    expect(candidate, `候选列表应包含 ${name}`).toBeTruthy()
    await candidate!.trigger('click')
  }
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
  mocks.sendEmail.mockResolvedValue()
})

describe('Compose view', () => {
  it('shows a hint and does not create a client when credentials are missing', async () => {
    const { wrapper } = await mountCompose('/compose')
    expect(wrapper.text()).toContain('未提供用户凭证')
    expect(createJmapClient).not.toHaveBeenCalled()
  })

  it('authenticates from URL query and passes credentials to the client', async () => {
    const { wrapper } = await mountCompose(
      '/compose?user=demo003&pass=Demo003!&server=http://mail.test:8082',
    )
    await fillForm(wrapper, { recipients: ['demo002'], subject: '你好', body: '正文' })
    await submit(wrapper)

    expect(createJmapClient).toHaveBeenCalledWith({
      baseUrl: 'http://mail.test:8082',
      username: 'demo003',
      password: 'Demo003!',
    })
    expect(useUserStore().state.loggedIn).toBe(true)
  })

  it('lists default demo users and filters them by search keyword', async () => {
    const { wrapper } = await mountCompose()
    const names = wrapper.findAll('.candidate-name').map((c) => c.text())
    expect(names).toContain('demo001')

    await wrapper.find('#recipient-search').setValue('demo042')
    const filtered = wrapper.findAll('.candidate-name').map((c) => c.text())
    expect(filtered).toEqual(['demo042'])
  })

  it('adds recipients as chips, prevents duplicates and removes chips', async () => {
    const { wrapper } = await mountCompose()
    await fillForm(wrapper, { recipients: ['demo002'], subject: '', body: '' })
    expect(wrapper.findAll('.chip')).toHaveLength(1)

    // 已选中的用户不再出现在候选中，天然无法重复添加。
    await wrapper.find('#recipient-search').setValue('demo002')
    expect(wrapper.findAll('.candidate')).toHaveLength(0)
    expect(wrapper.text()).toContain('没有匹配的用户')

    await wrapper.find('.chip-remove').trigger('click')
    expect(wrapper.findAll('.chip')).toHaveLength(0)
  })

  it('validates empty recipients, subject and body before sending', async () => {
    const { wrapper } = await mountCompose()
    await submit(wrapper)

    expect(mocks.sendEmail).not.toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).toContain('请至少选择一个收件人')
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
    expect(wrapper.findAll('.chip')).toHaveLength(0)
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
    expect(wrapper.findAll('.chip')).toHaveLength(1)
    expect((wrapper.find('#subject').element as HTMLInputElement).value).toBe('主题')
    expect((wrapper.find('#body').element as HTMLTextAreaElement).value).toBe('正文')
  })

  it('navigates back to the inbox preserving the server param', async () => {
    const { wrapper, testRouter } = await mountCompose(
      '/compose?user=demo001&pass=Demo001!&server=http://mail.test:8082',
    )
    await wrapper.find('.nav-back').trigger('click')
    await flushPromises()
    expect(testRouter.currentRoute.value.path).toBe('/inbox')
    expect(testRouter.currentRoute.value.query.server).toBe('http://mail.test:8082')
  })
})
