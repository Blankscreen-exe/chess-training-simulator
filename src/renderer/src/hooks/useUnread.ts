import { useState } from 'react'

/**
 * Whether something new has arrived since it was last looked at: `latest` grows as things
 * arrive (a message id, say), and everything up to it counts as seen while `looking` is true.
 */
export function useUnread(latest: number, looking: boolean): boolean {
  const [seen, setSeen] = useState(latest)
  // Adjusted while rendering, as React suggests for state that follows a prop.
  if (looking && seen !== latest) setSeen(latest)
  return latest > seen
}
