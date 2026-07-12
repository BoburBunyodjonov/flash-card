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
        // The SW is scoped to the whole origin — without this it hijacks
        // /admin (the admin panel SPA) and serves the web app instead
        navigateFallbackDenylist: [/^\/admin/, /^\/api/],
        runtimeCaching: [
          {
            // Same-origin API GETs (feed, categories, progress…) — fresh when online,
            // cached fallback when offline
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
            },
          },
          {
            // Word audio files — cache-first, they never change
            urlPattern: ({ request }) => request.destination === 'audio',
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 86400 },
            },
          },
          {
            // Word images from any origin
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 86400 },
            },
          },
        ],
      },
      manifest: {
        name: 'WordSwipe',
        short_name: 'WordSwipe',
        description: 'Learn vocabulary with swipe',
        theme_color: '#F3F6F4',
        background_color: '#F3F6F4',
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
        // Speaking practice WebSocket (/api/speaking/ws) goes through the same proxy
        ws: true,
      },
    },
  },
})
