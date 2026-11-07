import type { LibraryState, PuzzleState } from '@shared/training'
import { LibraryCard } from './LibraryCard'
import { PuzzleCard } from './PuzzleCard'

/** Training from the library: installing it, and puzzles once it is there. */
export function TrainingPanel({
  library,
  puzzle,
  puzzleOnBoard,
  onShowPuzzle,
}: {
  library: LibraryState | undefined
  puzzle: PuzzleState | null
  puzzleOnBoard: boolean
  onShowPuzzle: () => void
}) {
  if (!library) return <p className="p-4 text-sm text-stone-500">Loading…</p>
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      {library.contents && (
        <PuzzleCard puzzle={puzzle} onBoard={puzzleOnBoard} onShow={onShowPuzzle} />
      )}
      <LibraryCard library={library} />
    </div>
  )
}
