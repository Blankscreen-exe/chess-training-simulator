import { useState } from 'react'
import type { GameState } from '@shared/chess'
import type { Opening } from '@shared/training'
import { api } from '../lib/api'
import { useQuery } from './useQuery'

/**
 * The named opening a game is in, kept while the next is looked up so it does not flicker at
 * each move. `libraryVersion` changes when a library is installed, to look again.
 */
export function useOpening(
  game: Pick<GameState, 'initialFen' | 'moves'> | null,
  libraryVersion: string | null,
): Opening | null {
  const positions = game ? [game.initialFen, ...game.moves.map((move) => move.fenAfter)] : null
  const key = `${libraryVersion}:${positions?.length}:${positions?.at(-1)}`
  const { data, loading } = useQuery(
    key,
    positions && libraryVersion ? () => api.opening.of(positions) : null,
  )
  // The last answer, kept while rendering, as React suggests for state that follows a prop.
  const [last, setLast] = useState<Opening | null>(null)
  const answer = data ?? null
  if (!loading && answer !== last) setLast(answer)
  return loading ? last : answer
}
