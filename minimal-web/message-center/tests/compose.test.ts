// AUDIT-19: 本文件 mock 掉真实 JMAP client 以隔离视图逻辑；真实 Basic Auth/凭证流由 jmap.test.ts 覆盖
// TEST tests/compose.test.ts — 验证发消息弹窗的凭证接入、收件人输入、校验与发送
// SCOPE: src/views/Compose.vue（弹窗组件，props: visible；store 凭证接入；
//        收件人用户名文本输入；空收件人/空主题/空内容校验；结构化通知空标题/空内容
//        校验；纯文本原样发送；结构化通知序列化为 JSON 发送；发送成功后 emit('sent')
//        并清空表单；发送失败展示错误且保留表单内容；emit('close') 由父组件关闭）
// ENV: jsdom（vitest）；无网络——vi.mock('../src/api/jmap') 用内存假 client
//      （sendEmail 为 vi.fn），createJmapClient 参数被记录以验证凭证传递；
//      每个用例前清空 user store 与 localStorage。
// GATES: 通过则证明——store 凭证正确传给 createJmapClient；收件人用逗号分隔的用户名
//        输入并自动追加域名；纯文本空值校验阻止发送；结构化通知空标题/空内容校验
//        阻止发送；纯文本内容原样调用 sendEmail；结构化通知字段序列化为 JSON 对象
//        调用 sendEmail；成功后 emit('sent') 且表单清空；失败后显示错误且表单内容
//        保留；关闭按钮触发 emit('close')。
// RISK: jmap 模块被整体 mock，视图与真实 JMAP 协议的集成不在本测试覆盖范围
//       （协议层由 tests/jmap.test.ts 保证）；「结构化通知发送后详情页可解析」
//       依赖视图层 parseStructuredBody 与详情页共用同一规则，若两侧规则各自
//       漂移会漏检（共用 src/utils/structuredBody.ts 降低该风险）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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

/** 挂载 Compose 弹窗（visible=true）。测试需预先在 store 中设置登录状态。 */
async function mountCompose() {
  const wrapper = mount(Compose, { props: { visible: true } })
  await flushPromises()
  return wrapper
}

/** 填写收件人（逗号分隔用户名）、主题与纯文本内容。 */
async function fillForm(
  wrapper: Awaited<ReturnType<typeof mountCompose>>,
  options: { recipients: string[]; subject: string; body: string },
) {
  await wrapper.find('#recipient-input').setValue(options.recipients.join(', '))
  await wrapper.find('#subject').setValue(options.subject)
  await wrapper.find('#body').setValue(options.body)
}

/** 切到结构化通知模式并填写字段。 */
async function fillNoticeForm(
  wrapper: Awaited<ReturnType<typeof mountCompose>>,
  options: { recipients: string[]; subject: string; title: string; level?: string; content: string },
) {
  await wrapper.findAll('.mode-btn')[1].trigger('click')
  await wrapper.find('#recipient-input').setValue(options.recipients.join(', '))
  await wrapper.find('#subject').setValue(options.subject)
  await wrapper.find('#notice-title').setValue(options.title)
  if (options.level) {
    await wrapper.find('#notice-level').setValue(options.level)
  }
  await wrapper.find('#notice-content').setValue(options.content)
}

