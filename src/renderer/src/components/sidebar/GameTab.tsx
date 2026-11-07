import type { GameState } from '@shared/chess'
import { baseOf, stepRange, type BoardView } from '../../state/boardView'
import { GamePanel } from './GamePanel'
import { MoveList } from './MoveList'

/**
 * The moves of whatever the board is on: a past game being replayed, the analysis board (also
 * while one of its lines is previewed), or else the game being played, with its controls.
 */
export function GameTab({
  view,
  game,
  onGo,
  onNewGame,
  onResign,
  onRetryEngine,
  onAnalyse,
}: {
  view: BoardView
  game: GameState | null
  /** Shows the position after a move picked from the list. */
  onGo: (ply: number) => void
  onNewGame: () => void
  onResign: () => void
  onRetryEngine: () => void
  onAnalyse: () => void
}) {
  const base = baseOf(view)

  if (base.kind === 'replay' || base.kind === 'analysis') {
    const [initialFen, moves, empty] =
      base.kind === 'replay'
        ? [base.game.initialFen, base.game.moves, undefined]
        : [base.start.fen, base.steps, 'Make moves for either side on the board.']
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <MoveList
          initialFen={initialFen}
          moves={moves}
          ply={base.ply}
          onSelect={onGo}
          {...(empty ? { empty } : {})}
        />
      </div>
    )
  }

  return (
    <GamePanel
      game={game}
      ply={stepRange(base, game?.moves.length ?? 0)?.ply ?? 0}
      onSelectPly={onGo}
      onNewGame={onNewGame}
      onResign={onResign}
      onRetryEngine={onRetryEngine}
      onAnalyse={onAnalyse}
    />
  )
}
