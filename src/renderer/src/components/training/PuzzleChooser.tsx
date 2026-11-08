import { useState } from 'react'
import type { PlayerProfile } from '@shared/profile'
import {
  PUZZLE_PIECES,
  PUZZLE_THEME_NAMES,
  PUZZLE_THEMES,
  themeName,
  type PuzzleRequest,
} from '@shared/training'
import { useStartPuzzle } from '../../hooks/useStartPuzzle'
import {
  loadPuzzleChoices,
  savePuzzleChoices,
  WEAK_SPOTS,
  type PuzzleChoices,
} from '../../lib/preferences'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

const SELECT = 'w-full rounded bg-stone-800 px-2 py-1 text-sm text-stone-200'
const PIECE_NAMES = {
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  rook: 'Rook',
  queen: 'Queen',
  king: 'King',
} as const

function requestOf({ theme, piece }: PuzzleChoices): PuzzleRequest {
  return {
    ...(theme === WEAK_SPOTS ? { weakSpots: true } : theme ? { theme } : {}),
    ...(piece ? { piece } : {}),
  }
}

/** Choosing the next puzzle from the library, by theme and the piece that wins. */
export function PuzzleChooser({
  profile,
  another,
  onShow,
}: {
  profile: PlayerProfile | undefined
  /** Whether a puzzle has just been done, so this one is the next. */
  another: boolean
  onShow: () => void
}) {
  const [choices, setChoices] = useState(loadPuzzleChoices)
  const { start, problem } = useStartPuzzle(onShow)
  const weakSpots = profile?.weakSpots ?? []
  const rating = profile?.puzzles.rating ?? null

  const choose = (change: Partial<PuzzleChoices>) => {
    const next = { ...choices, ...change }
    setChoices(next)
    savePuzzleChoices(next)
  }
  const chooseTheme = (value: string) =>
    choose({
      theme: value === WEAK_SPOTS ? WEAK_SPOTS : (PUZZLE_THEMES.find((t) => t === value) ?? null),
    })

  return (
    <Card title="Puzzles">
      <div className="grid grid-cols-2 gap-2 text-xs text-stone-400">
        <label className="space-y-1">
          <span>Theme</span>
          <select
            className={SELECT}
            value={choices.theme ?? ''}
            onChange={(event) => chooseTheme(event.target.value)}
          >
            <option value="">Any</option>
            <option value={WEAK_SPOTS} disabled={weakSpots.length === 0}>
              {weakSpots.length === 0 ? 'Your weak spots (none yet)' : 'Your weak spots'}
            </option>
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
      {choices.theme === WEAK_SPOTS && weakSpots.length > 0 && (
        <p className="text-xs text-stone-400">
          From: {weakSpots.map((theme) => themeName(theme)).join(', ')}
        </p>
      )}
      <p className="text-xs text-stone-500">
        {rating === null
          ? 'Rated to suit the level set in the Coach tab, until you have a puzzle rating.'
          : `Rated around your puzzle rating, ${rating}.`}
      </p>
      <Button
        variant={another ? 'primary' : 'secondary'}
        onClick={() => void start(requestOf(choices))}
      >
        {another ? 'Next puzzle' : 'Start a puzzle'}
      </Button>
      {problem && (
        <p className="text-red-300" role="alert">
          {problem}
        </p>
      )}
    </Card>
  )
}
