// 结构化正文检测：把「整段正文是 JSON 对象/数组」的邮件识别出来，供详情页
// 渲染为结构化卡片。规则刻意保持简单（first-plan.md 待确认事项：先做最简单的
// JSON → 卡片展示），不引入 JSON Schema。

/** 合法的 JSON 值（递归定义）。 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

// AUDIT-27：正文长度上限 1MB。超过则不尝试 JSON.parse，直接返回 null（按纯文本
// 展示），避免超大正文触发 JSON.parse 长时间阻塞主线程或耗尽内存。
const MAX_STRUCTURED_BODY_SIZE = 1024 * 1024

/**
 * 若 text 整段是一个 JSON 对象或数组，返回解析后的值；否则返回 null。
 * 纯量 JSON（如正文只有 `42` 或 `"hi"`）不算结构化内容，按普通文本展示。
 * 超过 MAX_STRUCTURED_BODY_SIZE 的正文直接返回 null，不调 JSON.parse。
 */
export function parseStructuredBody(text: string): JsonValue | null {
  if (text.length > MAX_STRUCTURED_BODY_SIZE) return null
  const trimmed = text.trim()
  if (!trimmed) return null
  const looksObject = trimmed.startsWith('{') && trimmed.endsWith('}')
  const looksArray = trimmed.startsWith('[') && trimmed.endsWith(']')
  if (!looksObject && !looksArray) return null
  try {
    const value: unknown = JSON.parse(trimmed)
    if (value === null || typeof value !== 'object') return null
    return value as JsonValue
  } catch {
    return null
  }
}
