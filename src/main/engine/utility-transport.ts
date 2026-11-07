import { join } from 'node:path'
import { utilityProcess } from 'electron'
import { Listeners } from '../util/listeners'
import type { UciTransport } from './engine'

/**
 * Runs the engine in its own utility process (see host.ts), named `name` in the task manager.
 * The process finds the engine by itself, so nothing from here needs to reach it.
 */
export function utilityTransport(name: string): UciTransport {
  const lines = new Listeners<string>()
  const exits = new Listeners<string>()
  // Commands sent before the process has started wait here.
  const waiting: string[] = []
  let state: 'starting' | 'running' | 'exited' = 'starting'

  // Built on its own into out/engine (vite.engine-host.config.mts); this file is in out/main.
  const child = utilityProcess.fork(join(__dirname, '..', 'engine', 'host.js'), [], {
    serviceName: name,
    stdio: 'ignore',
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
