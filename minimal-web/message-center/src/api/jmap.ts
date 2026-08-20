// JMAP 客户端封装：通过 HTTP Basic Auth + JMAP API（RFC 8620/8621）与 Stalwart
// Mail Server 通信。仅使用原生 fetch，见 minimal-web/docs/first-plan.md
// 「JMAP 客户端」一节。会话发现走 `GET {baseUrl}/.well-known/jmap`。

/** JMAP Session 资源（RFC 8620 §2），只声明本客户端用到的字段。 */
export interface JmapSession {
  apiUrl: string
  downloadUrl: string
  uploadUrl: string
  accounts: Record<string, { name: string }>
  primaryAccounts: Record<string, string>
  username: string
  state: string
}

export interface EmailAddress {
  name?: string | null
  email: string
}

/** 收件箱列表项（Email/query + Email/get 摘要）。 */
export interface EmailSummary {
  id: string
  subject: string
  from: EmailAddress[]
  receivedAt: string
  preview: string
  /** JMAP keywords（如 `$seen`）；不含 `$seen` 即为未读。 */
  keywords: Record<string, boolean>
}

/** 完整邮件内容（含正文文本）。 */
export interface EmailDetail extends EmailSummary {
  to: EmailAddress[]
  /** 正文纯文本；邮件无 textBody 时为空字符串。 */
  text: string
}

export interface SendMessageInput {
  /** 收件人邮箱地址列表。 */
  to: string[]
  subject: string
  /** 纯文本正文（结构化消息可直接放 JSON 字符串）。 */
  text: string
}

/** JMAP 调用失败时抛出的错误。message 中绝不包含密码。 */
export class JmapError extends Error {
  readonly status?: number
  /** JMAP 方法级错误类型（如 "invalidArguments"），HTTP 级失败时为空。 */
  readonly type?: string

  constructor(message: string, status?: number, type?: string) {
    super(message)
    this.name = 'JmapError'
    this.status = status
    this.type = type
  }
}

export interface JmapClientOptions {
  /** Stalwart 服务地址，如 `http://localhost:8080`。 */
  baseUrl: string
  username: string
  password: string
  /** 可注入的 fetch 实现（测试用），默认用全局 fetch。 */
  fetchImpl?: typeof fetch
}

type MethodCall = [string, Record<string, unknown>, string]
type MethodResponse = [string, Record<string, unknown>, string]

const JMAP_CORE = 'urn:ietf:params:jmap:core'
const JMAP_MAIL = 'urn:ietf:params:jmap:mail'
// EmailSubmission/Identity 方法需要 submission 能力，否则 Stalwart 报
// unknownMethod（"requires capability urn:ietf:params:jmap:submission"）。
const JMAP_SUBMISSION = 'urn:ietf:params:jmap:submission'

export interface JmapClient {
  getSession(): Promise<JmapSession>
  getAccountId(): Promise<string>
  getDownloadUrl(): Promise<string>
  /** 查询收件箱，返回按时间倒序的邮件 id 列表。 */
  queryInboxIds(limit?: number): Promise<string[]>
  /** 查询收件箱摘要列表（id + 主题 + 发件人 + 时间 + 预览）。 */
  listInbox(limit?: number): Promise<EmailSummary[]>
  /** 按 id 获取完整邮件（含正文文本）。 */
  getEmails(ids: string[]): Promise<EmailDetail[]>
  /** 发送一封邮件。 */
  sendEmail(input: SendMessageInput): Promise<void>
  /** 删除指定邮件。 */
  deleteEmails(ids: string[]): Promise<void>
  /** 标记邮件为已读（设置 $seen keyword）。 */
  markAsRead(ids: string[]): Promise<void>
}

