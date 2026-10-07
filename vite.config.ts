import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // Served unbundled: pre-bundling would pull all ~1,850 lazy icon modules into the dep cache.
  optimizeDeps: { exclude: ['lucide-react/dynamic'] },
  clearScreen: false,
  server: { host: '0.0.0.0', port: 3000, strictPort: true },
})
