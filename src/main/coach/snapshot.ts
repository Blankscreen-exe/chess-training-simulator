// The game, the puzzle on the board and the player's profile as Claude reads them: short, in the
// notation chess players use, and with nothing it would have to work out for itself. Claude is
// told never to judge positions on its own, so the game's says whose move it is, what was
// played, and how the game stands, and no more.
import type { GameState } from '@shared/chess'
import { engineLevelName } from '@shared/engine-levels'
import { numberedLine, numberedMove } from '@shared/notation'
import { weakestAndStrongest, type PlayerProfile, type ThemeRecord } from '@shared/profile'
import { themeName, type Opening, type PracticeOrigin, type PuzzleState } from '@shared/training'
import { daysSince, timeUntil } from '../util/time'

export interface GameSnapshot {
  game_id: number
  status: GameState['status']
  result: GameState['result']
  termination: GameState['termination'] | null
  player_color: GameState['playerColor']
  engine_level: string
  opponent: GameState['opponent']
  /** The named opening the game is in, if the library knows it. */
  opening: string | null
  side_to_move: GameState['position']['turn']
  in_check: boolean
  fen: string
  moves: string
  move_count: number
  opponent_thinking: boolean
}

export function snapshotOf(game: GameState, opening: Opening | null): GameSnapshot {
  return {
    game_id: game.id,
    status: game.status,
    result: game.result,
    termination: game.termination ?? null,
    player_color: game.playerColor,
    engine_level: engineLevelName(game.engineLevel),
    opponent: game.opponent,
    opening: opening ? `${opening.eco} ${opening.name}` : null,
    side_to_move: game.position.turn,
    in_check: game.position.check,
    fen: game.position.fen,
    moves: numberedLine(
      game.initialFen,
      game.moves.map((move) => move.san),
    ),
    move_count: game.moves.length,
    opponent_thinking: game.opponentThinking,
  }
}

/** A puzzle as Claude reads it, answer included so it can give hints; the player never sees this. */
export interface PuzzleSnapshot {
  puzzle_id: string
  /** Null for a position from the player's own game. */
  rating: number | null
  themes: string[]
  title: string | null
  /** Where a position the player is practising comes from; null for a new puzzle. */
  practice:
    | { from: 'a puzzle they missed' }
    | { from: 'their own game'; game_id: number; they_played: string }
    | null
  player_color: PuzzleState['playerColor']
  status: PuzzleState['status']
  /** The opponent's move that sets the puzzle. */
  opponent_move: string
  /** The whole answer from there, the opponent's replies included. Do not give it away. */
  answer: string
  fen: string
  moves_found: number
  moves_to_find: number
  mistakes: number
  hints: number
}

export function puzzleSnapshotOf(puzzle: PuzzleState, answer: readonly string[]): PuzzleSnapshot {
  const [setting] = puzzle.moves
  return {
    puzzle_id: puzzle.id,
    rating: puzzle.rating,
    themes: puzzle.themes.map(themeName),
    title: puzzle.title,
    practice: practiceSnapshotOf(puzzle.practice),
    player_color: puzzle.playerColor,
    status: puzzle.status,
    opponent_move: setting ? numberedMove(puzzle.initialFen, 1, setting.san) : '',
    answer: setting ? numberedLine(setting.fenAfter, answer) : '',
    fen: puzzle.position.fen,
    moves_found: puzzle.found,
    moves_to_find: puzzle.solutionLength,
    mistakes: puzzle.mistakes,
    hints: puzzle.hints,
  }
}

function practiceSnapshotOf(origin: PracticeOrigin | null): PuzzleSnapshot['practice'] {
  if (!origin) return null
  if (origin.from === 'puzzle') return { from: 'a puzzle they missed' }
  return { from: 'their own game', game_id: origin.gameId, they_played: origin.played }
}

/** How many themes the profile lists at each end: the player's weakest and strongest. */
const LISTED_THEMES = 5

/** The player's profile as Claude reads it: short, with times from now. */
export interface ProfileSnapshot {
  puzzles: {
    /** Null until they have tried enough puzzles for one. */
    rating: number | null
    first_tries: number
    solved_first_time: number
    weakest_themes: { theme: string; tries: number; solved: number }[]
    strongest_themes: { theme: string; tries: number; solved: number }[]
  }
  games: PlayerProfile['games']
  mistakes: { reviewed_games: number; by_phase: PlayerProfile['mistakes']['byPhase'] }
  weaknesses: {
    pattern: string
    theme: string | null
    note: string | null
    times_noted: number
    /** As "3 days ago". */
    last_noted: string
  }[]
  /** Themes to aim puzzles at, the most pressing first. */
  weak_spots: string[]
  practice: {
    due_now: number
    coming_back_later: number
    learned: number
    /** As "in 20 hours"; null if none is waiting. */
    next_due: string | null
  }
}

export function profileSnapshotOf(profile: PlayerProfile, now: Date): ProfileSnapshot {
  const { puzzles, mistakes, practice } = profile
  const theme = ({ theme, tries, solved }: ThemeRecord) => ({ theme, tries, solved })
  const { weakest, strongest } = weakestAndStrongest(puzzles.themes, LISTED_THEMES)
  return {
    puzzles: {
      rating: puzzles.rating,
      first_tries: puzzles.tries,
      solved_first_time: puzzles.solved,
      weakest_themes: weakest.map(theme),
      strongest_themes: strongest.map(theme),
    },
    games: profile.games,
    mistakes: { reviewed_games: mistakes.games, by_phase: mistakes.byPhase },
    weaknesses: profile.weaknesses.map((weakness) => ({
      pattern: weakness.pattern,
      theme: weakness.theme,
      note: weakness.note,
      times_noted: weakness.seen,
      last_noted: daysSince(weakness.lastSeen, now),
    })),
    weak_spots: profile.weakSpots,
    practice: {
      due_now: practice.due,
      coming_back_later: practice.waiting,
      learned: practice.learned,
      next_due: practice.nextDue && timeUntil(practice.nextDue, now),
    },
  }
}
