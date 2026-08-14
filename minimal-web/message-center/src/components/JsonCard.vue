<script setup lang="ts">
// 递归键值对卡片：把 JSON 值渲染为结构化 UI。对象渲染为键值对列表，数组渲染为
// 列表，纯量直接显示文本。组件通过文件名 JsonCard 自引用实现递归。
defineProps<{ value: unknown }>()

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function primitiveText(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  return String(v)
}
</script>

<template>
  <dl v-if="isRecord(value)" class="json-card">
    <template v-if="Object.keys(value).length">
      <template v-for="(v, k) in value" :key="k">
        <dt class="json-key">{{ k }}</dt>
        <dd class="json-value"><JsonCard :value="v" /></dd>
      </template>
    </template>
    <p v-else class="json-empty">（空对象）</p>
  </dl>

  <ul v-else-if="Array.isArray(value)" class="json-array">
    <template v-if="value.length">
      <li v-for="(item, i) in value" :key="i"><JsonCard :value="item" /></li>
    </template>
    <li v-else class="json-empty">（空数组）</li>
  </ul>

  <span v-else class="json-primitive">{{ primitiveText(value) }}</span>
</template>

<style scoped>
.json-card {
  margin: 0;
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.35rem 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
}

.json-key {
  font-weight: 600;
  color: #1d2129;
  overflow-wrap: anywhere;
}

.json-value {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.json-array {
  margin: 0;
  padding-left: 1.25rem;
}

.json-array > li + li {
  margin-top: 0.35rem;
}

.json-primitive {
  overflow-wrap: anywhere;
}

.json-empty {
  margin: 0;
  color: #86909c;
}
</style>
