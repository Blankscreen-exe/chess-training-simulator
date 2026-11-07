import { useCallback, useEffect, useMemo, useReducer } from 'react'
import type { GameState } from '@shared/chess'
import type { PuzzleState } from '@shared/training'
import { boardReducer, LIVE, shownPosition, stepRange } from '../state/boardView'

/** How long each move of a preview stays on the board, and how long the last one lingers. */
const PREVIEW_STEP_MS = 900
const PREVIEW_LINGER_MS = 1600

/**
 * What the board shows, with a preview that plays itself, and a way to step through moves. A
 * puzzle is shown as it starts, and the game again once it is taken off the board.
 */
export function useBoardView(game: GameState | null, puzzle: PuzzleState | null) {
  const [view, dispatch] = useReducer(boardReducer, LIVE)
  const liveMoves = game?.moves.length ?? 0

  const position = useMemo(() => shownPosition(view, game, puzzle), [view, game, puzzle])

  const puzzleId = puzzle?.id ?? null
  useEffect(() => {
    if (puzzleId !== null) dispatch({ type: 'show-puzzle' })
  }, [puzzleId])
  useEffect(() => {
    if (puzzleId === null && view.kind === 'puzzle') dispatch({ type: 'show-live' })
  }, [puzzleId, view.kind])
  const range = stepRange(view, liveMoves)
  /** Steps the board to a ply, as the playback buttons and arrow keys do. */
  const goTo = useCallback(
    (ply: number) => dispatch({ type: 'go-to', ply, liveMoves }),
    [liveMoves],
  )
  /** Shows the position after a move picked from a move list, leaving any preview. */
  const selectMove = useCallback(
    (ply: number) => dispatch({ type: 'select-move', ply, liveMoves }),
    [liveMoves],
  )

  // A playing preview moves on by itself, and returns once its last move has lingered.
  const previewClock =
    view.kind === 'preview' && view.playing
      ? view.ply >= view.steps.length
        ? PREVIEW_LINGER_MS
        : PREVIEW_STEP_MS
      : null
  useEffect(() => {
    if (previewClock === null) return
    const timer = setTimeout(() => dispatch({ type: 'preview-tick' }), previewClock)
    return () => clearTimeout(timer)
    // `view` is here so the clock starts again at each step, not only when its length changes.
  }, [previewClock, view])

  return { view, dispatch, position, range, goTo, selectMove }
}

export type BoardState = ReturnType<typeof useBoardView>
