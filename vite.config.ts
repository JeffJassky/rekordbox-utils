import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  // Use repo path when building for GitHub Pages; defaults to '/' for local dev
  base: process.env.VITE_BASE ?? '/',
  plugins: [vue()],
})
