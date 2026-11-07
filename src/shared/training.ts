// Training content: the library of puzzles and openings the app downloads, and puzzles being
// solved. These are the types the main process and the page share about them.
import type { Color, PlayedMove, Position } from './chess'
import type { PlayerLevel } from './coach'

/** What the installed library holds. */
export interface LibraryContents {
  puzzles: number
  openings: number
  /** When it was installed, as an ISO date. */
  installedAt: string
}

/** How far an install has got. */
export type InstallProgress =
  | {
      stage: 'puzzles'
      receivedBytes: number
      /** The size of the download, if the server said. */
      totalBytes: number | null
      /** Puzzles kept so far. */
      puzzles: number
    }
  | { stage: 'openings' }
  | { stage: 'finishing' }

export interface LibraryState {
  /** The library in use; null until one has been installed. */
  contents: LibraryContents | null
  /** The install under way, if any. The library in use stays usable until it finishes. */
  install: InstallProgress | null
  /** Why the last install failed, until another starts. */
  error: string | null
}

/**
 * Lichess's puzzle themes the app offers by name. Puzzles may carry others, which are kept and
 * shown by their Lichess name.
 */
export const PUZZLE_THEME_NAMES = {
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2',
  mateIn3: 'Mate in 3',
  mateIn4: 'Mate in 4',
  mate: 'Checkmate',
  backRankMate: 'Back-rank mate',
  smotheredMate: 'Smothered mate',
  fork: 'Fork',
  pin: 'Pin',
  skewer: 'Skewer',
  discoveredAttack: 'Discovered attack',
  discoveredCheck: 'Discovered check',
  doubleCheck: 'Double check',
  hangingPiece: 'Hanging piece',
  trappedPiece: 'Trapped piece',
  sacrifice: 'Sacrifice',
  deflection: 'Deflection',
  attraction: 'Attraction',
  clearance: 'Clearance',
  interference: 'Interference',
  intermezzo: 'In-between move',
  capturingDefender: 'Capturing the defender',
  xRayAttack: 'X-ray attack',
  quietMove: 'Quiet move',
  defensiveMove: 'Defensive move',
  zugzwang: 'Zugzwang',
  kingsideAttack: 'Kingside attack',
  queensideAttack: 'Queenside attack',
  exposedKing: 'Exposed king',
  attackingF2F7: 'Attacking f2 or f7',
  advancedPawn: 'Advanced pawn',
  promotion: 'Promotion',
  underPromotion: 'Underpromotion',
  enPassant: 'En passant',
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
  pawnEndgame: 'Pawn endgame',
  rookEndgame: 'Rook endgame',
  bishopEndgame: 'Bishop endgame',
  knightEndgame: 'Knight endgame',
  queenEndgame: 'Queen endgame',
  oneMove: 'One move',
  short: 'Short',
  long: 'Long',
  veryLong: 'Very long',
} as const satisfies Record<string, string>

export type PuzzleTheme = keyof typeof PUZZLE_THEME_NAMES
export const PUZZLE_THEMES = Object.keys(PUZZLE_THEME_NAMES) as [PuzzleTheme, ...PuzzleTheme[]]

/** A theme's name: the app's own, or else Lichess's, spaced out ("rookEndgame" → "rook endgame"). */
export function themeName(theme: string): string {
  if (theme in PUZZLE_THEME_NAMES) return PUZZLE_THEME_NAMES[theme as PuzzleTheme]
  const words = theme.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The piece that makes a puzzle's first winning move, for lessons about one piece. */
export const PUZZLE_PIECES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const
export type PuzzlePiece = (typeof PUZZLE_PIECES)[number]

/** The puzzle ratings that suit each player, before the app knows how they do. */
export const PUZZLE_RATINGS: Record<PlayerLevel, { min: number; max: number }> = {
  beginner: { min: 600, max: 1100 },
  casual: { min: 1000, max: 1500 },
  club: { min: 1400, max: 1900 },
  advanced: { min: 1800, max: 2500 },
}

/** What puzzle to find; anything left out is not a constraint. */
export interface PuzzleRequest {
  theme?: string
  piece?: PuzzlePiece
  /** The range of ratings; the player's level sets it if left out. */
  rating?: { min: number; max: number }
}

/**
 * - `solving`: the player is finding the moves.
 * - `solved`: they found every one.
 * - `revealed`: they asked to see the answer, which was played out.
 */
export const PUZZLE_STATUSES = ['solving', 'solved', 'revealed'] as const
export type PuzzleStatus = (typeof PUZZLE_STATUSES)[number]

/** How a try at a puzzle ended: as it finished, or 'left' when the player moved on before. */
export const PUZZLE_RESULTS = ['solved', 'revealed', 'left'] as const
export type PuzzleResult = (typeof PUZZLE_RESULTS)[number]

/** A puzzle on the board, as it stands. */
export interface PuzzleState {
  /** Lichess's id for the puzzle. */
  id: string
  rating: number
  themes: string[]
  /** Where it comes from, when the coach chose it: "Bishop tricks, 2 of 3". */
  title: string | null
  playerColor: Color
  /** The position before the opponent's move that sets the puzzle. */
  initialFen: string
  /** The opponent's setting move, then the moves played since. */
  moves: PlayedMove[]
  /** The position now. The player may move only while solving, and on their own turn. */
  position: Position
  status: PuzzleStatus
  /** How many of the player's moves the answer has, and how many they have found. */
  solutionLength: number
  found: number
  /** Moves tried that were not the answer. */
  mistakes: number
  /** The last of them, in standard notation, until the next move is found. */
  wrongMove: string | null
  /** The square of the piece to move, once a hint has been asked for. */
  hint: string | null
  hints: number
}

/** A named opening from the library, with the moves that reach it from the start. */
export interface Opening {
  /** Its code in the Encyclopaedia of Chess Openings, as "B90". */
  eco: string
  name: string
  /** In standard notation. */
  moves: string[]
}
