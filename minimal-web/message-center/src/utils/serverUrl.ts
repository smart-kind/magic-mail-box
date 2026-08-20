// 统一服务器地址解析（AUDIT-29）：原先 Inbox/MessageDetail/Compose 三个视图
// 各自重复定义 serverUrl()，逻辑还略有差异（MessageDetail 不读 localStorage，
// Compose 不读 URL query）。这里抽出共享函数，统一优先级：
//   URL query.server > sessionStorage(mc.server) > localStorage(mc.server) > DEFAULT_SERVER
// sessionStorage 由本应用 persistServer 写入（站内跳转记忆），localStorage 由
// host-demo 写入（跨域共享），DEFAULT_SERVER 为本地联调默认值。
import { persistedServer, getServerUrl } from '../stores/user'

/** docker-compose.yml 把 Stalwart 的 8080 映射到宿主 8082。 */
export const DEFAULT_SERVER = 'http://localhost:8082'

/**
 * 解析当前应使用的 JMAP 服务器地址。
 * @param queryServer 当前路由 URL query 中的 server 参数（可选）
 */
export function serverUrl(queryServer?: string): string {
  if (queryServer) return queryServer
  const persisted = persistedServer()
  if (persisted) return persisted
  return getServerUrl()
}