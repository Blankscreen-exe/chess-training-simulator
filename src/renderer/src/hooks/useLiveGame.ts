import { useEffect, useState } from 'react'
import type { GameState } from '@shared/chess'
import { api } from '../lib/api'

/** The game being played, as the main process last told it; null when there is none. */
export function useLiveGame(): GameState | null {
  const [game, setGame] = useState<GameState | null>(null)

  useEffect(() => {
    let heard = false
    // Listen first, so no change between asking and listening is missed; and once a change has
    // been heard, the answer to the first question is older than it.
    const stop = api.on('game:state', (state) => {
      heard = true
      setGame(state)
    })
    void api.game.get().then((state) => {
      if (!heard) setGame(state)
    })
    return stop
  }, [])

  return game
}
