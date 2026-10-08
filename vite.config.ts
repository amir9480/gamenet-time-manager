import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// The desktop (Tauri) build serves from `/` and needs no service worker; the GitHub Pages
// build sets BASE_PATH (e.g. `/gamenet/`) in the deploy workflow.
const isTauri = !!process.env.TAURI_ENV_PLATFORM

// https://vite.dev/config/
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  // package.json is the single version source: the release workflow sets it from the git tag, and
  // the Tauri config reads it too, so web, desktop and footer always agree.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: isTauri,
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'نرم افزار مدیریت زمان گیم نت',
        short_name: 'گیم نت',
        description: 'مدیریت زمان و هزینه‌ی تایم‌های گیم نت',
        lang: 'fa',
        dir: 'rtl',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        // Launching the installed app again focuses its open window (Chromium).
        launch_handler: { client_mode: ['focus-existing', 'auto'] },
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything (incl. every lazy Lucide icon chunk): old hashed chunks vanish from
        // the server on each deploy, so a runtime-cached chunk that was never fetched would 404.
        globPatterns: ['**/*.{html,css,woff2,svg,png,js}'],
        // The social-preview banner (index.html og:image, README) is never shown in the app.
        globIgnores: ['img/**'],
        navigateFallback: 'index.html',
        // Notification click handler for the time-limit alert (see src/lib/attention.ts).
        importScripts: ['notification-click.js'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // Served unbundled: pre-bundling would pull all ~1,850 lazy icon modules into the dep cache.
  optimizeDeps: { exclude: ['lucide-react/dynamic'] },
  clearScreen: false,
  server: { host: '0.0.0.0', port: 3000, strictPort: true },
})
