import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ENGINE_FILE } from './stockfish'

describe('packaging', () => {
  it('copies the engine build the app loads, with its WebAssembly', () => {
    const config = readFileSync('electron-builder.yml', 'utf8')
    expect(config).toContain(`- ${ENGINE_FILE}`)
    expect(config).toContain(`- ${ENGINE_FILE.replace(/\.js$/, '.wasm')}`)
  })
})
