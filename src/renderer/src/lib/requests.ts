import type { Result } from '@shared/chess'

/**
 * Awaits a request the main process may refuse. A refusal is passed to `notify`, so the player
 * sees why, and gives null; anything else gives the answer.
 */
export async function attempt<T extends object>(
  request: Promise<Result<T>>,
  notify: (message: string) => void,
): Promise<T | null> {
  const result = await request
  if (!result.ok) {
    notify(result.error)
    return null
  }
  return result
}
