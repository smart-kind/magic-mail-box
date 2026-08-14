// TEST tests/jmap.test.ts — 验证 JMAP 客户端封装的协议交互与错误处理
// SCOPE: src/api/jmap.ts（createJmapClient: getSession/getAccountId/getDownloadUrl/
//        queryInboxIds/listInbox/getEmails/sendEmail/deleteEmails + basicAuthHeader/JmapError）
// ENV: 无网络——通过 fetchImpl 注入假 fetch，按 URL 和 methodCalls 路由到内存 fixture；
//      假 session 的 accountId 为 "a1"，inbox mailbox 为 "mb-inbox"，drafts 为 "mb-drafts"。
// GATES: 通过则证明——Basic Auth 头格式正确；session 发现走 /.well-known/jmap 且能提取
//        accountId/downloadUrl；Email/query|get|set、EmailSubmission/set 的请求体符合
//        JMAP（RFC 8620/8621）结构；401/500/无 accountId/方法级 error 均抛出 JmapError
//        且错误信息不含密码。
// RISK: mock 按「客户端发出的请求」回包，如果客户端构造了结构合法但语义错误的请求
//       （如查错 mailbox、用错 identity），测试无法发现；未覆盖真实 Stalwart 的
//       边界行为（分页、大附件、HTML-only 邮件）。
import { describe, it, expect } from 'vitest'
import {
  createJmapClient,
  basicAuthHeader,
  JmapError,
  type JmapSession,
} from '../src/api/jmap'

const USERNAME = 'demo001'
const PASSWORD = 'Sup3rSecret!'
const BASE_URL = 'http://stalwart.test'

const sessionFixture: JmapSession = {
  apiUrl: 'http://stalwart.test/jmap/api',
  downloadUrl: 'http://stalwart.test/jmap/download/{accountId}/{blobId}/{name}',
  uploadUrl: 'http://stalwart.test/jmap/upload/{accountId}',
  accounts: { a1: { name: 'demo001' } },
  primaryAccounts: { 'urn:ietf:params:jmap:mail': 'a1' },
  username: 'demo001',
  state: 's0',
}

interface RecordedCall {
  url: string
  method: string
  auth?: string
  body?: {
    using: string[]
    methodCalls: [string, Record<string, unknown>, string][]
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type ApiHandler = (
  calls: [string, Record<string, unknown>, string][],
) => [string, Record<string, unknown>, string][]

/** 构造一个假 fetch：session 端点返回 fixture，API 端点交给 handler。 */
function makeFakeFetch(opts: {
  recorded: RecordedCall[]
  sessionStatus?: number
  sessionBody?: unknown
  onApi?: ApiHandler
}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    const rec: RecordedCall = {
      url,
      method: init?.method ?? 'GET',
      auth: headers['Authorization'],
    }
    opts.recorded.push(rec)
    if (url.endsWith('/.well-known/jmap')) {
      if (opts.sessionStatus && opts.sessionStatus !== 200) {
        return jsonResponse({ error: 'fail' }, opts.sessionStatus)
      }
      return jsonResponse(opts.sessionBody ?? sessionFixture)
    }
    const parsed = JSON.parse(String(init?.body)) as RecordedCall['body']
    rec.body = parsed
    const responses =
      opts.onApi?.(parsed!.methodCalls) ??
      parsed!.methodCalls.map(([name, , tag]) => [
        'error',
        { type: 'unknownMethod', description: `no handler for ${name}` },
        tag,
      ])
    return jsonResponse({
      sessionState: 's0',
      methodResponses: responses,
    })
  }) as typeof fetch
}

function makeClient(overrides: {
  recorded: RecordedCall[]
  sessionStatus?: number
  sessionBody?: unknown
  onApi?: ApiHandler
}) {
  return createJmapClient({
    baseUrl: BASE_URL,
    username: USERNAME,
    password: PASSWORD,
    fetchImpl: makeFakeFetch(overrides),
  })
}

