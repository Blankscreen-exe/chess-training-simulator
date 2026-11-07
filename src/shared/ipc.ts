// The contract between the renderer and the main process. Each channel names what the renderer
// sends and what it gets back; the main process's handlers and the preload script are both typed
// from it, so the two sides cannot drift apart.

/** The app's name, version and the versions of what it runs on. */
export interface AppInfo {
  name: string
  version: string
  /** The operating system, as Node names it: win32, darwin or linux. */
  platform: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
}

/** Every request the renderer can make: its arguments and what it is answered with. */
export interface IpcContract {
  'app:get-info': { args: []; result: AppInfo }
}

export type IpcChannel = keyof IpcContract
export type IpcArgs<C extends IpcChannel> = IpcContract[C]['args']
export type IpcResult<C extends IpcChannel> = IpcContract[C]['result']

/** What the preload script gives the renderer, as `window.api`. */
export interface RendererApi {
  getAppInfo(): Promise<AppInfo>
}
