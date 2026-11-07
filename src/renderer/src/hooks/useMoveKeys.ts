import { useEffect } from 'react'
import { useLatest } from './useLatest'

/** Where each key steps to, from the ply shown out of `count`. */
function target(key: string, ply: number, count: number): number | undefined {
  switch (key) {
    case 'ArrowLeft':
      return ply - 1
    case 'ArrowRight':
      return ply + 1
    case 'Home':
      return 0
    case 'End':
      return count
    default:
      return undefined
  }
}

/**
 * The arrow keys, Home and End step through moves; Escape calls `onEscape`. Keys typed into a
 * field or a dialog are left alone, as is everything while `enabled` is false.
 */
export function useMoveKeys(options: {
  enabled: boolean
  range: { ply: number; count: number } | null
  onGo: (ply: number) => void
  onEscape?: () => void
}): void {
  const latest = useLatest(options)
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const { enabled, range, onGo, onEscape } = latest.current
      if (
        !enabled ||
        (event.target as Element | null)?.closest('input, textarea, select, dialog')
      ) {
        return
      }
      if (event.key === 'Escape' && onEscape) {
        onEscape()
        return
      }
      const ply = range && target(event.key, range.ply, range.count)
      if (ply === undefined || ply === null) return
      event.preventDefault()
      onGo(ply)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [latest])
}
