import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 10 },
          },
        ],
      },
      manifest: {
        name: 'WordSwipe',
        short_name: 'WordSwipe',
        description: 'Learn vocabulary with swipe',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    // ngrok / Cloudflare tunnel — URL har safar o'zgarishi mumkin
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.trycloudflare.com'],
    // Telegram uchun bitta ngrok (5173) yetadi — API localhost:3000 ga proxy
    proxy: {
      '/api': {
        // 127.0.0.1 (not localhost): the API binds IPv4 only; on Node 18+ `localhost`
        // can resolve to ::1 first and Vite's proxy won't fall back → ECONNREFUSED.
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