async function submit(wrapper: Awaited<ReturnType<typeof mountCompose>>) {
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

describe('Compose modal', () => {
  it('uses store credentials and passes them to the client', async () => {
    useUserStore().setCredentials('demo003', '884195429!Mc7')
    sessionStorage.setItem('mc.server', 'http://mail.test:8082')
    const wrapper = await mountCompose()
    await fillForm(wrapper, { recipients: ['demo002'], subject: '你好', body: '正文' })
    await submit(wrapper)

    expect(createJmapClient).toHaveBeenCalledWith({
      baseUrl: 'http://mail.test:8082',
      username: 'demo003',
      password: '884195429!Mc7',
    })
  })

  it('accepts comma-separated usernames as recipients', async () => {
    const wrapper = await mountCompose()
    await wrapper.find('#recipient-input').setValue('alice, bob, charlie')
    expect((wrapper.find('#recipient-input').element as HTMLInputElement).value).toBe(
      'alice, bob, charlie',
    )
  })

  it('validates empty recipients, subject and body before sending', async () => {
    const wrapper = await mountCompose()
    await submit(wrapper)

    expect(mocks.sendEmail).not.toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).toContain('请填写至少一个收件人')
    expect(text).toContain('请填写主题')
    expect(text).toContain('请填写内容')
    expect(wrapper.findAll('[role="alert"]').length).toBeGreaterThanOrEqual(3)
  })

  it('sends plain text to multiple recipients, emits sent and clears the form', async () => {
    const wrapper = await mountCompose()
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
    expect(wrapper.emitted('sent')).toBeTruthy()
    // 表单已清空，可继续发送下一封。
    expect((wrapper.find('#recipient-input').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#subject').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#body').element as HTMLTextAreaElement).value).toBe('')
  })

  it('validates empty notice title and content in notice mode', async () => {
    const wrapper = await mountCompose()
    await wrapper.findAll('.mode-btn')[1].trigger('click')
    await wrapper.find('#recipient-input').setValue('demo002')
    await wrapper.find('#subject').setValue('通知')
    await submit(wrapper)

    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请填写通知标题')
  })

  it('validates empty notice content when title is filled', async () => {
    const wrapper = await mountCompose()
    await wrapper.findAll('.mode-btn')[1].trigger('click')
    await wrapper.find('#recipient-input').setValue('demo002')
    await wrapper.find('#subject').setValue('通知')
    await wrapper.find('#notice-title').setValue('系统维护')
    await submit(wrapper)

    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请填写通知内容')
  })

  it('serializes notice fields to JSON so the detail page renders a card', async () => {
    const wrapper = await mountCompose()
    await fillNoticeForm(wrapper, {
      recipients: ['demo002'],
      subject: '结构化通知',
      title: '回复确认',
      level: 'warning',
      content: '已收到，处理中。',
    })
    await submit(wrapper)

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    const call = mocks.sendEmail.mock.calls[0][0]
    expect(call.to).toEqual(['demo002@local.test'])
    expect(call.subject).toBe('结构化通知')
    // 发送的是 JSON 字符串，详情页 parseStructuredBody 能解析为对象渲染成卡片。
    const parsed = JSON.parse(call.text)
    expect(parsed).toEqual({
      type: 'notice',
      title: '回复确认',
      level: 'warning',
      content: '已收到，处理中。',
    })
    expect(wrapper.emitted('sent')).toBeTruthy()
  })

  it('defaults notice level to info when not explicitly set', async () => {
    const wrapper = await mountCompose()
    await fillNoticeForm(wrapper, {
      recipients: ['demo002'],
      subject: '通知',
      title: '提示',
      content: '内容',
    })
    await submit(wrapper)

    const parsed = JSON.parse(mocks.sendEmail.mock.calls[0][0].text)
    expect(parsed.level).toBe('info')
  })

  it('shows the error and keeps the form content when sending fails', async () => {
    mocks.sendEmail.mockRejectedValue(new JmapError('发送失败（forbidden）: 无权发送'))
    const wrapper = await mountCompose()
    await fillForm(wrapper, { recipients: ['demo002'], subject: '主题', body: '正文' })
    await submit(wrapper)

    expect(wrapper.find('.compose-error').text()).toContain('无权发送')
    // 失败后表单内容保留，用户可以修正后重试。
    expect((wrapper.find('#recipient-input').element as HTMLInputElement).value).toBe('demo002')
    expect((wrapper.find('#subject').element as HTMLInputElement).value).toBe('主题')
    expect((wrapper.find('#body').element as HTMLTextAreaElement).value).toBe('正文')
  })

  it('emits close when the close button is clicked', async () => {
    const wrapper = await mountCompose()
    await wrapper.find('.modal-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('does not render the modal when visible is false', async () => {
    const wrapper = mount(Compose, { props: { visible: false } })
    await flushPromises()
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
  })
})
