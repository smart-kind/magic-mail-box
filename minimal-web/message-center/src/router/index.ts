import { createRouter, createWebHashHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Inbox from '../views/Inbox.vue'
import MessageDetail from '../views/MessageDetail.vue'
import Compose from '../views/Compose.vue'

export const router = createRouter({
  // hash 路由：构建产物常以 file:// 或子路径（如 /message-center/dist/）被
  // 宿主 iframe 嵌入，history 模式下子路径不匹配任何路由且刷新会 404；
  // hash 模式下入口始终是 index.html，刷新后路由与凭证参数（hash query）
  // 都能保留。
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/inbox' },
    { path: '/login', name: 'login', component: Login },
    { path: '/inbox', name: 'inbox', component: Inbox },
    { path: '/message/:id', name: 'message-detail', component: MessageDetail },
    { path: '/compose', name: 'compose', component: Compose },
  ],
})
