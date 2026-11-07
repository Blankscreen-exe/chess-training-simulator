import { useCallback, useEffect, useState } from 'react'

const NOTICE_MS = 3500

/** A short message that clears itself, for refusals such as "the engine is still thinking". */
export function useNotice(): { notice: string | null; notify: (message: string) => void } {
  const [notice, setNotice] = useState<{ message: string; id: number } | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  // A new id each time, so the same message twice still restarts the clock.
  const notify = useCallback((message: string) => setNotice({ message, id: Date.now() }), [])
  return { notice: notice?.message ?? null, notify }
}
