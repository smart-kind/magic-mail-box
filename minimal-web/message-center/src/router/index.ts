import { createRouter, createWebHashHistory } from 'vue-router'
import Inbox from '../views/Inbox.vue'
import MessageDetail from '../views/MessageDetail.vue'
import { useUserStore } from '../stores/user'

export const router = createRouter({
  // hash 路由：构建产物常以 file:// 或子路径（如 /message-center/dist/）被
  // 宿主 iframe 嵌入，history 模式下子路径不匹配任何路由且刷新会 404；
  // hash 模式下入口始终是 index.html，刷新后路由与凭证参数（hash query）
  // 都能保留。
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/inbox' },
    { path: '/inbox', name: 'inbox', component: Inbox },
    { path: '/message/:id', name: 'message-detail', component: MessageDetail },
  ],
})

// AUDIT-15：全局路由守卫。未登录访问受保护路由（非 /inbox）时跳回 /inbox，
// 由 Inbox onMounted 走 loginWithUsername 自动登录（URL ?user= 参数触发，
// 用户不存在则自动创建）。
// 注意：/inbox 本身必须放行——首次访问 /inbox?user=xxx 时用户尚未登录，
// 若拦截会阻断自动登录流程。Inbox 自己在未提供 user 且 store 为空时显示提示。
// 受保护路由未登录跳 /inbox 时携带原 query，使 Inbox 能复用 user/server 等参数。
router.beforeEach((to) => {
  if (to.path === '/inbox') return true
  if (!useUserStore().state.loggedIn) {
    return { path: '/inbox', query: to.query }
  }
  return true
})
