import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { ENGINE_FILE, engineLocations, findEngine } from './stockfish'

describe('packaging', () => {
  it('copies the engine build the app loads, with its WebAssembly', () => {
    const config = readFileSync('electron-builder.yml', 'utf8')
    expect(config).toContain(`- ${ENGINE_FILE}`)
    expect(config).toContain(`- ${ENGINE_FILE.replace(/\.js$/, '.wasm')}`)
  })
})

describe('finding the engine', () => {
  const resources = join('C:', 'App', 'resources')
  const hostDir = join('C:', 'project', 'out', 'main')

  it('looks in the app’s resources first, then in the project’s node_modules', () => {
    expect(engineLocations(resources, hostDir)).toEqual([
      join(resources, 'engine', ENGINE_FILE),
      join('C:', 'project', 'node_modules', 'stockfish', 'bin', ENGINE_FILE),
    ])
  })

  it('takes the first place it is, and says where it looked when it is nowhere', () => {
    const [packaged, developing] = engineLocations(resources, hostDir)
    expect(findEngine([packaged!, developing!], (path) => path === developing)).toBe(developing)
    expect(() => findEngine([packaged!], () => false)).toThrow(/not in any of/)
  })
})
