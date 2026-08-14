// JMAP 客户端封装（骨架）。与 Stalwart 的交互通过 HTTP Basic Auth + JMAP API，
// 具体查询/发送/删除操作在下一个任务中实现，见 minimal-web/docs/first-plan.md
// 「JMAP 客户端」一节，认证与调用模式参考 ../bulwark-webmail/。

/** 生成 HTTP Basic Auth 请求头值。 */
export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}
