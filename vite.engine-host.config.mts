// Builds the engine's utility process (src/main/engine/host.ts) on its own. In electron-vite's
// main build it would be a second entry, and the bundler makes every entry after the first load
// the first, so the engine's process would load the whole main process. Built alone, it holds
// only its own code. Its output folder, out/engine, is one electron-vite never clears.
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'out/engine',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    lib: {
      entry: resolve('src/main/engine/host.ts'),
      formats: ['cjs'],
      fileName: () => 'host.js',
    },
    rolldownOptions: {
      external: ['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
    },
  },
})
