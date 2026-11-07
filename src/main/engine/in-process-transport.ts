// Runs the engine inside the calling process. Its searches block that process, so this is for
// tests, which have nothing else to do meanwhile; the app uses utilityTransport.
import { resolve } from 'node:path'
import { Listeners } from '../util/listeners'
import type { UciTransport } from './engine'
import { ENGINE_FILE, loadStockfish, PACKAGE_BUILDS } from './stockfish'

export function inProcessTransport(
  enginePath = resolve(PACKAGE_BUILDS, ENGINE_FILE),
): UciTransport {
  const lines = new Listeners<string>()
  // Stockfish's loader sets the global fetch to null under Node, to make itself read its
  // WebAssembly from disk. In its own process (as in the app) that is harmless; sharing a
  // process with tests that use fetch, it is not, so fetch is put back once it has loaded.
  const { fetch } = globalThis
  const engine = loadStockfish(enginePath, (line) => lines.emit(line))
  globalThis.fetch = fetch
  let closed = false
  return {
    send(command) {
      if (!closed) engine.processCommand(command)
    },
    onLine: (listener) => lines.add(listener),
    // The engine lives as long as the process, so it never exits on its own.
    onExit: () => () => undefined,
    close() {
      closed = true
      engine.terminate?.()
    },
  }
}
