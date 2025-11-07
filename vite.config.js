import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import apiPlugin from './vite-plugin-api.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiPlugin()],
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove all console.* statements in production
        drop_debugger: true,
      },
    },
  },
  server: {
    proxy: {
      // Route IPFS upload through our Vercel serverless (has sizeLimit & CORS)
      '/api/ipfs': {
        target: 'https://haven-base.vercel.app',
        changeOrigin: true,
        secure: true,
        // Keep /api prefix so it hits the serverless route /api/ipfs/upload
      },
      // Blockchain endpoints (chart + trade history)
      '/api/blockchain': {
        target: 'https://haven-base.vercel.app',
        changeOrigin: true,
        secure: true,
      },
      // Verification endpoint should go to Vercel serverless in dev
      '/api/verify': {
        target: 'https://haven-base.vercel.app',
        changeOrigin: true,
        secure: true,
      },
      // (removed) vanity mining proxy, now using on-chain predictor
      // Custom commands (needs body mapping on serverless)
      '/api/robot/command/add-command': {
        target: 'https://haven-base.vercel.app',
        changeOrigin: true,
        secure: true,
      },
      // Status mapping: /api/robot/status/<sim>/<device> -> /<sim>/<device>/status
      '/api/robot/status': {
        // Upstream needs /robot prefix → point target to /robot and keep only the dynamic tail
        target: 'https://havenserver.com/robot',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => {
          const m = path.match(/^\/api\/robot\/status\/([^/]+)\/([^/]+)$/)
          return m ? `/${m[1]}/${m[2]}/status` : path.replace(/^\/api\/robot/, '')
        },
      },
      // Command mapping: /api/robot/command/<sim> -> /<sim>/command
      '/api/robot/command': {
        // Upstream needs /robot prefix → point target to /robot and keep only the dynamic tail
        target: 'https://havenserver.com/robot',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => {
          const m = path.match(/^\/api\/robot\/command\/([^/]+)$/)
          return m ? `/${m[1]}/command` : path.replace(/^\/api\/robot/, '')
        },
      },
      // Agent routes: /api/robot/agents/* -> /agents/*
      '/api/robot/agents': {
        target: 'https://havenserver.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/robot\/agents/, '/agents'),
      },
      '/api': {
        // Dev proxy directly to upstream backend. We rewrite "/api" → "/" so
        // client requests like /api/robot/... become /robot/... on upstream.
        target: 'https://havenserver.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
