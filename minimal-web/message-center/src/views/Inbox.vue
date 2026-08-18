<script setup lang="ts">
// 收件箱：消息列表页。URL 只需 user 参数（用户名），密码自动派生，
// 用户不存在时自动创建。数据全部走 src/api/jmap.ts 封装。
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createJmapClient, JmapError, type EmailSummary } from '../api/jmap'
import { getServerUrl, loginWithUsername, persistedServer, persistServer, useUserStore } from '../stores/user'

/** docker-compose.yml 把 Stalwart 的 8080 映射到宿主 8082。 */
const DEFAULT_SERVER = 'http://localhost:8082'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const emails = ref<EmailSummary[]>([])
const loading = ref(false)
const error = ref('')
const deletingId = ref<string | null>(null)
const missingCredentials = ref(false)

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

async function load() {
  error.value = ''
  missingCredentials.value = false

  // URL 只有 user 参数（用户名），密码自动派生，用户不存在则自动创建。
  // adminUser/adminPass/domain 由宿主通过 URL 传入（跨域 localStorage 不共享）。
  const urlUser = queryString(route.query.user)
  if (urlUser) {
    try {
      const server = serverUrl()
      persistServer(server)
      await loginWithUsername(urlUser, server, {
        adminUser: queryString(route.query.adminUser),
        adminPass: queryString(route.query.adminPass),
        domain: queryString(route.query.domain),
      })
    } catch (err) {
      error.value = `登录失败：${(err as Error).message}`
      return
    }
  } else if (!user.state.loggedIn) {
    missingCredentials.value = true
    return
  }

  loading.value = true
  try {
    emails.value = await makeClient().listInbox()
  } catch (err) {
    error.value = err instanceof JmapError ? err.message : `加载收件箱失败：${(err as Error).message}`
  } finally {
    loading.value = false
  }
}

function isUnread(email: EmailSummary): boolean {
  return !email.keywords.$seen
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

/** 发件人显示用户名部分（去掉 @domain）。 */
function senderLabel(email: EmailSummary): string {
  const first = email.from[0]
  if (!first) return '未知发送者'
  if (first.name) return first.name
  // 从邮箱地址提取用户名（@ 前面部分）
  const at = first.email.indexOf('@')
  return at > 0 ? first.email.slice(0, at) : first.email
}

function openMessage(email: EmailSummary) {
  router.push(`/message/${email.id}`)
}

async function remove(email: EmailSummary) {
  deletingId.value = email.id
  error.value = ''
  try {
    await makeClient().deleteEmails([email.id])
    emails.value = emails.value.filter((e) => e.id !== email.id)
    await load()
  } catch (err) {
    error.value = err instanceof JmapError ? err.message : `删除失败：${(err as Error).message}`
  } finally {
    deletingId.value = null
  }
}

onMounted(load)
</script>

<template>
  <section class="inbox">
    <div class="inbox-header">
      <h2>收件箱</h2>
      <button type="button" class="btn-refresh" :disabled="loading" @click="load">
        {{ loading ? '加载中…' : '刷新消息' }}
      </button>
    </div>

    <p v-if="missingCredentials" class="inbox-hint">
      未提供用户名。请在 URL 中带上 <code>?user=用户名</code> 参数。
    </p>

    <template v-else>
      <p v-if="error" class="inbox-error" role="alert">
        {{ error }}
        <button type="button" @click="load">重试</button>
      </p>

      <p v-if="loading && !emails.length" class="inbox-hint">加载中…</p>

      <p v-else-if="!emails.length && !error" class="inbox-hint">收件箱是空的，还没有收到任何消息。</p>

      <ul v-else class="inbox-list">
        <li
          v-for="email in emails"
          :key="email.id"
          class="inbox-item"
          :class="{ unread: isUnread(email) }"
          @click="openMessage(email)"
        >
          <span class="unread-dot" :title="isUnread(email) ? '未读' : '已读'" />
          <div class="item-main">
            <div class="item-top">
              <span class="item-sender">{{ senderLabel(email) }}</span>
              <span class="item-time">{{ formatTime(email.receivedAt) }}</span>
            </div>
            <div class="item-subject">{{ email.subject || '（无主题）' }}</div>
          </div>
          <button
            type="button"
            class="item-delete"
            :disabled="deletingId === email.id"
            @click.stop="remove(email)"
          >
            {{ deletingId === email.id ? '删除中…' : '删除' }}
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.inbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.inbox-header h2 {
  margin: 0;
}

.btn-refresh {
  border: 1px solid #165dff;
  border-radius: 4px;
  background: #fff;
  color: #165dff;
  padding: 0.3rem 0.8rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.btn-refresh:hover:not(:disabled) {
  background: #165dff;
  color: #fff;
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: default;
}

.inbox-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
}

.inbox-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
}

.inbox-item + .inbox-item {
  border-top: 1px solid #f0f1f3;
}

.inbox-item:hover {
  background: #f7f8fa;
}

.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: transparent;
  flex-shrink: 0;
}

.inbox-item.unread .unread-dot {
  background: #165dff;
}

.inbox-item.unread .item-sender,
.inbox-item.unread .item-subject {
  font-weight: 600;
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-top {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.item-sender {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-time {
  color: #86909c;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.item-subject {
  color: #4e5969;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-delete {
  flex-shrink: 0;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  background: #fff;
  color: #86909c;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
}

.item-delete:hover:not(:disabled) {
  color: #f53f3f;
  border-color: #f53f3f;
}

.inbox-error {
  color: #f53f3f;
}

.inbox-hint {
  color: #86909c;
}
</style>
