import { useState } from 'react'
import {
  PUZZLE_PIECES,
  PUZZLE_THEME_NAMES,
  PUZZLE_THEMES,
  type PuzzleRequest,
  type PuzzleState,
} from '@shared/training'
import { api } from '../../lib/api'
import { loadPuzzleChoices, savePuzzleChoices, type PuzzleChoices } from '../../lib/preferences'
import { puzzleProgress, puzzleThemes } from '../../lib/puzzle'
import { Button } from '../ui/Button'

const SELECT = 'w-full rounded bg-stone-800 px-2 py-1 text-sm text-stone-200'
const PIECE_NAMES = {
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  rook: 'Rook',
  queen: 'Queen',
  king: 'King',
} as const

/** Puzzles: the one on the board and how it is going, and choosing the next. */
export function PuzzleCard({
  puzzle,
  onBoard,
  onShow,
}: {
  puzzle: PuzzleState | null
  /** Whether the board is showing the puzzle, rather than the game or another view. */
  onBoard: boolean
  onShow: () => void
}) {
  const [choices, setChoices] = useState(loadPuzzleChoices)
  const [problem, setProblem] = useState<string | null>(null)
  const solving = puzzle?.status === 'solving'

  const choose = (change: Partial<PuzzleChoices>) => {
    const next = { ...choices, ...change }
    setChoices(next)
    savePuzzleChoices(next)
  }
  const start = async () => {
    const request: PuzzleRequest = {
      ...(choices.theme ? { theme: choices.theme } : {}),
      ...(choices.piece ? { piece: choices.piece } : {}),
    }
    const result = await api.puzzle.start(request)
    setProblem(result.ok ? null : result.error)
    if (result.ok) onShow()
  }

  return (
    <section className="space-y-3 rounded-md border border-stone-800 bg-stone-900/60 p-3 text-sm">
      <h3 className="text-xs font-medium tracking-wide text-stone-400 uppercase">Puzzles</h3>

      {puzzle && (
        <div className="space-y-2">
          <p className="font-medium text-stone-100">
            {puzzle.title ?? `Puzzle rated ${puzzle.rating}`}
          </p>
          <p className={puzzle.wrongMove ? 'text-red-300' : 'text-stone-300'} aria-live="polite">
            {puzzleProgress(puzzle)}
          </p>
          {puzzleThemes(puzzle).length > 0 && (
            <p className="text-xs text-stone-400">Ideas: {puzzleThemes(puzzle).join(', ')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {!onBoard && (
              <Button variant="primary" onClick={onShow}>
                Back to the puzzle
              </Button>
            )}
            {solving && (
              <>
                <Button onClick={() => void api.puzzle.hint()} disabled={puzzle.hint !== null}>
                  Hint
                </Button>
                <Button onClick={() => void api.puzzle.reveal()}>Show the answer</Button>
              </>
            )}
            <Button onClick={() => void api.puzzle.close()}>Leave</Button>
          </div>
        </div>
      )}

      {!solving && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs text-stone-400">
            <label className="space-y-1">
              <span>Theme</span>
              <select
                className={SELECT}
                value={choices.theme ?? ''}
                onChange={(event) =>
                  choose({ theme: PUZZLE_THEMES.find((t) => t === event.target.value) ?? null })
                }
              >
                <option value="">Any</option>
                {PUZZLE_THEMES.map((theme) => (
                  <option key={theme} value={theme}>
                    {PUZZLE_THEME_NAMES[theme]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span>Winning piece</span>
              <select
                className={SELECT}
                value={choices.piece ?? ''}
                onChange={(event) =>
                  choose({ piece: PUZZLE_PIECES.find((p) => p === event.target.value) ?? null })
                }
              >
                <option value="">Any</option>
                {PUZZLE_PIECES.map((piece) => (
                  <option key={piece} value={piece}>
                    {PIECE_NAMES[piece]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-stone-500">Rated to suit the level set in the Coach tab.</p>
          <Button variant={puzzle ? 'primary' : 'secondary'} onClick={() => void start()}>
            {puzzle ? 'Next puzzle' : 'Start a puzzle'}
          </Button>
          {problem && (
            <p className="text-red-300" role="alert">
              {problem}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
