import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server runs on 5173 and proxies API + WebSocket to the Express backend on
// :3001 (moved off :3000 to avoid a port conflict with another local process).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: {
    // server/index.js serves this directly — one port for the whole app in normal use.
    // Rebuild after any UI change: `npm run build:web` from the repo root.
    outDir: 'dist',
  },
})
