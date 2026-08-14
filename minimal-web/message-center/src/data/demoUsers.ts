// Demo 用户列表：发消息页的收件人候选。默认生成 demo001@local.test ~
// demo100@local.test（与 host-demo 批量创建的账号一致，见 first-plan.md
// 「测试场景构造」）；宿主若使用了其它域名/账号，可把完整列表写入
// localStorage（key 见下）覆盖默认值。不连真实服务器，纯本地数据。

export interface DemoUser {
  /** 本地部分，如 demo001。 */
  name: string
  /** 完整邮箱地址，如 demo001@local.test。 */
  email: string
}

/** localStorage 覆盖键：值为 DemoUser[] 的 JSON。 */
export const DEMO_USERS_STORAGE_KEY = 'message-center.demo-users'

export const DEMO_USER_COUNT = 100
export const DEMO_DOMAIN = 'local.test'

/** 第 n 个（1 起）测试用户的本地部分：demo001 ~ demo100。 */
export function demoName(n: number): string {
  return `demo${String(n).padStart(3, '0')}`
}

/** 默认的 100 个 demo 用户。 */
export function defaultDemoUsers(): DemoUser[] {
  return Array.from({ length: DEMO_USER_COUNT }, (_, i) => {
    const name = demoName(i + 1)
    return { name, email: `${name}@${DEMO_DOMAIN}` }
  })
}

/**
 * 读取收件人候选列表：优先 localStorage 中的覆盖列表（宿主自定义域名时
 * 由宿主写入），缺失或内容非法时回退到默认 demo001~demo100。
 */
export function loadDemoUsers(storage: Pick<Storage, 'getItem'> | null = safeLocalStorage()): DemoUser[] {
  const raw = storage?.getItem(DEMO_USERS_STORAGE_KEY)
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const users = parsed.filter(
          (u): u is DemoUser =>
            typeof u === 'object' &&
            u !== null &&
            typeof (u as DemoUser).name === 'string' &&
            typeof (u as DemoUser).email === 'string',
        )
        if (users.length) return users
      }
    } catch {
      // 内容非法时静默回退默认列表。
    }
  }
  return defaultDemoUsers()
}

/** jsdom/隐私模式下 localStorage 可能抛异常，这里兜底返回 null。 */
function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
