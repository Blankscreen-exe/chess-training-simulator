import { join } from 'node:path'
import { app, utilityProcess } from 'electron'
import { Listeners } from '../util/listeners'
import type { UciTransport } from './engine'
import { ENGINE_FILE, ENGINE_PATH_VARIABLE, PACKAGE_BUILDS } from './stockfish'

/** Where the engine is: copied into the app's resources when packaged, or in node_modules. */
function enginePath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'engine', ENGINE_FILE)
    : join(app.getAppPath(), PACKAGE_BUILDS, ENGINE_FILE)
}

/** Runs the engine in its own utility process (see host.ts), named `name` in the task manager. */
export function utilityTransport(name: string): UciTransport {
  const lines = new Listeners<string>()
  const exits = new Listeners<string>()
  // Commands sent before the process has started wait here.
  const waiting: string[] = []
  let state: 'starting' | 'running' | 'exited' = 'starting'

  const child = utilityProcess.fork(join(__dirname, 'engine-host.js'), [], {
    serviceName: name,
    stdio: 'ignore',
    env: { ...process.env, [ENGINE_PATH_VARIABLE]: enginePath() },
  })
  child.on('spawn', () => {
    state = 'running'
    for (const command of waiting.splice(0)) child.postMessage(command)
  })
  child.on('message', (message: unknown) => {
    if (typeof message === 'string') lines.emit(message)
  })
  child.on('exit', (code) => {
    state = 'exited'
    exits.emit(`its process exited with code ${code}`)
  })

  return {
    send(command) {
      if (state === 'running') child.postMessage(command)
      else if (state === 'starting') waiting.push(command)
    },
    onLine: (listener) => lines.add(listener),
    onExit: (listener) => exits.add(listener),
    close() {
      if (state !== 'exited') child.kill()
    },
  }
}
