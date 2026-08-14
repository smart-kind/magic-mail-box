import { createRouter, createWebHistory } from 'vue-router'
import Login from '../views/Login.vue'
import Inbox from '../views/Inbox.vue'
import MessageDetail from '../views/MessageDetail.vue'
import Compose from '../views/Compose.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/inbox' },
    { path: '/login', name: 'login', component: Login },
    { path: '/inbox', name: 'inbox', component: Inbox },
    { path: '/message/:id', name: 'message-detail', component: MessageDetail },
    { path: '/compose', name: 'compose', component: Compose },
  ],
})