/** 通用假 API：按方法名回包，覆盖大多数正常流程。 */
function defaultApiHandler(
  calls: [string, Record<string, unknown>, string][],
): [string, Record<string, unknown>, string][] {
  return calls.map(([name, , tag]) => {
    switch (name) {
      case 'Mailbox/query':
        return [name, { ids: ['mb-inbox'] }, tag]
      case 'Email/query':
        return [name, { ids: ['e1', 'e2'] }, tag]
      case 'Email/get':
        return [
          name,
          {
            list: [
              {
                id: 'e1',
                subject: 'Hello',
                from: [{ email: 'demo002@local.test' }],
                to: [{ email: 'demo001@local.test' }],
                receivedAt: '2026-08-14T01:00:00Z',
                preview: 'hi',
                textBody: [{ partId: 'p1' }],
                bodyValues: { p1: { value: 'hello body' } },
              },
            ],
            notFound: [],
          },
          tag,
        ]
      case 'Identity/get':
        return [name, { list: [{ id: 'id-1', email: 'demo001@local.test' }] }, tag]
      case 'Email/set':
        return [name, { created: { draft: { id: 'e-new' } }, destroyed: [] }, tag]
      case 'EmailSubmission/set':
        return [name, { created: { send: { id: 'sub-1' } } }, tag]
      default:
        return ['error', { type: 'unknownMethod' }, tag]
    }
  }) as [string, Record<string, unknown>, string][]
}

describe('basicAuthHeader', () => {
  it('builds a standards-compliant Basic header', () => {
    expect(basicAuthHeader('demo001', 'Demo001!')).toBe(
      `Basic ${btoa('demo001:Demo001!')}`,
    )
  })
})

describe('session discovery', () => {
  it('fetches /.well-known/jmap with Basic Auth and extracts accountId + downloadUrl', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({ recorded, onApi: defaultApiHandler })

    expect(await client.getAccountId()).toBe('a1')
    expect(await client.getDownloadUrl()).toBe(sessionFixture.downloadUrl)

    expect(recorded).toHaveLength(1)
    expect(recorded[0].url).toBe('http://stalwart.test/.well-known/jmap')
    expect(recorded[0].method).toBe('GET')
    expect(recorded[0].auth).toBe(basicAuthHeader(USERNAME, PASSWORD))
  })

  it('caches the session across multiple calls', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({ recorded, onApi: defaultApiHandler })
    await client.getSession()
    await client.getSession()
    await client.getAccountId()
    expect(recorded.filter((c) => c.url.includes('.well-known'))).toHaveLength(1)
  })

  it('throws JmapError(401) on bad credentials without leaking the password', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({ recorded, sessionStatus: 401 })
    const err = await client.getSession().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(JmapError)
    expect((err as JmapError).status).toBe(401)
    expect((err as JmapError).message).not.toContain(PASSWORD)
  })

  it('throws JmapError when the session has no mail account', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({
      recorded,
      sessionBody: { ...sessionFixture, accounts: {}, primaryAccounts: {} },
    })
    const err = await client.getAccountId().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(JmapError)
    expect((err as JmapError).message).toContain(USERNAME)
    expect((err as JmapError).message).not.toContain(PASSWORD)
  })

  it('throws JmapError on HTTP 500 from the session endpoint', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({ recorded, sessionStatus: 500 })
    const err = await client.getSession().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(JmapError)
    expect((err as JmapError).status).toBe(500)
  })
})

describe('queryInboxIds', () => {
  it('resolves the inbox mailbox by role, then queries emails sorted by receivedAt desc', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({ recorded, onApi: defaultApiHandler })

    const ids = await client.queryInboxIds()
    expect(ids).toEqual(['e1', 'e2'])

    const apiCalls = recorded.filter((c) => c.body)
    expect(apiCalls).toHaveLength(2)

    const [mbName, mbArgs, mbTag] = apiCalls[0].body!.methodCalls[0]
    expect(mbName).toBe('Mailbox/query')
    expect(mbTag).toBe('mb')
    expect(mbArgs.accountId).toBe('a1')
    expect(mbArgs.filter).toEqual({ role: 'inbox' })

    const [qName, qArgs] = apiCalls[1].body!.methodCalls[0]
    expect(qName).toBe('Email/query')
    expect(qArgs.filter).toEqual({ inMailbox: 'mb-inbox' })
    expect(qArgs.sort).toEqual([{ property: 'receivedAt', isAscending: false }])
    expect(qArgs.accountId).toBe('a1')

    expect(apiCalls[0].auth).toBe(basicAuthHeader(USERNAME, PASSWORD))
    expect(apiCalls[0].body!.using).toContain('urn:ietf:params:jmap:mail')
  })

  it('throws when there is no inbox mailbox', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({
      recorded,
      onApi: (calls) =>
        calls.map(([name, , tag]) => [name, { ids: [] }, tag]) as [
          string,
          Record<string, unknown>,
          string,
        ][],
    })
    await expect(client.queryInboxIds()).rejects.toThrow(/mailbox/)
  })
})

