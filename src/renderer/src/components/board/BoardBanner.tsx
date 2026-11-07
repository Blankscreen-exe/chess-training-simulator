import type { Dispatch } from 'react'
import type { GameState } from '@shared/chess'
import { numberedMove } from '@shared/notation'
import type { PuzzleState } from '@shared/training'
import { api } from '../../lib/api'
import { puzzleHeading } from '../../lib/puzzle'
import { describeEnding } from '../../lib/outcome'
import type { BoardAction, BoardView } from '../../state/boardView'
import { ViewBanner } from './ViewBanner'

/** Above the board whenever it is not showing the game as it stands; an empty strip otherwise. */
export function BoardBanner({
  view,
  game,
  puzzle,
  dispatch,
}: {
  view: BoardView
  game: GameState | null
  puzzle: PuzzleState | null
  dispatch: Dispatch<BoardAction>
}) {
  switch (view.kind) {
    case 'preview':
      return (
        <ViewBanner
          tone="preview"
          backLabel="Back (Esc)"
          onBack={() => dispatch({ type: 'leave-preview' })}
        >
          <strong className="font-semibold">Preview</strong> — not the live game · {view.title}
        </ViewBanner>
      )
    case 'replay':
      return (
        <ViewBanner
          tone="replay"
          backLabel="Back to game"
          onBack={() => dispatch({ type: 'show-live' })}
        >
          <strong className="font-semibold">Past game</strong> · {describeEnding(view.game)} ·{' '}
          {new Date(view.game.startedAt).toLocaleDateString()}
          <button
            type="button"
            className="ml-3 underline decoration-dotted hover:text-sky-100"
            onClick={() => void navigator.clipboard.writeText(view.game.pgn)}
            title="Copy the game in PGN, for other chess programs"
          >
            Copy PGN
          </button>
        </ViewBanner>
      )
    case 'analysis':
      return (
        <ViewBanner
          tone="analysis"
          backLabel="Back to game"
          onBack={() => dispatch({ type: 'show-live' })}
        >
          <strong className="font-semibold">Analysis board</strong> — moves here do not touch the
          game
        </ViewBanner>
      )
    case 'live': {
      // The same height as a banner, so the board does not move when one appears.
      if (view.ply === null || !game) return <div className="h-10 shrink-0" aria-hidden="true" />
      const move = game.moves[view.ply - 1]
      return (
        <ViewBanner
          tone="history"
          backLabel="Back to the current position"
          onBack={() => dispatch({ type: 'show-live' })}
        >
          Looking at the game{' '}
          {move ? `after ${numberedMove(game.initialFen, view.ply, move.san)}` : 'at the start'}
        </ViewBanner>
      )
    }
    case 'puzzle':
      return (
        <ViewBanner tone="puzzle" backLabel="Leave puzzle" onBack={() => void api.puzzle.close()}>
          <strong className="font-semibold">Puzzle</strong>
          {puzzle && ` · ${puzzleHeading(puzzle)}`}
        </ViewBanner>
      )
    case 'editor':
      return null
  }
}
