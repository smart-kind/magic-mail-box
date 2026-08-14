// TEST tests/demo-users.test.ts — 验证 demo 用户列表的默认生成与 localStorage 覆盖
// SCOPE: src/data/demoUsers.ts（demoName 命名规则；defaultDemoUsers 生成
//        demo001~demo100@local.test；loadDemoUsers 的 localStorage 覆盖、
//        非法内容回退、无 storage 回退）
// ENV: 纯函数单测，无 DOM/网络；storage 用内存 fake（getItem vi.fn）。
// GATES: 通过则证明——默认列表恰好 100 个、命名/邮箱格式与 host-demo 批量
//        创建规则一致；storage 中合法 JSON 列表会覆盖默认值；JSON 损坏、结构
//        非法、空数组、storage 不可用时都回退默认列表。
// RISK: 只验证数据模块本身；Compose 页真正使用 localStorage 的路径由
//       tests/compose.test.ts 间接覆盖（视图挂载时会读取默认列表）。
import { describe, it, expect, vi } from 'vitest'
import {
  demoName,
  defaultDemoUsers,
  loadDemoUsers,
  DEMO_USERS_STORAGE_KEY,
} from '../src/data/demoUsers'

function fakeStorage(value: string | null) {
  return { getItem: vi.fn(() => value) }
}

describe('demoUsers data', () => {
  it('generates padded names demo001 ~ demo100', () => {
    expect(demoName(1)).toBe('demo001')
    expect(demoName(42)).toBe('demo042')
    expect(demoName(100)).toBe('demo100')
  })

  it('builds 100 default users on the local.test domain', () => {
    const users = defaultDemoUsers()
    expect(users).toHaveLength(100)
    expect(users[0]).toEqual({ name: 'demo001', email: 'demo001@local.test' })
    expect(users[99]).toEqual({ name: 'demo100', email: 'demo100@local.test' })
  })

  it('uses the localStorage override when it contains a valid list', () => {
    const custom = [{ name: 'alice', email: 'alice@example.com' }]
    const storage = fakeStorage(JSON.stringify(custom))
    expect(loadDemoUsers(storage)).toEqual(custom)
    expect(storage.getItem).toHaveBeenCalledWith(DEMO_USERS_STORAGE_KEY)
  })

  it.each([
    ['broken JSON', '{not json'],
    ['non-array JSON', '"hello"'],
    ['array without valid entries', JSON.stringify([{ foo: 1 }, null])],
    ['empty array', '[]'],
  ])('falls back to defaults when the override is %s', (_label, raw) => {
    expect(loadDemoUsers(fakeStorage(raw))).toEqual(defaultDemoUsers())
  })

  it('falls back to defaults when storage is missing or empty', () => {
    expect(loadDemoUsers(null)).toEqual(defaultDemoUsers())
    expect(loadDemoUsers(fakeStorage(null))).toEqual(defaultDemoUsers())
  })
})
