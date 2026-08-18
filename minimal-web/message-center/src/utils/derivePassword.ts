// 根据用户名派生密码。
// demoNNN 格式保持与原批量创建一致（Demo001!Mc7），兼容存量用户。
// 其他用户名走简单哈希。

const SUFFIX = '!Mc7'

function simpleHash(text: string): string {
  let hash = 5381
  let i = text.length
  while (i) {
    hash = (hash * 33) ^ text.charCodeAt(--i)
  }
  return (hash >>> 0).toString()
}

export function derivePassword(username: string): string {
  // demo001 ~ demo999 保持原格式 Demo001!Mc7
  const m = username.match(/^demo(\d{3})$/i)
  if (m) {
    return 'Demo' + m[1] + SUFFIX
  }
  // 其他用户名走哈希
  return simpleHash('magic-mailbox' + username) + SUFFIX
}
