<script setup lang="ts">
// 发消息页：从 demo 用户列表（localStorage 覆盖或默认 demo001~demo100，见
// src/data/demoUsers.ts）搜索/多选收件人，填写主题与内容（纯文本或 JSON），
// 通过 src/api/jmap.ts 的 sendEmail 发送。JSON 模式下正文必须是合法的 JSON
// 对象/数组（与详情页 parseStructuredBody 的识别规则一致），保证详情页能
// 渲染为结构化卡片。见 minimal-web/docs/first-plan.md「发消息」一节。
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createJmapClient, JmapError } from '../api/jmap'
import { persistedServer, persistServer, useUserStore } from '../stores/user'
import { loadDemoUsers, type DemoUser } from '../data/demoUsers'
import { parseStructuredBody } from '../utils/structuredBody'

/** docker-compose.yml 把 Stalwart 的 8080 映射到宿主 8082。 */
const DEFAULT_SERVER = 'http://localhost:8082'

type BodyMode = 'text' | 'json'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

/** 收件人候选（demo 用户列表，加载后不变化）。 */
const candidates = loadDemoUsers()
/** 已选中的收件人。 */
const selected = ref<DemoUser[]>([])
/** 收件人搜索关键字。 */
const search = ref('')

const subject = ref('')
const body = ref('')
const bodyMode = ref<BodyMode>('text')

/** JSON 模式的占位示例（放在 script 里，避免模板属性中的引号/换行转义问题）。 */
const JSON_PLACEHOLDER = `输入 JSON 对象或数组，详情页会渲染为结构化卡片，例如：
{
  "type": "notice",
  "level": "info"
}`

const sending = ref(false)
/** 发送失败信息（JMAP/网络错误）。 */
const error = ref('')
/** 发送成功反馈。 */
const success = ref('')
/** 缺少凭证（宿主未传参且 store 为空）时为 true。 */
const missingCredentials = ref(false)

/** 各字段的前端校验错误。 */
const fieldErrors = ref<{ recipients: string; subject: string; body: string }>({
  recipients: '',
  subject: '',
  body: '',
})

/** 搜索过滤后的候选（不含已选中的）。 */
const filteredCandidates = computed(() => {
  const chosen = new Set(selected.value.map((u) => u.email))
  const keyword = search.value.trim().toLowerCase()
  return candidates.filter(
    (u) =>
      !chosen.has(u.email) &&
      (!keyword ||
        u.name.toLowerCase().includes(keyword) ||
        u.email.toLowerCase().includes(keyword)),
  )
})

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function makeClient() {
  return createJmapClient({
    baseUrl: queryString(route.query.server) || persistedServer() || DEFAULT_SERVER,
    username: user.state.username,
    password: user.state.password,
  })
}

/** 与 Inbox/MessageDetail 一致：优先 user store，否则从 URL query 自动登录。 */
function ensureCredentials(): boolean {
  missingCredentials.value = false
  persistServer(queryString(route.query.server))
  if (user.state.loggedIn) return true
  const username = queryString(route.query.user)
  const password = queryString(route.query.pass)
  if (!username || !password) {
    missingCredentials.value = true
    return false
  }
  user.setCredentials(username, password)
  return true
}

function addRecipient(candidate: DemoUser) {
  if (selected.value.some((u) => u.email === candidate.email)) return
  selected.value.push(candidate)
  search.value = ''
  fieldErrors.value.recipients = ''
}

function removeRecipient(candidate: DemoUser) {
  selected.value = selected.value.filter((u) => u.email !== candidate.email)
}

function setBodyMode(mode: BodyMode) {
  bodyMode.value = mode
  fieldErrors.value.body = ''
}

/** 前端校验：空收件人/空主题/空内容；JSON 模式下内容必须是 JSON 对象/数组。 */
function validate(): boolean {
  const errors = { recipients: '', subject: '', body: '' }
  if (!selected.value.length) {
    errors.recipients = '请至少选择一个收件人。'
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

  sending.value = true
  try {
    await makeClient().sendEmail({
      to: selected.value.map((u) => u.email),
      subject: subject.value.trim(),
      text: bodyMode.value === 'json' ? body.value.trim() : body.value,
    })
    // 成功反馈 + 清空表单，方便连续发送（first-plan.md 多用户通信测试场景）。
    success.value = `已发送给 ${selected.value.map((u) => u.name).join('、')}。`
    selected.value = []
    subject.value = ''
    body.value = ''
  } catch (err) {
    error.value = err instanceof JmapError ? err.message : `发送失败: ${(err as Error).message}`
  } finally {
    sending.value = false
  }
}

function backToInbox() {
  router.push({ path: '/inbox', query: { server: queryString(route.query.server) || undefined } })
}

// 直接进入本页（非站内导航）时立即检查凭证，而不是等到点发送才提示。
onMounted(ensureCredentials)
</script>

<template>
  <section class="compose">
    <div class="compose-nav">
      <button type="button" class="nav-back" @click="backToInbox">← 返回收件箱</button>
    </div>

    <h2>发消息</h2>

    <p v-if="missingCredentials" class="compose-hint">
      未提供用户凭证。请从宿主系统进入，或在 URL 中带上 <code>?user=用户名&amp;pass=密码</code> 参数。
    </p>

    <form v-else class="compose-form" novalidate @submit.prevent="send">
      <div class="field">
        <label class="field-label" for="recipient-search">收件人</label>
        <div v-if="selected.length" class="chips">
          <span v-for="u in selected" :key="u.email" class="chip">
            {{ u.name }}
            <button
              type="button"
              class="chip-remove"
              :aria-label="`移除 ${u.name}`"
              @click="removeRecipient(u)"
            >
              ×
            </button>
          </span>
        </div>
        <input
          id="recipient-search"
          v-model="search"
          type="text"
          class="field-input"
          placeholder="搜索 demo 用户（如 demo002）…"
          autocomplete="off"
        />
        <ul v-if="filteredCandidates.length" class="candidate-list">
          <li v-for="u in filteredCandidates.slice(0, 10)" :key="u.email">
            <button type="button" class="candidate" @click="addRecipient(u)">
              <span class="candidate-name">{{ u.name }}</span>
              <span class="candidate-email">{{ u.email }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="field-hint">没有匹配的用户。</p>
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

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: #e8f1ff;
  color: #165dff;
  border-radius: 999px;
  padding: 0.15rem 0.4rem 0.15rem 0.7rem;
  font-size: 0.9rem;
}

.chip-remove {
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0 0.2rem;
}

.candidate-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  max-height: 220px;
  overflow-y: auto;
}

.candidate {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  border: none;
  background: #fff;
  padding: 0.45rem 0.6rem;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.candidate:hover {
  background: #f7f8fa;
}

.candidate-email {
  color: #86909c;
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

.field-hint {
  margin: 0;
  color: #86909c;
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
