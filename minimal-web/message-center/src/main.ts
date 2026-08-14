import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'

const app = createApp(App)
app.use(router)
// 等初始导航完成再挂载：否则视图 onMounted 时 route.query 可能还是空的，
// 自动登录（从 hash query 读 user/pass）会偶发失败（时序竞争）。
void router.isReady().then(() => app.mount('#app'))
