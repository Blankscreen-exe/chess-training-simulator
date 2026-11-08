// What the player's first tries at puzzles say about them: a rating, how they do at each theme,
// and so which themes to aim puzzles at.
import { RATED_AFTER, type ThemeRecord, type Weakness } from '@shared/profile'
import { isPuzzleTheme, SKILL_THEMES, type PuzzleTheme } from '@shared/training'
import type { FirstTry } from '../puzzles/attempts'

/** First tries during which the rating moves fast, to find the player's level soon. */
const PROVISIONAL_TRIES = 20
const PROVISIONAL_K = 40
const SETTLED_K = 20

/**
 * An Elo rating from first tries, oldest first, starting from `start`: a clean solve counts as
 * beating a player of the puzzle's rating, any other try as losing to one. Null before
 * RATED_AFTER tries.
 */
export function puzzleRating(tries: readonly FirstTry[], start: number): number | null {
  if (tries.length < RATED_AFTER) return null
  let rating = start
  for (const [index, attempt] of tries.entries()) {
    const expected = 1 / (1 + 10 ** ((attempt.rating - rating) / 400))
    const k = index < PROVISIONAL_TRIES ? PROVISIONAL_K : SETTLED_K
    rating += k * ((attempt.outcome === 'clean' ? 1 : 0) - expected)
  }
  return Math.round(rating)
}

/** First tries at a theme before the player's record at it counts. */
export const THEME_TRIES = 4

const SKILLS: ReadonlySet<string> = new Set(SKILL_THEMES)

/** How the player does at each skill they have tried often enough, the weakest first. */
export function themeRecords(tries: readonly FirstTry[]): ThemeRecord[] {
  const records = new Map<PuzzleTheme, ThemeRecord>()
  for (const attempt of tries) {
    for (const theme of attempt.themes) {
      if (!isPuzzleTheme(theme) || !SKILLS.has(theme)) continue
      const record = records.get(theme) ?? { theme, tries: 0, solved: 0 }
      record.tries++
      if (attempt.outcome === 'clean') record.solved++
      records.set(theme, record)
    }
  }
  return [...records.values()]
    .filter((record) => record.tries >= THEME_TRIES)
    .sort(
      (a, b) =>
        a.solved / a.tries - b.solved / b.tries ||
        b.tries - a.tries ||
        a.theme.localeCompare(b.theme),
    )
}

/** The most themes puzzles are aimed at. */
const MAX_WEAK_SPOTS = 5
/** How much less often than puzzles overall the player solves a theme for it to count as weak. */
const WEAK_BY = 0.1

/**
 * The themes to aim puzzles at: those of the weaknesses the coach has noted, the most often seen
 * first, then those the player solves clearly less often than puzzles overall (`overall`, from 0
 * to 1), the weakest first.
 */
export function weakSpots(
  weaknesses: readonly Weakness[],
  themes: readonly ThemeRecord[],
  overall: number,
): PuzzleTheme[] {
  const noted = [...weaknesses]
    .sort((a, b) => b.seen - a.seen || b.lastSeen.localeCompare(a.lastSeen))
    .flatMap((weakness) => (weakness.theme ? [weakness.theme] : []))
  const weak = themes
    .filter((record) => record.solved / record.tries < overall - WEAK_BY)
    .map((record) => record.theme)
  return [...new Set([...noted, ...weak])].slice(0, MAX_WEAK_SPOTS)
}
