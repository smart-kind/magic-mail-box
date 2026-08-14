<script setup lang="ts">
// 登录页：正式实现时由宿主通过 URL 参数传入凭证并自动完成 JMAP basic auth，
// 见 minimal-web/docs/first-plan.md「登录」一节。当前为占位页。
</script>

<template>
  <section>
    <h2>登录</h2>
    <p>消息中心由宿主系统通过 URL 参数自动登录，无需手动输入账号密码。</p>
    <p>（自动登录逻辑将在 JMAP 客户端实现后接入。）</p>
  </section>
</template>
