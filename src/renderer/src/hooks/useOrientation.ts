import { useState } from 'react'
import type { Color, GameState } from '@shared/chess'
import { otherColor } from '@shared/chess'

/**
 * Which side of the board is at the bottom. Each new game starts from the player's side; it is
 * adjusted while rendering, as React suggests for state that follows a prop, rather than in an
 * effect that would draw the board the wrong way round first.
 */
export function useOrientation(game: GameState | null) {
  const [orientation, setOrientation] = useState<Color>('white')
  const [orientedFor, setOrientedFor] = useState<number | null>(null)
  if (game && game.id !== orientedFor) {
    setOrientedFor(game.id)
    setOrientation(game.playerColor)
  }
  return {
    orientation,
    setOrientation,
    flip: () => setOrientation(otherColor),
  }
}
