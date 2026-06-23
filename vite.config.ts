import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function bypassSpaNavigation(req: import('http').IncomingMessage): string | undefined {
  return req.headers.accept?.includes('text/html') ? '/index.html' : undefined
}

export default defineConfig({
  root: 'src/ui',
  // Relative asset paths so the built HTML loads correctly from file://
  // in the Electron shell as well as from a standard web server.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/accounts': { target: 'http://127.0.0.1:3000', changeOrigin: true, bypass: bypassSpaNavigation },
      '/entries': { target: 'http://127.0.0.1:3000', changeOrigin: true, bypass: bypassSpaNavigation },
      '/reports': { target: 'http://127.0.0.1:3000', changeOrigin: true, bypass: bypassSpaNavigation },
      '/settings': { target: 'http://127.0.0.1:3000', changeOrigin: true, bypass: bypassSpaNavigation },
      '/recurring': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/periods': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/health': 'http://localhost:3000',
      '/auth': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/audit': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/bank-feed': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/plugins': { target: 'http://127.0.0.1:3000', changeOrigin: true },
      '/reconciliation': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
  },
})
