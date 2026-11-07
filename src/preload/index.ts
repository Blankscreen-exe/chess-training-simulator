// The only bridge between the page and the main process. The page gets `window.api`: the
// channels named in API_CHANNELS, and a way to hear events, never Electron or Node themselves.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ApiOf, ApiTree, IpcEvent, IpcEvents, RendererApi } from '@shared/ipc'
import { API_CHANNELS } from '@shared/ipc'

/** Turns each channel in the tree into a function that sends the request and awaits its answer. */
function bind<T extends ApiTree>(tree: T): ApiOf<T> {
  return Object.fromEntries(
    Object.entries(tree).map(([name, node]) => [
      name,
      typeof node === 'string'
        ? (...args: unknown[]) => ipcRenderer.invoke(node, ...args)
        : bind(node),
    ]),
  ) as ApiOf<T>
}

function on<E extends IpcEvent>(event: E, listener: (payload: IpcEvents[E]) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: IpcEvents[E]) => listener(payload)
  ipcRenderer.on(event, wrapped)
  return () => {
    ipcRenderer.removeListener(event, wrapped)
  }
}

const api: RendererApi = { ...bind(API_CHANNELS), on }

contextBridge.exposeInMainWorld('api', api)
