import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'src/ui',
  // Relative asset paths so the built HTML loads correctly from file://
  // in the Electron shell as well as from a standard web server.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/accounts': 'http://localhost:3000',
      '/entries': 'http://localhost:3000',
      '/reports': 'http://localhost:3000',
      '/settings': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
  },
})
