// ============================================================
// SECURITY: demo-only, not for production
// ------------------------------------------------------------
// 本文件根据用户名「派生」密码，算法公开且确定性：
// 任何知道用户名的人都能算出其邮箱口令并登录，等同于无密码保护。
// 这是有意为之的本地联调取舍，仅限 magic-mail-box 本机演示使用，
// 严禁用于任何对外 / 生产环境。
// 若需走向非本机环境，应改为随机强口令 + 安全渠道交付（见审计报告 AUDIT-03）。
// ============================================================

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
  // SECURITY: 返回值可由 username 公开推导，仅限本地演示（见文件顶部警示）
  // demo001 ~ demo999 保持原格式 Demo001!Mc7
  const m = username.match(/^demo(\d{3})$/i)
  if (m) {
    return 'Demo' + m[1] + SUFFIX
  }
  // 其他用户名走哈希
  return simpleHash('magic-mailbox' + username) + SUFFIX
}
