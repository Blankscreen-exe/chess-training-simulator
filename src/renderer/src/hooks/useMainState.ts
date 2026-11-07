import { useEffect, useState } from 'react'
import type { IpcEvent, IpcEvents } from '@shared/ipc'
import { api } from '../lib/api'
import { useLatest } from './useLatest'

/**
 * Something the main process owns and announces whenever it changes, such as the game or the
 * coach: asked for once, then kept up to date by its event. Undefined until the first answer.
 */
export function useMainState<E extends IpcEvent>(
  event: E,
  get: () => Promise<IpcEvents[E]>,
): IpcEvents[E] | undefined {
  const [state, setState] = useState<IpcEvents[E]>()
  const latestGet = useLatest(get)

  useEffect(() => {
    let heard = false
    // Listen first, so no change between asking and listening is missed; once a change has been
    // heard, the answer to the first question is older than it.
    const stop = api.on(event, (payload) => {
      heard = true
      setState(() => payload)
    })
    void latestGet.current().then((payload) => {
      if (!heard) setState(() => payload)
    })
    return stop
  }, [event, latestGet])

  return state
}
