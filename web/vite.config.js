import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server runs on 5173 and proxies API + WebSocket to the existing Express
// backend on :3000, so the current server keeps running untouched while we build.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  build: {
    // Later (Phase 4) Express will serve this build. Kept separate from public/ for now.
    outDir: 'dist',
  },
})
