<script setup lang="ts">
// 收件箱：消息列表页。URL 只需 user 参数（用户名），密码自动派生，
// 用户不存在时自动创建。数据全部走 src/api/jmap.ts 封装。
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createJmapClient, JmapError, type EmailSummary } from '../api/jmap'
import { loginWithUsername, persistServer, useUserStore } from '../stores/user'
import { serverUrl } from '../utils/serverUrl'
import Compose from './Compose.vue'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const emails = ref<EmailSummary[]>([])
const loading = ref(false)
const error = ref('')
const deletingId = ref<string | null>(null)
const missingCredentials = ref(false)
const showCompose = ref(false)

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

  // URL 只有 user 参数（用户名），密码自动派生，用户不存在则自动创建。
  // adminUser/adminPass/domain 由宿主通过 URL 传入（跨域 localStorage 不共享）。
  const urlUser = queryString(route.query.user)
  if (urlUser) {
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
    // AUDIT-35：删除成功后统一调 load() 重新拉取列表（保证与服务端一致），
    // 不再本地 filter，避免「本地 filter + load()」双重更新导致的重复/不一致。
    await load()
  } catch (err) {
    error.value = err instanceof JmapError ? err.message : `删除失败：${(err as Error).message}`
  } finally {
    deletingId.value = null
  }
}

async function onComposeSent() {
  showCompose.value = false
  await load()
}

onMounted(load)
</script>

<template>
  <section class="inbox">
    <div class="inbox-header">
      <h2>收件箱</h2>
      <div class="inbox-actions">
        <button type="button" class="btn-compose" @click="showCompose = true">发消息</button>
        <button type="button" class="btn-refresh" :disabled="loading" @click="load">
          {{ loading ? '加载中…' : '刷新消息' }}
        </button>
      </div>
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
    <Compose :visible="showCompose" @sent="onComposeSent" @close="showCompose = false" />
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

.inbox-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-compose {
  border: 1px solid #165dff;
  border-radius: 4px;
  background: #165dff;
  color: #fff;
  padding: 0.3rem 0.8rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.btn-compose:hover {
  background: #4080fc;
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
