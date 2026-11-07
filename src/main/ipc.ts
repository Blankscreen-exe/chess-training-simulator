import { ipcMain } from 'electron'
import type { IpcArgs, IpcChannel, IpcResult } from '@shared/ipc'
import { isAppUrl } from './security'

/**
 * Answers a channel of the IPC contract. Requests from any page but the app's own are refused.
 * Arguments come from the renderer, so a handler that takes any must check them itself.
 */
export function handle<C extends IpcChannel>(
  channel: C,
  baseUrl: string,
  handler: (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>,
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    if (!isAppUrl(event.senderFrame?.url, baseUrl)) {
      throw new Error(`Refused ${channel}: the request did not come from the app's own page`)
    }
    return handler(...(args as IpcArgs<C>))
  })
}
