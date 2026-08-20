<script setup lang="ts">
// 发消息弹窗组件：由收件箱页通过「发消息」按钮打开。
// 消息形式分两种：
//   - 纯文本：正文原样发送
//   - 结构化通知：填标题/级别/内容，发送时序列化为 JSON 对象
//     {"type":"notice","title":"...","level":"info|warning|error","content":"..."}
// 对方在详情页由 parseStructuredBody + JsonCard 自动解析为键值对卡片，
// 用户无需手写 JSON。发送成功后 emit('sent')，由父组件关闭弹窗并刷新列表。
import { ref, watch } from 'vue'
import { createJmapClient, JmapError } from '../api/jmap'
import { getMailDomain, useUserStore } from '../stores/user'
import { serverUrl } from '../utils/serverUrl'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ sent: []; close: [] }>()

type MsgMode = 'text' | 'notice'
type NoticeLevel = 'info' | 'warning' | 'error'

const user = useUserStore()

/** 收件人用户名（逗号分隔多个）。 */
const recipientInput = ref('')

const subject = ref('')
const body = ref('')
const msgMode = ref<MsgMode>('text')

// 结构化通知字段
const noticeTitle = ref('')
const noticeLevel = ref<NoticeLevel>('info')
const noticeContent = ref('')

const sending = ref(false)
const error = ref('')
const success = ref('')

const fieldErrors = ref<{ recipients: string; subject: string; body: string }>({
  recipients: '',
  subject: '',
  body: '',
})

// 弹窗每次打开时重置状态，避免上次残留。
watch(
  () => props.visible,
  (v) => {
    if (v) {
      error.value = ''
      success.value = ''
      fieldErrors.value = { recipients: '', subject: '', body: '' }
    }
  },
)


function makeClient() {
  return createJmapClient({
    baseUrl: serverUrl(),
    username: user.state.username,
    password: user.state.password,
  })
}

/** 将用户名列表（逗号/空格分隔）转为邮箱地址列表。 */
function usernamesToEmails(input: string): string[] {
  const domain = getMailDomain()
  return input
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => (name.includes('@') ? name : `${name}@${domain}`))
}

function setMsgMode(mode: MsgMode) {
  msgMode.value = mode
  fieldErrors.value.body = ''
}

function validate(): boolean {
  const errors = { recipients: '', subject: '', body: '' }
  const recipients = usernamesToEmails(recipientInput.value)
  if (!recipients.length) {
    errors.recipients = '请填写至少一个收件人用户名。'
  }
  if (!subject.value.trim()) {
    errors.subject = '请填写主题。'
  }
  if (msgMode.value === 'text') {
    if (!body.value.trim()) {
      errors.body = '请填写内容。'
    }
  } else {
    if (!noticeTitle.value.trim()) {
      errors.body = '请填写通知标题。'
    } else if (!noticeContent.value.trim()) {
      errors.body = '请填写通知内容。'
    }
  }
  fieldErrors.value = errors
  return !errors.recipients && !errors.subject && !errors.body
}

/** 根据消息形式构造正文：纯文本原样，结构化通知序列化为 JSON。 */
function buildBody(): string {
  if (msgMode.value === 'text') return body.value
  return JSON.stringify({
    type: 'notice',
    title: noticeTitle.value.trim(),
    level: noticeLevel.value,
    content: noticeContent.value.trim(),
  })
}

function resetForm() {
  recipientInput.value = ''
  subject.value = ''
  body.value = ''
  noticeTitle.value = ''
  noticeLevel.value = 'info'
  noticeContent.value = ''
}

async function send() {
  error.value = ''
  success.value = ''
  if (!validate()) return

  const recipients = usernamesToEmails(recipientInput.value)
  sending.value = true
  try {
    await makeClient().sendEmail({
      to: recipients,
      subject: subject.value.trim(),
      text: buildBody(),
    })
    const names = recipientInput.value.split(/[,，\s]+/).filter(Boolean).join('、')
    success.value = `已发送给 ${names}。`
    resetForm()
    emit('sent')
  } catch (err) {
    error.value = err instanceof JmapError ? err.message : `发送失败：${(err as Error).message}`
  } finally {
    sending.value = false
  }
}

