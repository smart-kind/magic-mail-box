// 结构化正文检测：把「整段正文是 JSON 对象/数组」的邮件识别出来，供详情页
// 渲染为结构化卡片。规则刻意保持简单（first-plan.md 待确认事项：先做最简单的
// JSON → 卡片展示），不引入 JSON Schema。

/** 合法的 JSON 值（递归定义）。 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/**
 * 若 text 整段是一个 JSON 对象或数组，返回解析后的值；否则返回 null。
 * 纯量 JSON（如正文只有 `42` 或 `"hi"`）不算结构化内容，按普通文本展示。
 */
export function parseStructuredBody(text: string): JsonValue | null {
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
