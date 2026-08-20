<script setup lang="ts">
// 消息详情页：按路由参数 id 加载单封邮件，展示发送者/收件人/时间/主题/正文。
// 正文整段是 JSON 对象或数组时渲染为结构化键值对卡片（JsonCard），否则按纯
// 文本原样展示。删除需二次确认，成功后返回收件箱。数据全部走 src/api/jmap.ts。
// 见 minimal-web/docs/first-plan.md「消息详情」一节。
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createJmapClient, JmapError, type EmailAddress, type EmailDetail } from '../api/jmap'
import { loginWithUsername, persistServer, useUserStore } from '../stores/user'
import { serverUrl } from '../utils/serverUrl'
import { parseStructuredBody, type JsonValue } from '../utils/structuredBody'
import JsonCard from '../components/JsonCard.vue'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const email = ref<EmailDetail | null>(null)
const loading = ref(false)
const error = ref('')
/** 缺少凭证（宿主未传参且 store 为空）时为 true。 */
const missingCredentials = ref(false)
/** 删除二次确认状态：true 表示等待用户确认。 */
const confirmingDelete = ref(false)
const deleting = ref(false)

/** 路由 id 基础校验：必须是单个非空字符串。 */
const messageId = computed(() => {
  const raw = route.params.id
  return typeof raw === 'string' && raw.trim() ? raw : ''
})

/** 正文是 JSON 对象/数组时为解析后的值，否则为 null。 */
const structured = computed<JsonValue | null>(() =>
  email.value ? parseStructuredBody(email.value.text) : null,
)

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function makeClient() {
  return createJmapClient({
    baseUrl: serverUrl(queryString(route.query.server)),
    username: user.state.username,
    password: user.state.password,
  })
}

async function load() {
  error.value = ''
  missingCredentials.value = false

  if (!messageId.value) {
    error.value = '消息链接无效：缺少消息 ID。'
    return
  }

  if (!user.state.loggedIn) {
    // AUDIT-16：移除对 route.query.pass 的直接读取，统一走 loginWithUsername
    // （与 Inbox 一致）。URL 只需 user 参数，密码自动派生，用户不存在则自动创建。
    const urlUser = queryString(route.query.user)
    if (!urlUser) {
      missingCredentials.value = true
      return
    }
    try {
      const server = serverUrl(queryString(route.query.server))
      persistServer(server)
      // SECURITY: 本地演示通过 URL 传凭证（AUDIT-08），仅限本机；对外需改用 postMessage 或服务端会话
      await loginWithUsername(urlUser, server, {
        adminUser: queryString(route.query.adminUser),
        adminPass: queryString(route.query.adminPass),
        domain: queryString(route.query.domain),
      })
    } catch (err) {
      error.value = `登录失败：${(err as Error).message}`
      return
    }
  }

  loading.value = true
  try {
    const client = makeClient()
    const list = await client.getEmails([messageId.value])
    email.value = list[0] ?? null
    if (!email.value) {
      error.value = '没有找到这条消息，它可能已被删除。'
    } else {
      // 打开消息后标记已读
      // AUDIT-34：标记已读失败不再静默吞错，输出 warn 便于排查。
      try { await client.markAsRead([messageId.value]) } catch (e) { console.warn('标记已读失败', e) }
    }
  } catch (err) {
    error.value = err instanceof JmapError ? err.message : `加载消息失败: ${(err as Error).message}`
  } finally {
    loading.value = false
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

function formatAddresses(list: EmailAddress[]): string {
  if (!list.length) return '未知'
  return list.map((a) => {
    if (a.name) return a.name
    // 从邮箱地址提取用户名（@ 前面部分）
    const at = a.email.indexOf('@')
    return at > 0 ? a.email.slice(0, at) : a.email
  }).join('、')
}

function backToInbox() {
  // 带上 server 参数，保证非默认服务器时收件箱仍能连上。
  router.push({ path: '/inbox', query: { server: queryString(route.query.server) || undefined } })
}

async function remove() {
  if (!confirmingDelete.value) {
    confirmingDelete.value = true
    return
  }
  deleting.value = true
  error.value = ''
  try {
    await makeClient().deleteEmails([messageId.value])
    backToInbox()
  } catch (err) {
    error.value = err instanceof JmapError ? err.message : `删除失败: ${(err as Error).message}`
    confirmingDelete.value = false
  } finally {
    deleting.value = false
  }
}

function cancelDelete() {
  confirmingDelete.value = false
}

onMounted(load)
</script>

<template>
  <section class="detail">
    <div class="detail-nav">
      <button type="button" class="nav-back" @click="backToInbox">← 返回收件箱</button>
    </div>

    <p v-if="missingCredentials" class="detail-hint">
      未提供用户凭证。请从宿主系统进入，或在 URL 中带上 <code>?user=用户名</code> 参数。
    </p>

    <template v-else>
      <p v-if="loading" class="detail-hint">加载中…</p>

      <p v-if="error" class="detail-error" role="alert">
        {{ error }}
        <button v-if="!loading" type="button" @click="load">重试</button>
      </p>

      <article v-if="email && !loading" class="detail-card">
        <h2 class="detail-subject">{{ email.subject || '（无主题）' }}</h2>

        <dl class="detail-meta">
          <dt>发送者</dt>
          <dd>{{ formatAddresses(email.from) }}</dd>
          <dt>收件人</dt>
          <dd>{{ formatAddresses(email.to) }}</dd>
          <dt>时间</dt>
          <dd>{{ formatTime(email.receivedAt) }}</dd>
        </dl>

        <div class="detail-body">
          <JsonCard v-if="structured" :value="structured" />
          <pre v-else class="body-text">{{ email.text || '（无正文）' }}</pre>
        </div>

        <div class="detail-actions">
          <template v-if="!confirmingDelete">
            <button type="button" class="action-delete" @click="remove">删除</button>
          </template>
          <template v-else>
            <span class="confirm-text">确认删除这条消息？删除后无法恢复。</span>
            <button type="button" class="action-delete confirm" :disabled="deleting" @click="remove">
              {{ deleting ? '删除中…' : '确认删除' }}
            </button>
            <button type="button" class="action-cancel" :disabled="deleting" @click="cancelDelete">
              取消
            </button>
          </template>
        </div>
      </article>
    </template>
  </section>
</template>

<style scoped>
.detail-nav {
  margin-bottom: 0.75rem;
}

.nav-back {
  border: none;
  background: none;
  color: #165dff;
  padding: 0;
  cursor: pointer;
}

.detail-card {
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  padding: 1rem;
}

.detail-subject {
  margin: 0 0 0.75rem;
  overflow-wrap: anywhere;
}

.detail-meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.35rem 1rem;
  margin: 0 0 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #f0f1f3;
  color: #4e5969;
}

.detail-meta dt {
  font-weight: 600;
  color: #1d2129;
}

.detail-meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.body-text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: inherit;
}

.detail-actions {
  margin-top: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.confirm-text {
  color: #f53f3f;
}

.action-delete {
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  background: #fff;
  color: #f53f3f;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
}

.action-delete:hover:not(:disabled) {
  border-color: #f53f3f;
}

.action-delete.confirm {
  background: #f53f3f;
  border-color: #f53f3f;
  color: #fff;
}

.action-cancel {
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  background: #fff;
  color: #4e5969;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
}

.detail-error {
  color: #f53f3f;
}

.detail-hint {
  color: #86909c;
}
</style>