/**
 * 将字符串编码为 Base64，支持 Unicode（UTF-8）。
 * btoa 仅支持 Latin1，遇到中文/emoji 会抛 InvalidCharacterError；
 * AUDIT-31: 先用 TextEncoder 转 UTF-8 字节再 base64 编码，编码方式更健壮。
 * Basic Auth 头格式不变（`Basic <base64>`），仅编码实现替换。
 */
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/** 生成 HTTP Basic Auth 请求头值。 */
export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${toBase64(`${username}:${password}`)}`
}

export function createJmapClient(options: JmapClientOptions): JmapClient {
  const { baseUrl, username, password } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const authHeader = basicAuthHeader(username, password)

  // AUDIT-37: 生产环境应使用 https://，避免 Basic Auth 凭证明文传输。
  // 不阻断本地 http 使用，仅 console.warn 提示。
  if (import.meta.env.PROD && !baseUrl.startsWith('https://')) {
    console.warn(
      `生产环境 JMAP baseUrl 应使用 https://，当前为 ${baseUrl}，Basic Auth 凭证可能被明文传输`,
    )
  }

  let sessionPromise: Promise<JmapSession> | null = null

  async function getSession(): Promise<JmapSession> {
    if (!sessionPromise) {
      const pending = fetchSession()
      sessionPromise = pending
      // 失败不缓存：否则凭证修正后同一 client 永远无法恢复。
      pending.catch(() => {
        if (sessionPromise === pending) sessionPromise = null
      })
    }
    return sessionPromise
  }

  async function fetchSession(): Promise<JmapSession> {
    const url = `${baseUrl.replace(/\/+$/, '')}/.well-known/jmap`
    let res: Response
    try {
      res = await fetchImpl(url, { headers: { Authorization: authHeader } })
    } catch (err) {
      // AUDIT-17: 错误信息不暴露 baseUrl（可能含内网地址/端口），仅 console.warn 供调试。
      // 底层 err.message（如 "Failed to fetch"）不含 baseUrl 与密码，可保留以辅助排障。
      console.warn('JMAP 连接失败, baseUrl=', baseUrl, 'err=', (err as Error).message)
      throw new JmapError(`无法连接 JMAP 服务器: ${(err as Error).message}`)
    }
    if (res.status === 401) {
      throw new JmapError('JMAP 认证失败（401）：用户名或密码错误', 401)
    }
    if (!res.ok) {
      throw new JmapError(`获取 JMAP session 失败：HTTP ${res.status}`, res.status)
    }
    return (await res.json()) as JmapSession
  }

  async function getAccountId(): Promise<string> {
    const session = await getSession()
    const mailAccount = session.primaryAccounts?.[JMAP_MAIL]
    if (mailAccount && session.accounts?.[mailAccount]) return mailAccount
    const first = Object.keys(session.accounts ?? {})[0]
    if (first) return first
    throw new JmapError(`用户 ${username} 没有可用的邮件账号（session 中无 accountId）`)
  }

  async function getDownloadUrl(): Promise<string> {
    const session = await getSession()
    if (!session.downloadUrl) {
      throw new JmapError('JMAP session 中缺少 downloadUrl')
    }
    return session.downloadUrl
  }

  /**
   * 核心 JMAP 调用：POST apiUrl，返回 methodResponses。
   * HTTP 非 200、响应中首个 error 响应都会转为 JmapError。
   */
  async function call(methodCalls: MethodCall[]): Promise<MethodResponse[]> {
    const session = await getSession()
    const accountId = await getAccountId()
    const body = {
      using: [JMAP_CORE, JMAP_MAIL, JMAP_SUBMISSION],
      methodCalls: methodCalls.map(([name, args, tag]) => [
        name,
        { accountId, ...args },
        tag,
      ]),
    }
    let res: Response
    try {
      res = await fetchImpl(session.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      throw new JmapError(`JMAP API 请求失败: ${(err as Error).message}`)
    }
    if (res.status === 401) {
      throw new JmapError('JMAP 认证失败（401）：用户名或密码错误', 401)
    }
    if (!res.ok) {
      throw new JmapError(`JMAP API 请求失败：HTTP ${res.status}`, res.status)
    }
    const data = (await res.json()) as { methodResponses: MethodResponse[] }
    for (const [name, args] of data.methodResponses) {
      if (name === 'error') {
        throw new JmapError(
          `JMAP 方法错误（${args.type ?? 'unknown'}）: ${args.description ?? '无描述'}`,
          undefined,
          args.type as string | undefined,
        )
      }
    }
    return data.methodResponses
  }

  /** 从 methodResponses 里按 tag 取指定方法的参数对象。 */
  function responseFor(
    responses: MethodResponse[],
    method: string,
    tag: string,
  ): Record<string, unknown> {
    const found = responses.find(([name, , t]) => name === method && t === tag)
    if (!found) {
      throw new JmapError(`JMAP 响应缺少 ${method}（tag=${tag}）`)
    }
    return found[1]
  }

  async function getMailboxIdByRole(role: string): Promise<string> {
    const responses = await call([
      ['Mailbox/query', { filter: { role } }, 'mb'],
    ])
    const result = responseFor(responses, 'Mailbox/query', 'mb') as { ids: string[] }
    if (!result.ids.length) {
      throw new JmapError(`找不到 role=${role} 的邮箱（mailbox）`)
    }
    // noUncheckedIndexedAccess: 上方 length 检查保证 ids[0] 存在
    return result.ids[0]!
  }

  async function queryInboxIds(limit = 50): Promise<string[]> {
    const inboxId = await getMailboxIdByRole('inbox')
    const responses = await call([
      [
        'Email/query',
        {
          filter: { inMailbox: inboxId },
          sort: [{ property: 'receivedAt', isAscending: false }],
          limit,
        },
        'q',
      ],
    ])
    const result = responseFor(responses, 'Email/query', 'q') as { ids: string[] }
    return result.ids
  }

  const SUMMARY_PROPERTIES = ['id', 'subject', 'from', 'receivedAt', 'preview', 'keywords']

  interface RawEmail {
    id: string
    subject?: string
    from?: EmailAddress[]
    to?: EmailAddress[]
    receivedAt?: string
    preview?: string
    keywords?: Record<string, boolean>
    textBody?: { partId: string }[]
    bodyValues?: Record<string, { value: string }>
  }

  function toSummary(raw: RawEmail): EmailSummary {
    return {
      id: raw.id,
      subject: raw.subject ?? '',
      from: raw.from ?? [],
      receivedAt: raw.receivedAt ?? '',
      preview: raw.preview ?? '',
      keywords: raw.keywords ?? {},
    }
  }

  async function listInbox(limit = 50): Promise<EmailSummary[]> {
    const ids = await queryInboxIds(limit)
    if (!ids.length) return []
    const responses = await call([
      ['Email/get', { ids, properties: SUMMARY_PROPERTIES }, 'g'],
    ])
    const result = responseFor(responses, 'Email/get', 'g') as { list: RawEmail[] }
    return result.list.map(toSummary)
  }

  async function getEmails(ids: string[]): Promise<EmailDetail[]> {
    if (!ids.length) return []
    const responses = await call([
      [
        'Email/get',
        {
          ids,
          properties: [...SUMMARY_PROPERTIES, 'to', 'textBody', 'bodyValues'],
          bodyProperties: ['partId'],
          fetchTextBodyValues: true,
        },
        'g',
      ],
    ])
    const result = responseFor(responses, 'Email/get', 'g') as {
      list: RawEmail[]
      notFound: string[]
    }
    if (result.notFound?.length) {
      throw new JmapError(`邮件不存在或无权访问：${result.notFound.join(', ')}`)
    }
    return result.list.map((raw) => {
      const partId = raw.textBody?.[0]?.partId
      const text = partId ? (raw.bodyValues?.[partId]?.value ?? '') : ''
      return { ...toSummary(raw), to: raw.to ?? [], text }
    })
  }

  async function sendEmail(input: SendMessageInput): Promise<void> {
    // 先取发信身份（identity 里的 email 即当前用户地址，避免硬编码域名）。
    const identityResponses = await call([['Identity/get', { ids: null }, 'i']])
    const identities = responseFor(identityResponses, 'Identity/get', 'i') as {
      list: { id: string; email: string }[]
    }
    const identity = identities.list[0]
    if (!identity) {
      throw new JmapError(`用户 ${username} 没有可用的发信身份（Identity）`)
    }

    const draftsId = await getMailboxIdByRole('drafts')
    const responses = await call([
      [
        'Email/set',
        {
          create: {
            draft: {
              mailboxIds: { [draftsId]: true },
              keywords: { $draft: true },
              from: [{ email: identity.email }],
              to: input.to.map((email) => ({ email })),
              subject: input.subject,
              textBody: [{ partId: 'text', type: 'text/plain' }],
              bodyValues: { text: { value: input.text } },
            },
          },
        },
        's',
      ],
      [
        'EmailSubmission/set',
        {
          onSuccessDestroyEmail: ['#send'],
          create: {
            send: {
              identityId: identity.id,
              emailId: '#draft',
            },
          },
        },
        'sub',
      ],
    ])

    const setResult = responseFor(responses, 'Email/set', 's') as {
      created?: Record<string, unknown>
      notCreated?: Record<string, { type: string; description?: string }>
    }
    const notCreated = setResult.notCreated?.draft
    if (notCreated) {
      throw new JmapError(
        `创建草稿失败（${notCreated.type}）: ${notCreated.description ?? '无描述'}`,
        undefined,
        notCreated.type,
      )
    }

    const subResult = responseFor(responses, 'EmailSubmission/set', 'sub') as {
      notCreated?: Record<string, { type: string; description?: string }>
    }
    const subFailed = subResult.notCreated?.send
    if (subFailed) {
      throw new JmapError(
        `发送失败（${subFailed.type}）: ${subFailed.description ?? '无描述'}`,
        undefined,
        subFailed.type,
      )
    }
  }

  async function deleteEmails(ids: string[]): Promise<void> {
    if (!ids.length) return
    const responses = await call([['Email/set', { destroy: ids }, 'd']])
    const result = responseFor(responses, 'Email/set', 'd') as {
      notDestroyed?: Record<string, { type: string; description?: string }>
    }
    const failed = Object.entries(result.notDestroyed ?? {})
    if (failed.length) {
      // noUncheckedIndexedAccess: 上方 length 检查保证 failed[0] 存在
      const [id, err] = failed[0]!
      throw new JmapError(
        `删除邮件 ${id} 失败（${err.type}）: ${err.description ?? '无描述'}`,
        undefined,
        err.type,
      )
    }
  }

  async function markAsRead(ids: string[]): Promise<void> {
    if (!ids.length) return
    const update: Record<string, { keywords: Record<string, boolean> }> = {}
    for (const id of ids) {
      update[id] = { keywords: { $seen: true } }
    }
    await call([['Email/set', { update }, 'mr']])
  }

  return {
    getSession,
    getAccountId,
    getDownloadUrl,
    queryInboxIds,
    listInbox,
    getEmails,
    sendEmail,
    deleteEmails,
    markAsRead,
  }
}
