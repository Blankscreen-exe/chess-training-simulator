import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * A ref that always holds the latest `value`, for callbacks handed to code outside React (such
 * as the board's event handlers) that must not call stale props. It is updated before the
 * browser paints, so no event can arrive in between.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}
