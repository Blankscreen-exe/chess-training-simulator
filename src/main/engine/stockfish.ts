// Where the Stockfish build lives, and how to load it, for the engine's own process (host.ts)
// and for the tests.
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/** The engine build the app uses: small, single-threaded, and far stronger than any person. */
export const ENGINE_FILE = 'stockfish-19-lite-single.js'

/** Where the `stockfish` package keeps its builds, from the project's root. */
export const PACKAGE_BUILDS = join('node_modules', 'stockfish', 'bin')

/**
 * Where the engine may be, most likely first: copied into the app's resources when packaged
 * (electron-builder.yml), or in the project's node_modules while developing. `hostDir` is the
 * folder of the built engine host, out/engine, two levels below the project.
 */
export function engineLocations(resourcesPath: string, hostDir: string): string[] {
  return [
    join(resourcesPath, 'engine', ENGINE_FILE),
    join(hostDir, '..', '..', PACKAGE_BUILDS, ENGINE_FILE),
  ]
}

/** The first of `locations` that exists. */
export function findEngine(locations: readonly string[], exists = existsSync): string {
  const found = locations.find((location) => exists(location))
  if (!found) throw new Error(`Stockfish is not in any of: ${locations.join(', ')}`)
  return found
}

/** A loaded engine: commands go in through `processCommand`, and each line it prints comes out. */
export interface StockfishEngine {
  listener?: (line: string) => void
  processCommand(command: string): void
  terminate?: () => void
}

/** Loads the engine at `path`; it takes commands at once and queues them until it is ready. */
export function loadStockfish(path: string, onLine: (line: string) => void): StockfishEngine {
  // Required relative to itself, so this works however the calling module was built.
  const create = createRequire(path)(path) as () => StockfishEngine
  const engine = create()
  engine.listener = onLine
  return engine
}