describe('getEmails', () => {
  it('returns full email details with body text resolved from bodyValues', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({ recorded, onApi: defaultApiHandler })

    const emails = await client.getEmails(['e1'])
    expect(emails).toHaveLength(1)
    expect(emails[0]).toMatchObject({
      id: 'e1',
      subject: 'Hello',
      text: 'hello body',
    })

    const [, args] = recorded.at(-1)!.body!.methodCalls[0]
    expect(args.ids).toEqual(['e1'])
    expect(args.fetchTextBodyValues).toBe(true)
  })

  it('throws a clear error when some ids are not found', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({
      recorded,
      onApi: (calls) =>
        calls.map(([name, , tag]) => [
          name,
          { list: [], notFound: ['e-gone'] },
          tag,
        ]) as [string, Record<string, unknown>, string][],
    })
    await expect(client.getEmails(['e-gone'])).rejects.toThrow(/e-gone/)
  })

  it('surfaces method-level JMAP errors as JmapError with type', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({
      recorded,
      onApi: (calls) =>
        calls.map(([, , tag]) => [
          'error',
          { type: 'invalidArguments', description: 'bad ids' },
          tag,
        ]) as [string, Record<string, unknown>, string][],
    })
    const err = await client.getEmails(['e1']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(JmapError)
    expect((err as JmapError).type).toBe('invalidArguments')
    expect((err as JmapError).message).not.toContain(PASSWORD)
  })
})

describe('listInbox', () => {
  it('returns summaries and skips Email/get when inbox is empty', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({
      recorded,
      onApi: (calls) =>
        calls.map(([name, , tag]) =>
          name === 'Email/query'
            ? [name, { ids: [] }, tag]
            : [name, { ids: ['mb-inbox'] }, tag],
        ) as [string, Record<string, unknown>, string][],
    })
    const list = await client.listInbox()
    expect(list).toEqual([])
    const methods = recorded.flatMap((c) => c.body?.methodCalls.map(([n]) => n) ?? [])
    expect(methods).not.toContain('Email/get')
  })

  it('requests keywords and maps them onto summaries (absent → {})', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({
      recorded,
      onApi: (calls) =>
        calls.map(([name, , tag]) => {
          if (name === 'Email/get') {
            return [
              name,
              {
                list: [
                  { id: 'e1', subject: 'read', keywords: { $seen: true } },
                  { id: 'e2', subject: 'unread' },
                ],
                notFound: [],
              },
              tag,
            ]
          }
          return defaultApiHandler([[name, {}, tag]])[0]
        }) as [string, Record<string, unknown>, string][],
    })

    const list = await client.listInbox()
    expect(list[0].keywords).toEqual({ $seen: true })
    expect(list[1].keywords).toEqual({})

    const getArgs = recorded
      .flatMap((c) => c.body?.methodCalls ?? [])
      .find(([n]) => n === 'Email/get')![1]
    expect(getArgs.properties).toContain('keywords')
  })
})

