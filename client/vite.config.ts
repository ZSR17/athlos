import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Athlos',
        short_name: 'Athlos',
        description: "Suivi d'entraînement",
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        background_color: '#0E1012',
        theme_color: '#0E1012',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // End-of-rest notifications (public/push-sw.js).
        importScripts: ['push-sw.js'],
        navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // Media files are content-addressed and immutable: once cached, never refetched.
            urlPattern: ({ url }) => url.pathname.startsWith('/media/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'media',
              expiration: { maxEntries: 4000 },
              cacheableResponse: { statuses: [200] },
              // Safari asks videos by byte ranges, even from the cache.
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': API_TARGET,
      '/media': API_TARGET,
    },
  },
});
