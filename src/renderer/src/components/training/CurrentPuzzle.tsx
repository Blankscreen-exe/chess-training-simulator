import type { PuzzleState } from '@shared/training'
import { api } from '../../lib/api'
import { practiceNote, puzzleName, puzzleProgress, puzzleThemes } from '../../lib/puzzle'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

/** The puzzle on the board: how it is going, and help with it. */
export function CurrentPuzzle({
  puzzle,
  onBoard,
  onShow,
}: {
  puzzle: PuzzleState
  /** Whether the board is showing the puzzle, rather than the game or another view. */
  onBoard: boolean
  onShow: () => void
}) {
  const solving = puzzle.status === 'solving'
  const themes = puzzleThemes(puzzle)
  const note = practiceNote(puzzle)

  return (
    <Card title="On the board">
      <p className="font-medium text-stone-100">{puzzleName(puzzle)}</p>
      <p className={puzzle.wrongMove ? 'text-red-300' : 'text-stone-300'} aria-live="polite">
        {puzzleProgress(puzzle)}
      </p>
      {note && <p className="text-xs text-stone-400">{note}</p>}
      {themes.length > 0 && <p className="text-xs text-stone-400">Ideas: {themes.join(', ')}</p>}
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
    </Card>
  )
}
