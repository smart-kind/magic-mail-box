// TEST tests/structured-body.test.ts — 验证 JSON 结构化正文检测规则
// SCOPE: src/utils/structuredBody.ts 的 parseStructuredBody（正文是否整段为 JSON
//        对象/数组的判定与解析）
// ENV: 纯函数，无网络、无 DOM、无时间依赖；输入为内存字符串。
// GATES: 通过则证明——JSON 对象/数组（含嵌套、含空白包裹）被解析为对应值；
//        普通文本、形似 JSON 但非法的文本、纯量 JSON（数字/字符串/null）、
//        空串均返回 null（即按普通文本展示，不会误渲染为卡片）。
// RISK: 只测解析规则本身；详情页是否真的把返回值渲染成卡片不在本测试范围
//       （由 tests/message-detail.test.ts 覆盖）。
import { describe, it, expect } from 'vitest'
import { parseStructuredBody } from '../src/utils/structuredBody'

describe('parseStructuredBody', () => {
  it('parses a JSON object body', () => {
    const text = '{"type":"notice","title":"系统升级","payload":{"level":2}}'
    expect(parseStructuredBody(text)).toEqual({
      type: 'notice',
      title: '系统升级',
      payload: { level: 2 },
    })
  })

  it('parses a JSON array body', () => {
    expect(parseStructuredBody('[1, "two", {"three": 3}]')).toEqual([1, 'two', { three: 3 }])
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseStructuredBody('  \n {"a": true} \t')).toEqual({ a: true })
  })

  it('returns null for plain text', () => {
    expect(parseStructuredBody('明天上午十点开会，请准时参加。')).toBeNull()
  })

  it('returns null for text that merely contains JSON', () => {
    expect(parseStructuredBody('配置如下：{"a":1} 请查收')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseStructuredBody('{"a": 1,')).toBeNull()
    expect(parseStructuredBody('{not json}')).toBeNull()
  })

  it('returns null for scalar JSON (not structured content)', () => {
    expect(parseStructuredBody('42')).toBeNull()
    expect(parseStructuredBody('"hello"')).toBeNull()
    expect(parseStructuredBody('null')).toBeNull()
  })

  it('returns null for empty body', () => {
    expect(parseStructuredBody('')).toBeNull()
    expect(parseStructuredBody('   ')).toBeNull()
  })
})
