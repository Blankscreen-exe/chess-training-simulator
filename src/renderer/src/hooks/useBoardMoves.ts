import { useMemo, useState, type Dispatch } from 'react'
import type {
  Color,
  GameState,
  MoveInput,
  Position,
  PromotionPiece,
  ShownPosition,
} from '@shared/chess'
import { toUci } from '@shared/notation'
import type { PuzzleState } from '@shared/training'
import { api } from '../lib/api'
import { hasMoves, type BoardAction, type BoardView } from '../state/boardView'

export interface Movable {
  color: Color | 'both'
  dests: Record<string, string[]>
}

/** Who may move on the board as it is shown, if anyone. */
function whoMoves(
  view: BoardView,
  position: ShownPosition | Position,
  game: GameState | null,
  puzzle: PuzzleState | null,
): Movable | undefined {
  if (!hasMoves(position)) return undefined
  if (view.kind === 'analysis') return { color: position.turn, dests: position.dests }
  if (view.kind === 'puzzle') {
    const solving = puzzle?.status === 'solving' && position.turn === puzzle.playerColor
    return solving ? { color: puzzle.playerColor, dests: position.dests } : undefined
  }
  const playersTurn =
    view.kind === 'live' &&
    game?.status === 'in_progress' &&
    !game.opponentThinking &&
    !game.opponentFailed &&
    position.turn === game.playerColor
  return playersTurn ? { color: game.playerColor, dests: position.dests } : undefined
}

/**
 * Moves made on the board: who may make them, the piece a promoting pawn becomes, and sending
 * each to the main process, for the live game, the puzzle or the analysis board.
 */
export function useBoardMoves(options: {
  view: BoardView
  position: ShownPosition | Position
  game: GameState | null
  puzzle: PuzzleState | null
  dispatch: Dispatch<BoardAction>
  notify: (message: string) => void
}) {
  const { view, position, game, puzzle, dispatch, notify } = options
  const [promotion, setPromotion] = useState<{ from: string; to: string; color: Color } | null>(
    null,
  )
  // Bumped to put the pieces back as the position says, after a move that did not go through.
  const [revision, setRevision] = useState(0)
  const undoOnBoard = () => setRevision((value) => value + 1)

  const movable = useMemo(
    () => whoMoves(view, position, game, puzzle),
    [view, position, game, puzzle],
  )

  async function send(move: MoveInput) {
    if (view.kind === 'live' || view.kind === 'puzzle') {
      // A move that is not the puzzle's answer is refused, with the reason, like an illegal one.
      const result = await (view.kind === 'live' ? api.game.move(move) : api.puzzle.move(move))
      if (!result.ok) {
        notify(result.error)
        undoOnBoard()
      }
    } else if (view.kind === 'analysis') {
      const result = await api.position.play(position.fen, move)
      if (!result.ok) {
        notify(result.error)
        undoOnBoard()
        return
      }
      dispatch({
        type: 'analysis-move',
        step: { uci: toUci(move), san: result.san, position: result.position },
      })
    }
  }

  return {
    movable: promotion ? undefined : movable,
    revision,
    promotion,
    onMove: (from: string, to: string) => {
      if (hasMoves(position) && position.promotions.includes(`${from}${to}`)) {
        setPromotion({ from, to, color: position.turn })
      } else {
        void send({ from, to })
      }
    },
    choosePromotion: (piece: PromotionPiece) => {
      if (!promotion) return
      setPromotion(null)
      void send({ from: promotion.from, to: promotion.to, promotion: piece })
    },
    cancelPromotion: () => {
      setPromotion(null)
      undoOnBoard()
    },
  }
}
