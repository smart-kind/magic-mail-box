<script setup lang="ts">
// 发消息页：收件人输入用户名（自动转为邮箱），填写主题与内容发送。
// 用户名 → 邮箱的域名从 localStorage 读取（host-demo 写入）。
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createJmapClient, JmapError } from '../api/jmap'
import { getMailDomain, getServerUrl, persistedServer, persistServer, useUserStore } from '../stores/user'
import { parseStructuredBody } from '../utils/structuredBody'

const DEFAULT_SERVER = 'http://localhost:8082'

type BodyMode = 'text' | 'json'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

/** 收件人用户名（逗号分隔多个）。 */
const recipientInput = ref('')

const subject = ref('')
const body = ref('')
const bodyMode = ref<BodyMode>('text')

const JSON_PLACEHOLDER = `输入 JSON 对象或数组，详情页会渲染为结构化卡片，例如：
{
  "type": "notice",
  "level": "info"
}`

const sending = ref(false)
const error = ref('')
const success = ref('')
const missingCredentials = ref(false)

const fieldErrors = ref<{ recipients: string; subject: string; body: string }>({
  recipients: '',
  subject: '',
  body: '',
})

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function serverUrl(): string {
  return queryString(route.query.server) || persistedServer() || getServerUrl() || DEFAULT_SERVER
}

function makeClient() {
  return createJmapClient({
    baseUrl: serverUrl(),
    username: user.state.username,
    password: user.state.password,
  })
}

function ensureCredentials(): boolean {
  missingCredentials.value = false
  persistServer(queryString(route.query.server))
  if (user.state.loggedIn) return true
  missingCredentials.value = true
  return false
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

function setBodyMode(mode: BodyMode) {
  bodyMode.value = mode
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
  if (!body.value.trim()) {
    errors.body = '请填写内容。'
  } else if (bodyMode.value === 'json' && parseStructuredBody(body.value) === null) {
    errors.body = 'JSON 内容不合法：请输入完整的 JSON 对象或数组（如 {"type":"notice"}）。'
  }
  fieldErrors.value = errors
  return !errors.recipients && !errors.subject && !errors.body
}

async function send() {
  error.value = ''
  success.value = ''
  if (!ensureCredentials()) return
  if (!validate()) return

  const recipients = usernamesToEmails(recipientInput.value)
  sending.value = true
  try {
    await makeClient().sendEmail({
      to: recipients,
      subject: subject.value.trim(),
      text: bodyMode.value === 'json' ? body.value.trim() : body.value,
    })
    const names = recipientInput.value.split(/[,，\s]+/).filter(Boolean).join('、')
    success.value = `已发送给 ${names}。`
    recipientInput.value = ''
    subject.value = ''
    body.value = ''
  } catch (err) {
    error.value = err instanceof JmapError ? err.message : `发送失败：${(err as Error).message}`
  } finally {
    sending.value = false
  }
}

function backToInbox() {
  router.push({ path: '/inbox', query: { server: queryString(route.query.server) || undefined } })
}

onMounted(ensureCredentials)
</script>

<template>
  <section class="compose">
    <div class="compose-nav">
      <button type="button" class="nav-back" @click="backToInbox">← 返回收件箱</button>
    </div>

    <h2>发消息</h2>

    <p v-if="missingCredentials" class="compose-hint">
      未登录。请先从收件箱进入。
    </p>

    <form v-else class="compose-form" novalidate @submit.prevent="send">
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
          <label class="field-label" for="body">内容</label>
          <div class="mode-toggle" role="group" aria-label="内容格式">
            <button
              type="button"
              class="mode-btn"
              :class="{ active: bodyMode === 'text' }"
              @click="setBodyMode('text')"
            >
              纯文本
            </button>
            <button
              type="button"
              class="mode-btn"
              :class="{ active: bodyMode === 'json' }"
              @click="setBodyMode('json')"
            >
              JSON
            </button>
          </div>
        </div>
        <textarea
          id="body"
          v-model="body"
          class="field-textarea"
          :class="{ mono: bodyMode === 'json' }"
          rows="8"
          :placeholder="bodyMode === 'json' ? JSON_PLACEHOLDER : '输入消息内容…'"
        ></textarea>
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
  </section>
</template>

<style scoped>
.compose-nav {
  margin-bottom: 0.75rem;
}

.nav-back {
  border: none;
  background: none;
  color: #165dff;
  padding: 0;
  cursor: pointer;
}

.compose-form {
  max-width: 640px;
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

.field-textarea.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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

.compose-hint {
  color: #86909c;
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
