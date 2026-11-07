import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Color, GameState, Score } from '@shared/chess'
import { useBoardMoves } from '../../hooks/useBoardMoves'
import type { BoardState } from '../../hooks/useBoardView'
import { BoardBanner } from './BoardBanner'
import { ChessBoard } from './ChessBoard'
import { EvalBar } from './EvalBar'
import { Playback } from './Playback'
import { PromotionPicker } from './PromotionPicker'

// The board is as large as fits, leaving room for the evaluation bar beside it.
const BOARD_SIZE = 'min(100cqw - 1.75rem, 100cqh)'

/** The board column: what the board is showing, the board itself, and stepping through moves. */
export function BoardArea({
  board,
  game,
  orientation,
  evaluation,
  notice,
  notify,
}: {
  board: BoardState
  game: GameState | null
  orientation: Color
  /** The engine's view of the position, while it is being shown. */
  evaluation: { score: Score | null; arrows: readonly DrawShape[] } | null
  notice: string | null
  notify: (message: string) => void
}) {
  const { view, dispatch, position, range, goTo } = board
  const moves = useBoardMoves({ view, position, game, dispatch, notify })

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3">
      <BoardBanner view={view} game={game} dispatch={dispatch} />

      <div className="relative min-h-0 flex-1" style={{ containerType: 'size' }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex gap-2" style={{ height: BOARD_SIZE }}>
            {/* Kept in the layout when hidden, so the board does not shift when it appears. */}
            <div className={`flex ${evaluation ? '' : 'invisible'}`}>
              <EvalBar score={evaluation?.score ?? null} orientation={orientation} />
            </div>
            <div className="relative" style={{ width: BOARD_SIZE }}>
              <ChessBoard
                fen={position.fen}
                orientation={orientation}
                turnColor={position.turn}
                check={position.check}
                lastMove={position.lastMove}
                movable={moves.movable}
                onMove={moves.onMove}
                shapes={evaluation?.arrows}
                revision={moves.revision}
              />
              {moves.promotion && (
                <PromotionPicker
                  color={moves.promotion.color}
                  onPick={moves.choosePromotion}
                  onCancel={moves.cancelPromotion}
                />
              )}
              {notice && (
                <div
                  className="absolute inset-x-0 bottom-3 z-30 mx-auto w-fit rounded-md bg-red-900/90 px-3 py-2 text-sm text-red-100 shadow-lg"
                  role="alert"
                >
                  {notice}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {range && (
        <Playback
          ply={range.ply}
          count={range.count}
          onGo={goTo}
          {...(view.kind === 'preview'
            ? {
                playing: view.playing,
                onTogglePlay: () => dispatch({ type: 'preview-toggle-play' }),
              }
            : {})}
        />
      )}
    </section>
  )
}
