import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  // Production serves the admin panel from bunyodjonov.uz/admin/
  base: mode === 'production' ? '/admin/' : '/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        // 127.0.0.1 (not localhost): the API binds IPv4 only; on Node 18+ `localhost`
        // can resolve to ::1 first and Vite's proxy won't fall back → ECONNREFUSED.
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
}))
