// Runs Stockfish in an Electron utility process, so its searches never hold up the main process
// and a crash in the engine cannot take the app with it. Commands arrive as messages, and each
// line the engine prints goes back as one.
//
// It is built on its own (vite.engine-host.config.mts), into out/engine.
import { engineLocations, findEngine, loadStockfish } from './stockfish'

const port = process.parentPort
const engine = loadStockfish(
  findEngine(engineLocations(process.resourcesPath, __dirname)),
  (line) => port.postMessage(line),
)
port.on('message', (event: { data: unknown }) => {
  if (typeof event.data === 'string') engine.processCommand(event.data)
})
