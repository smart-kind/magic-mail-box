// TEST tests/derivePassword.test.ts — 验证演示用口令派生算法 derivePassword
// SCOPE: src/utils/derivePassword.ts（demoNNN 直通格式；其他用户名走 simpleHash
//        djb2 变体加盐 'magic-mailbox'；固定后缀 '!Mc7'；确定性；大小写无关前缀）
// ENV: 纯函数单测，无 DOM/网络/时间依赖。
// GATES: 通过则证明——demo001~demo999（含大小写前缀 Demo/DEMO 等）直通 'DemoNNN!Mc7'；
//        非 demo 用户名走哈希且确定性（同输入同输出），返回值恒为「非负整数 + !Mc7」；
//        空串、超长用户名、Unicode/空格/特殊字符均不抛错且保持格式；后缀固定。
// RISK: 算法本身可由用户名公开推导，等同无口令保护——此为本地演示取舍（AUDIT-03），
//       本测试只锁行为，不评估安全性。
// SECURITY: 此算法仅限本地演示，口令可公开推导（AUDIT-03）
import { describe, it, expect } from 'vitest'
import { derivePassword } from '../src/utils/derivePassword'

const SUFFIX = '!Mc7'

describe('derivePassword — demoNNN 直通格式', () => {
  it.each([
    ['demo001', 'Demo001!Mc7'],
    ['demo999', 'Demo999!Mc7'],
    ['demo000', 'Demo000!Mc7'],
    ['demo042', 'Demo042!Mc7'],
    ['Demo001', 'Demo001!Mc7'], // 大写前缀
    ['DEMO001', 'Demo001!Mc7'], // 全大写前缀
    ['DeMo042', 'Demo042!Mc7'], // 混合大小写前缀
  ])('derivePassword(%j) === %j', (input, expected) => {
    expect(derivePassword(input)).toBe(expected)
  })

  it('前缀 Demo 固定大写，数字部分原样保留', () => {
    // 正则 /i 使前缀大小写无关，但输出前缀恒为 'Demo'，数字保留输入的 3 位。
    expect(derivePassword('demo001')).toBe('Demo001!Mc7')
    expect(derivePassword('DEMO999')).toBe('Demo999!Mc7')
  })
})

describe('derivePassword — 非 demo 用户名走哈希', () => {
  // 盐为 'magic-mailbox'（无连字符），与源码一致；以下期望值由源码算法精确计算得出。
  it.each([
    ['alice', '2160991575!Mc7'],
    ['bob', '3323204474!Mc7'],
    ['demo', '1162614934!Mc7'], // 'demo' 无 3 位数字尾，走哈希
    ['demo1000', '3677955639!Mc7'], // 4 位数字不匹配 \d{3}
    ['demo01', '329685527!Mc7'], // 2 位数字
    ['demo001a', '2356602662!Mc7'], // 尾部多余字符
  ])('derivePassword(%j) === %j', (input, expected) => {
    expect(derivePassword(input)).toBe(expected)
  })

  it('返回值恒为「非负整数 + !Mc7」格式', () => {
    for (const name of ['alice', 'bob', 'demo', 'demo1000', '用户', 'a b', 'a@b', '<script>']) {
      expect(derivePassword(name)).toMatch(/^\d+!Mc7$/)
    }
  })

  it('确定性：同一输入多次调用结果一致', () => {
    const names = ['alice', 'bob', '', 'demo', 'demo001', 'a'.repeat(200), '用户', '<script>']
    for (const name of names) {
      const a = derivePassword(name)
      const b = derivePassword(name)
      const c = derivePassword(name)
      expect(a).toBe(b)
      expect(b).toBe(c)
    }
  })

  it('不同输入大概率产生不同输出（至少本组样本不碰撞）', () => {
    const names = ['alice', 'bob', 'carol', 'dave', 'eve', 'frank']
    const outs = new Set(names.map((n) => derivePassword(n)))
    expect(outs.size).toBe(names.length)
  })
})

describe('derivePassword — 固定后缀', () => {
  it('所有输出均以 !Mc7 结尾', () => {
    for (const name of ['demo001', 'demo999', 'alice', '', 'demo', 'a'.repeat(200), '用户']) {
      expect(derivePassword(name).endsWith(SUFFIX)).toBe(true)
    }
  })
})

describe('derivePassword — 边界', () => {
  it('空字符串不抛错且走哈希分支', () => {
    expect(derivePassword('')).toBe('3827604597!Mc7')
    expect(derivePassword('')).toMatch(/^\d+!Mc7$/)
  })

  it('超长用户名（200 字符）不抛错且保持格式', () => {
    const long = 'a'.repeat(200)
    expect(derivePassword(long)).toBe('3220430069!Mc7')
    expect(derivePassword(long)).toMatch(/^\d+!Mc7$/)
  })

  it.each([
    ['Unicode 用户名', '用户', '276860330!Mc7'],
    ['含空格', 'a b', '2319636374!Mc7'],
    ['含 @', 'a@b', '2810271734!Mc7'],
    ['含 HTML 片段', '<script>', '211860216!Mc7'],
  ])('特殊字符：%s 不抛错且保持格式', (_label, input, expected) => {
    expect(derivePassword(input)).toBe(expected)
  })
})