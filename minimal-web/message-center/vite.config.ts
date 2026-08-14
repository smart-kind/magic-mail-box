import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base: './' keeps built assets relative so the app can be embedded in an
// iframe by the host demo from any path.
export default defineConfig({
  base: './',
  plugins: [vue()],
})