describe('sendEmail', () => {
  it('creates a draft and submits it via EmailSubmission/set', async () => {
    const recorded: RecordedCall[] = []
    const onApi: ApiHandler = (calls) =>
      calls.map(([name, , tag]) => {
        if (name === 'Mailbox/query') return [name, { ids: ['mb-drafts'] }, tag]
        return defaultApiHandler([[name, {}, tag]])[0]
      }) as [string, Record<string, unknown>, string][]
    const client = makeClient({ recorded, onApi })

    await client.sendEmail({
      to: ['demo002@local.test'],
      subject: 'hi',
      text: '{"kind":"notice"}',
    })

    const submissionCall = recorded
      .filter((c) => c.body)
      .map((c) => c.body!)
      .find((b) => b.methodCalls.some(([n]) => n === 'EmailSubmission/set'))!
    const [, emailSetArgs] = submissionCall.methodCalls.find(
      ([n]) => n === 'Email/set',
    )!
    const create = (emailSetArgs.create as Record<string, Record<string, unknown>>).draft
    expect(create.mailboxIds).toEqual({ 'mb-drafts': true })
    expect(create.keywords).toEqual({ $draft: true })
    expect(create.from).toEqual([{ email: 'demo001@local.test' }])
    expect(create.to).toEqual([{ email: 'demo002@local.test' }])
    expect(create.subject).toBe('hi')

    const [, subArgs] = submissionCall.methodCalls.find(
      ([n]) => n === 'EmailSubmission/set',
    )!
    const send = (subArgs.create as Record<string, Record<string, unknown>>).send
    expect(send.identityId).toBe('id-1')
    expect(send.emailId).toBe('#draft')
    expect(subArgs.onSuccessDestroyEmail).toEqual(['#send'])

    // Identity/get 与 EmailSubmission/set 需要 submission 能力，
    // 否则 Stalwart 报 unknownMethod（联调时发现的真实缺陷）。
    expect(submissionCall.using).toContain('urn:ietf:params:jmap:submission')
  })

  it('throws when EmailSubmission/set reports notCreated', async () => {
    const recorded: RecordedCall[] = []
    const onApi: ApiHandler = (calls) =>
      calls.map(([name, , tag]) => {
        if (name === 'EmailSubmission/set') {
          return [
            name,
            { notCreated: { send: { type: 'forbidden', description: 'relay denied' } } },
            tag,
          ]
        }
        if (name === 'Mailbox/query') return [name, { ids: ['mb-drafts'] }, tag]
        return defaultApiHandler([[name, {}, tag]])[0]
      }) as [string, Record<string, unknown>, string][]
    const client = makeClient({ recorded, onApi })

    const err = await client
      .sendEmail({ to: ['x@local.test'], subject: 's', text: 't' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(JmapError)
    expect((err as JmapError).type).toBe('forbidden')
    expect((err as JmapError).message).toContain('relay denied')
  })

  it('throws when the account has no identity', async () => {
    const recorded: RecordedCall[] = []
    const onApi: ApiHandler = (calls) =>
      calls.map(([name, , tag]) =>
        name === 'Identity/get' ? [name, { list: [] }, tag] : [name, {}, tag],
      ) as [string, Record<string, unknown>, string][]
    const client = makeClient({ recorded, onApi })
    await expect(
      client.sendEmail({ to: ['x@local.test'], subject: 's', text: 't' }),
    ).rejects.toThrow(/Identity/)
  })
})

describe('deleteEmails', () => {
  it('destroys the given ids via Email/set', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({ recorded, onApi: defaultApiHandler })

    await client.deleteEmails(['e1', 'e2'])

    const [name, args] = recorded.at(-1)!.body!.methodCalls[0]
    expect(name).toBe('Email/set')
    expect(args.destroy).toEqual(['e1', 'e2'])
    expect(args.accountId).toBe('a1')
  })

  it('throws when the server reports notDestroyed', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({
      recorded,
      onApi: (calls) =>
        calls.map(([name, , tag]) => [
          name,
          { notDestroyed: { e1: { type: 'notFound', description: 'already gone' } } },
          tag,
        ]) as [string, Record<string, unknown>, string][],
    })
    const err = await client.deleteEmails(['e1']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(JmapError)
    expect((err as JmapError).message).toContain('e1')
  })

  it('is a no-op for an empty id list', async () => {
    const recorded: RecordedCall[] = []
    const client = makeClient({ recorded, onApi: defaultApiHandler })
    await client.deleteEmails([])
    expect(recorded.filter((c) => c.body)).toHaveLength(0)
  })
})
