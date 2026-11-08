// The player's profile: how they do at puzzles and in games, the weaknesses the coach has noted,
// and the positions they missed, coming back for practice. These are the types the main process
// and the page share about it.
import type { PuzzleTheme } from './training'

/** The parts of a game, as its mistakes are counted. */
export const GAME_PHASES = ['opening', 'middlegame', 'endgame'] as const
export type GamePhase = (typeof GAME_PHASES)[number]

/** How many first tries at puzzles the player needs before they are given a rating. */
export const RATED_AFTER = 10

/** How the player does at puzzles with one theme, on first tries. */
export interface ThemeRecord {
  theme: PuzzleTheme
  tries: number
  /** Solved first time: no wrong move, no hint. */
  solved: number
}

/**
 * The `count` weakest themes of a record (which lists them weakest first), and the `count`
 * strongest of the rest, strongest first.
 */
export function weakestAndStrongest(
  themes: readonly ThemeRecord[],
  count: number,
): { weakest: ThemeRecord[]; strongest: ThemeRecord[] } {
  const weakest = themes.slice(0, count)
  const strongest = themes.slice(weakest.length).slice(-count).reverse()
  return { weakest, strongest }
}

export interface PuzzleRecord {
  /** Estimated from their first tries at puzzles, once there are enough; null before. */
  rating: number | null
  /** First tries at puzzles from the library, bar those left without a move. */
  tries: number
  solved: number
  /** The themes tried often enough to tell, the weakest first. */
  themes: ThemeRecord[]
}

/** How the player's games have ended, from their side. */
export interface GamesRecord {
  won: number
  drawn: number
  lost: number
  /** Left before the end. */
  unfinished: number
}

/** The player's moves in some part of their games, and how many of them went wrong. */
export interface PhaseRecord {
  moves: number
  inaccuracies: number
  mistakes: number
  blunders: number
}

export interface MistakeRecord {
  /** How many of the latest games the engine reviewed, which these count. */
  games: number
  byPhase: Record<GamePhase, PhaseRecord>
}

/** A pattern in the player's mistakes, as the coach noted it. */
export interface Weakness {
  id: number
  /** A short name for it: "Leaves pieces undefended". */
  pattern: string
  /** The puzzle theme that trains it, if one does. */
  theme: PuzzleTheme | null
  /** The latest example the coach gave. */
  note: string | null
  /** How many times it has been noted. */
  seen: number
  /** When it was first and last noted, as ISO dates. */
  firstSeen: string
  lastSeen: string
}

/** The positions the player missed, coming back for practice. */
export interface PracticeRecord {
  /** Due now. */
  due: number
  /** Coming back later. */
  waiting: number
  /** Solved first time often enough, spaced far enough apart, to count as learned. */
  learned: number
  /** When the next one not yet due comes back, as an ISO date. */
  nextDue: string | null
}

export interface PlayerProfile {
  puzzles: PuzzleRecord
  games: GamesRecord
  mistakes: MistakeRecord
  weaknesses: Weakness[]
  /** The themes puzzles aimed at the player's weak spots are drawn from, the most pressing first. */
  weakSpots: PuzzleTheme[]
  practice: PracticeRecord
}
