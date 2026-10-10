import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev proxy to the OptiScript compiler API (server.js, Week 7) —
    // avoids needing a `cors` package on the backend at all: the
    // browser only ever talks to :5173, and Vite forwards /compile and
    // /health to :4000 behind the scenes.
    proxy: {
      '/compile': 'http://localhost:4000',
      '/health': 'http://localhost:4000',
    },
  },
})
