// Runs Stockfish in an Electron utility process, so its searches never hold up the main process
// and a crash in the engine cannot take the app with it. Commands arrive as messages, and each
// line the engine prints goes back as one.
import { ENGINE_PATH_VARIABLE, loadStockfish } from './stockfish'

const path = process.env[ENGINE_PATH_VARIABLE]
if (!path) throw new Error(`${ENGINE_PATH_VARIABLE} does not say where the engine is`)

const port = process.parentPort
const engine = loadStockfish(path, (line) => port.postMessage(line))
port.on('message', (event: { data: unknown }) => {
  if (typeof event.data === 'string') engine.processCommand(event.data)
})
