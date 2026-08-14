<script setup lang="ts">
// 收件箱：消息列表页。启动时用当前用户凭证（user store，或 URL 参数 user/pass/server）
// 自动完成 JMAP basic auth 并拉取收件箱。数据全部走 src/api/jmap.ts 封装。
// 见 minimal-web/docs/first-plan.md「消息列表」一节。
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createJmapClient, JmapError, type EmailSummary } from '../api/jmap'
import { useUserStore } from '../stores/user'

/** docker-compose.yml 把 Stalwart 的 8080 映射到宿主 8082。 */
const DEFAULT_SERVER = 'http://localhost:8082'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const emails = ref<EmailSummary[]>([])
const loading = ref(false)
const error = ref('')
/** 正在删除的邮件 id，用于禁用对应按钮。 */
const deletingId = ref<string | null>(null)
/** 缺少凭证（宿主未传参且 store 为空）时为 true。 */
const missingCredentials = ref(false)

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function load() {
  error.value = ''
  missingCredentials.value = false

  if (!user.state.loggedIn) {
    const username = queryString(route.query.user)
    const password = queryString(route.query.pass)
    if (!username || !password) {
      missingCredentials.value = true
      return
    }
    user.setCredentials(username, password)
  }

  const client = createJmapClient({
    baseUrl: queryString(route.query.server) || DEFAULT_SERVER,
    username: user.state.username,
    password: user.state.password,
  })

  loading.value = true
  try {
    emails.value = await client.listInbox()
  } catch (err) {
    error.value = err instanceof JmapError ? err.message : `加载收件箱失败: ${(err as Error).message}`
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

function senderLabel(email: EmailSummary): string {
  const first = email.from[0]
  if (!first) return '未知发送者'
  return first.name || first.email
}

function openMessage(email: EmailSummary) {
  router.push(`/message/${email.id}`)
}

async function remove(email: EmailSummary) {
  deletingId.value = email.id
  error.value = ''
  try {
    const client = createJmapClient({
      baseUrl: queryString(route.query.server) || DEFAULT_SERVER,
      username: user.state.username,
      password: user.state.password,
    })
    await client.deleteEmails([email.id])
    await load()
  } catch (err) {
    error.value = err instanceof JmapError ? err.message : `删除失败: ${(err as Error).message}`
  } finally {
    deletingId.value = null
  }
}

onMounted(load)
</script>

<template>
  <section class="inbox">
    <h2>收件箱</h2>

    <p v-if="missingCredentials" class="inbox-hint">
      未提供用户凭证。请从宿主系统进入，或在 URL 中带上 <code>?user=用户名&amp;pass=密码</code> 参数。
    </p>

    <template v-else>
      <p v-if="error" class="inbox-error" role="alert">
        {{ error }}
        <button type="button" @click="load">重试</button>
      </p>

      <p v-if="loading" class="inbox-hint">加载中…</p>

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
