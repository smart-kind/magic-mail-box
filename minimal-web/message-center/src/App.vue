<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1>消息中心</h1>
      <nav>
        <RouterLink to="/inbox">收件箱</RouterLink>
        <RouterLink to="/compose">发消息</RouterLink>
        <RouterLink to="/login">登录</RouterLink>
      </nav>
    </header>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: system-ui, -apple-system, 'PingFang SC', sans-serif;
  color: #1f2329;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #e5e6eb;
}

.app-header h1 {
  margin: 0;
  font-size: 1.1rem;
}

.app-header nav {
  display: flex;
  gap: 1rem;
}

.app-header nav a {
  color: #4e5969;
  text-decoration: none;
}

.app-header nav a.router-link-active {
  color: #165dff;
  font-weight: 600;
}

main {
  padding: 1.25rem;
}
</style>
