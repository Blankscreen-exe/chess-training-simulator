import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = resolve('src/shared')

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    build: {
      // Bundle chess.js and zod into the main process, rather than copying their packages, with
      // their sources and tests, into the app. Electron and Node's own modules stay outside.
      externalizeDeps: false,
      rolldownOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          // Runs Stockfish in its own process; see src/main/engine/host.ts.
          'engine-host': resolve('src/main/engine/host.ts'),
        },
      },
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
