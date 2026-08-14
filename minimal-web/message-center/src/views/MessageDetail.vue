<script setup lang="ts">
import { useRoute } from 'vue-router'

// 消息详情占位页。正式实现见 minimal-web/docs/first-plan.md「消息详情」。
const route = useRoute()
</script>

<template>
  <section>
    <h2>消息详情</h2>
    <p>消息 ID：{{ route.params.id }}</p>
    <p>接入 JMAP 客户端后，这里将展示消息完整内容（JSON 内容将渲染为结构化卡片）。</p>
  </section>
</template>
