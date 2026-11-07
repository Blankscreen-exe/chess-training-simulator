import { useState } from 'react'
import type { GameState } from '@shared/chess'
import type { Opening } from '@shared/training'
import { opponentName } from '../../lib/opponent'
import { describeEnding } from '../../lib/outcome'
import { Button } from '../ui/Button'
import { MoveList } from './MoveList'

function statusOf(game: GameState): { text: string; tone: string } {
  if (game.status !== 'in_progress') return { text: describeEnding(game), tone: 'text-amber-200' }
  if (game.opponentFailed) {
    return { text: 'Your opponent stopped before choosing its move.', tone: 'text-red-300' }
  }
  if (game.opponentThinking) {
    const thinking =
      game.opponent === 'coach' ? 'Your coach is choosing a move…' : 'Stockfish is thinking…'
    return { text: thinking, tone: 'text-stone-100' }
  }
  return {
    text: game.position.check ? 'Your move — you are in check' : 'Your move',
    tone: 'text-stone-100',
  }
}

/** The game being played: whose move it is, its moves, and what can be done with it. */
export function GamePanel({
  game,
  opening,
  ply,
  onSelectPly,
  onNewGame,
  onResign,
  onRetryEngine,
  onAnalyse,
  onReview,
}: {
  game: GameState | null
  opening: Opening | null
  ply: number
  onSelectPly: (ply: number) => void
  onNewGame: () => void
  onResign: () => void
  onRetryEngine: () => void
  onAnalyse: () => void
  /** Asks the coach to go over the game; absent while the coach is not connected. */
  onReview: (() => void) | undefined
}) {
  const [confirmingResign, setConfirmingResign] = useState(false)

  if (!game) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-stone-400">No game under way.</p>
        <Button variant="primary" onClick={onNewGame}>
          New game
        </Button>
      </div>
    )
  }

  const over = game.status !== 'in_progress'
  const status = statusOf(game)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1 border-b border-stone-800 px-4 py-3">
        <p className="text-xs text-stone-500">
          You play {game.playerColor === 'white' ? 'White' : 'Black'} against {opponentName(game)}
        </p>
        {opening && (
          <p className="truncate text-xs text-stone-400" title={opening.name}>
            {opening.eco} · {opening.name}
          </p>
        )}
        <p className={`text-sm font-medium ${status.tone}`} aria-live="polite">
          {status.text}
        </p>
        {game.opponentFailed && <Button onClick={onRetryEngine}>Try again</Button>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <MoveList
          initialFen={game.initialFen}
          moves={game.moves}
          ply={ply}
          onSelect={onSelectPly}
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-stone-800 p-3">
        <Button variant="primary" onClick={onNewGame}>
          New game
        </Button>
        {over && onReview && <Button onClick={onReview}>Review with the coach</Button>}
        {!over &&
          (confirmingResign ? (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmingResign(false)
                  onResign()
                }}
              >
                Yes, resign
              </Button>
              <Button onClick={() => setConfirmingResign(false)}>Keep playing</Button>
            </>
          ) : (
            <Button onClick={() => setConfirmingResign(true)}>Resign</Button>
          ))}
        <Button onClick={onAnalyse} title="Try moves from the position on the board">
          Analyse position
        </Button>
      </div>
    </div>
  )
}
