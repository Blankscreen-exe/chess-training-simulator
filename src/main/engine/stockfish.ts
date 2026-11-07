// Where the Stockfish build lives, and how to load it. The app, its tests and its packaging
// (electron-builder.yml, which copies ENGINE_FILE and its .wasm) all go through here.
import { createRequire } from 'node:module'
import { join } from 'node:path'

/** The engine build the app uses: small, single-threaded, and far stronger than any person. */
export const ENGINE_FILE = 'stockfish-19-lite-single.js'

/** Where the `stockfish` package keeps its builds, from the project's root. */
export const PACKAGE_BUILDS = join('node_modules', 'stockfish', 'bin')

/** How the main process tells the engine's utility process (host.ts) where the engine is. */
export const ENGINE_PATH_VARIABLE = 'STOCKFISH_PATH'

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
