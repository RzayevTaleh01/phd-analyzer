import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5178,
    proxy: {
      '/api': { target: 'http://localhost:5179', changeOrigin: true },
    },
  },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
})
