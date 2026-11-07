import { ipcMain, type WebContents } from 'electron'
import { z } from 'zod'
import type { IpcArgs, IpcChannel, IpcEvent, IpcEvents, IpcResult } from '@shared/ipc'
import { isAppUrl } from '../security'
import { ARGUMENTS } from './schemas'

/** A handler for every channel of the IPC contract. */
export type IpcHandlers = {
  [C in IpcChannel]: (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>
}

/**
 * Answers every channel of the IPC contract. Requests from any page but the app's own, and
 * arguments that do not fit the channel, are refused.
 */
export function registerIpc(baseUrl: string, handlers: IpcHandlers): void {
  for (const channel of Object.keys(handlers) as IpcChannel[]) {
    // Each handler is called only with arguments its own schema has accepted.
    const handler = handlers[channel] as (...args: unknown[]) => unknown
    const schema: z.ZodType<unknown[]> = ARGUMENTS[channel]
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!isAppUrl(event.senderFrame?.url, baseUrl)) {
        throw new Error(`Refused ${channel}: the request did not come from the app's own page`)
      }
      const parsed = schema.safeParse(args)
      if (!parsed.success) {
        throw new Error(`Refused ${channel}: ${z.prettifyError(parsed.error)}`)
      }
      return handler(...parsed.data)
    })
  }
}

/** Tells a page something, if it is still there to hear it. */
export function emit<E extends IpcEvent>(
  contents: WebContents | undefined,
  event: E,
  payload: IpcEvents[E],
): void {
  if (contents && !contents.isDestroyed()) contents.send(event, payload)
}
