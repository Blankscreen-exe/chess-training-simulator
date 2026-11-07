import { useEffect, useState } from 'react'
import { errorMessage } from '@shared/errors'
import { useLatest } from './useLatest'

export interface Query<T> {
  /** The answer for the current key, once it has come. */
  data: T | undefined
  error: string | null
  loading: boolean
}

/**
 * Asks the main process something, again whenever `key` changes, and keeps only the answer for
 * the current key: a slow answer to an old question never replaces a newer one. With `load`
 * null, nothing is asked. `delayMs` waits that long first, so a key that changes quickly (as
 * when stepping through moves) asks only once it settles.
 */
export function useQuery<T>(
  key: string,
  load: (() => Promise<T>) | null,
  options: { delayMs?: number } = {},
): Query<T> {
  const [settled, setSettled] = useState<{ key: string; data?: T; error?: string } | null>(null)
  const latestLoad = useLatest(load)
  const enabled = load !== null
  const delayMs = options.delayMs ?? 0

  useEffect(() => {
    const run = latestLoad.current
    if (!run) return
    let current = true
    const timer = setTimeout(() => {
      run().then(
        (data) => current && setSettled({ key, data }),
        (error: unknown) => current && setSettled({ key, error: errorMessage(error) }),
      )
    }, delayMs)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [key, enabled, delayMs, latestLoad])

  const answer = settled?.key === key ? settled : null
  return { data: answer?.data, error: answer?.error ?? null, loading: enabled && !answer }
}
