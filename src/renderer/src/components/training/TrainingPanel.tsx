import type { PlayerProfile } from '@shared/profile'
import type { LibraryState, PuzzleState } from '@shared/training'
import { CurrentPuzzle } from './CurrentPuzzle'
import { LibraryCard } from './LibraryCard'
import { PracticeCard } from './PracticeCard'
import { PuzzleChooser } from './PuzzleChooser'

/**
 * Training: the puzzle on the board, practising missed positions, choosing puzzles once the
 * library is installed, and the library itself. Practice needs no library: its positions are
 * kept with the player's own data.
 */
export function TrainingPanel({
  library,
  profile,
  puzzle,
  puzzleOnBoard,
  onShowPuzzle,
}: {
  library: LibraryState | undefined
  profile: PlayerProfile | undefined
  puzzle: PuzzleState | null
  puzzleOnBoard: boolean
  onShowPuzzle: () => void
}) {
  if (!library) return <p className="p-4 text-sm text-stone-500">Loading…</p>
  const solving = puzzle?.status === 'solving'
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      {puzzle && <CurrentPuzzle puzzle={puzzle} onBoard={puzzleOnBoard} onShow={onShowPuzzle} />}
      {/* While a puzzle is being solved, it would count among those due: shown once it is over. */}
      {profile && !solving && <PracticeCard practice={profile.practice} onShow={onShowPuzzle} />}
      {library.contents && !solving && (
        <PuzzleChooser profile={profile} another={puzzle !== null} onShow={onShowPuzzle} />
      )}
      <LibraryCard library={library} />
    </div>
  )
}