function close() {
  emit('close')
}
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal">
      <div class="modal-header">
        <h2>发消息</h2>
        <button type="button" class="modal-close" @click="close">×</button>
      </div>

      <form class="compose-form" novalidate @submit.prevent="send">
        <div class="field">
          <label class="field-label" for="recipient-input">收件人</label>
          <input
            id="recipient-input"
            v-model="recipientInput"
            type="text"
            class="field-input"
            placeholder="输入用户名（多个用逗号分隔，如 alice, bob）"
            autocomplete="off"
          />
          <p v-if="fieldErrors.recipients" class="field-error" role="alert">
            {{ fieldErrors.recipients }}
          </p>
        </div>

        <div class="field">
          <label class="field-label" for="subject">主题</label>
          <input
            id="subject"
            v-model="subject"
            type="text"
            class="field-input"
            placeholder="消息主题"
          />
          <p v-if="fieldErrors.subject" class="field-error" role="alert">{{ fieldErrors.subject }}</p>
        </div>

        <div class="field">
          <div class="body-header">
            <label class="field-label">内容</label>
            <div class="mode-toggle" role="group" aria-label="消息形式">
              <button
                type="button"
                class="mode-btn"
                :class="{ active: msgMode === 'text' }"
                @click="setMsgMode('text')"
              >
                纯文本
              </button>
              <button
                type="button"
                class="mode-btn"
                :class="{ active: msgMode === 'notice' }"
                @click="setMsgMode('notice')"
              >
                结构化通知
              </button>
            </div>
          </div>

          <textarea
            v-if="msgMode === 'text'"
            id="body"
            v-model="body"
            class="field-textarea"
            rows="6"
            placeholder="输入消息内容…"
          ></textarea>

          <div v-else class="notice-form">
            <div class="notice-field">
              <label class="field-label" for="notice-title">通知标题</label>
              <input
                id="notice-title"
                v-model="noticeTitle"
                type="text"
                class="field-input"
                placeholder="如：系统维护通知"
              />
            </div>
            <div class="notice-field">
              <label class="field-label" for="notice-level">级别</label>
              <select id="notice-level" v-model="noticeLevel" class="field-input">
                <option value="info">提示</option>
                <option value="warning">警告</option>
                <option value="error">错误</option>
              </select>
            </div>
            <div class="notice-field">
              <label class="field-label" for="notice-content">通知内容</label>
              <textarea
                id="notice-content"
                v-model="noticeContent"
                class="field-textarea"
                rows="4"
                placeholder="输入通知内容…"
              ></textarea>
            </div>
          </div>

          <p v-if="fieldErrors.body" class="field-error" role="alert">{{ fieldErrors.body }}</p>
        </div>

        <p v-if="error" class="compose-error" role="alert">{{ error }}</p>
        <p v-if="success" class="compose-success" role="status">{{ success }}</p>

        <div class="compose-actions">
          <button type="submit" class="action-send" :disabled="sending">
            {{ sending ? '发送中…' : '发送' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  border-radius: 8px;
  padding: 1.25rem;
  width: min(640px, 92vw);
  max-height: 88vh;
  overflow-y: auto;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.modal-close {
  border: none;
  background: none;
  font-size: 1.4rem;
  color: #86909c;
  cursor: pointer;
  line-height: 1;
  padding: 0 0.25rem;
}

.modal-close:hover {
  color: #f53f3f;
}

.compose-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-label {
  font-weight: 600;
}

.field-input,
.field-textarea {
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  font: inherit;
}

.field-textarea {
  resize: vertical;
}

.body-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mode-toggle {
  display: inline-flex;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  overflow: hidden;
}

.mode-btn {
  border: none;
  background: #fff;
  color: #4e5969;
  padding: 0.2rem 0.75rem;
  cursor: pointer;
  font: inherit;
}

.mode-btn.active {
  background: #165dff;
  color: #fff;
}

.notice-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  background: #f7f8fa;
}

.notice-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field-error {
  margin: 0;
  color: #f53f3f;
  font-size: 0.9rem;
}

.compose-error {
  margin: 0;
  color: #f53f3f;
}

.compose-success {
  margin: 0;
  color: #00b42a;
}

.action-send {
  align-self: flex-start;
  border: 1px solid #165dff;
  border-radius: 4px;
  background: #165dff;
  color: #fff;
  padding: 0.4rem 1.5rem;
  cursor: pointer;
  font: inherit;
}

.action-send:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
