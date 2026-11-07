import { useState } from 'react'
import type { Color, GameState } from '@shared/chess'
import { otherColor } from '@shared/chess'
import type { PuzzleState } from '@shared/training'

/**
 * Which side of the board is at the bottom. Each new game, and each puzzle, starts from the
 * player's side, and the game's side comes back when a puzzle is taken away. It is adjusted
 * while rendering, as React suggests for state that follows a prop, rather than in an effect
 * that would draw the board the wrong way round first.
 */
export function useOrientation(game: GameState | null, puzzle: PuzzleState | null) {
  const [orientation, setOrientation] = useState<Color>('white')
  const [orientedFor, setOrientedFor] = useState<{ game: number | null; puzzle: string | null }>({
    game: null,
    puzzle: null,
  })
  const gameId = game?.id ?? null
  const puzzleId = puzzle?.id ?? null
  if (gameId !== orientedFor.game || puzzleId !== orientedFor.puzzle) {
    setOrientedFor({ game: gameId, puzzle: puzzleId })
    const side =
      puzzleId !== orientedFor.puzzle
        ? (puzzle?.playerColor ?? game?.playerColor)
        : game?.playerColor
    if (side) setOrientation(side)
  }
  return {
    orientation,
    setOrientation,
    flip: () => setOrientation(otherColor),
  }
}
