import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = resolve('src/shared')

// The engine's utility process is built separately: see vite.engine-host.config.mts.
export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    build: {
      // Bundle chess.js, zod and the MCP SDK into the main process, rather than copying their
      // packages, with their sources and tests, into the app. Electron and Node's own modules
      // stay outside.
      externalizeDeps: false,
    },
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
  },
  renderer: {
    resolve: { alias: { '@shared': shared } },
    plugins: [react(), tailwindcss()],
  },
})
