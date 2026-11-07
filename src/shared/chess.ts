// The chess vocabulary shared by the main process, which decides everything, and the renderer,
// which shows it. Squares are named as in algebraic notation ('e4'); moves are in UCI notation
// ('e2e4', 'e7e8q'), which is what the board and the engine both speak.
//
// Each closed set of values is an array first and a type second, so the same list feeds the
// types, the validation of requests, the database's checks and the screens that offer a choice.

import type { EngineLevelId } from './engine-levels'

export const COLORS = ['white', 'black'] as const
export type Color = (typeof COLORS)[number]

/** What the player can ask to play as, in the order they are offered. */
export const SIDE_CHOICES = ['white', 'random', 'black'] as const satisfies readonly (
  Color | 'random'
)[]
export type SideChoice = (typeof SIDE_CHOICES)[number]

/**
 * Who plays against the player: Stockfish at the chosen level, or the coach choosing among
 * Stockfish's best moves (to make the game more human, or to set up a lesson).
 */
export const OPPONENTS = ['engine', 'coach'] as const
export type OpponentKind = (typeof OPPONENTS)[number]

/** What a pawn can become, in the letters UCI uses. */
export const PROMOTION_PIECES = ['q', 'r', 'b', 'n'] as const
export type PromotionPiece = (typeof PROMOTION_PIECES)[number]

export const GAME_STATUSES = ['in_progress', 'finished', 'resigned', 'abandoned'] as const
export type GameStatus = (typeof GAME_STATUSES)[number]

/** Results as PGN writes them; '*' is a game without one. */
export const GAME_RESULTS = ['1-0', '0-1', '1/2-1/2', '*'] as const
export type GameResult = (typeof GAME_RESULTS)[number]

export const TERMINATIONS = [
  'checkmate',
  'stalemate',
  'insufficient_material',
  'threefold_repetition',
  'fifty_moves',
  'resignation',
  'abandoned',
] as const
export type Termination = (typeof TERMINATIONS)[number]

/** The standard starting position. */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function otherColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white'
}

/** What an operation that can be refused gives back: its value, or why it was refused. */
export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

/** A move as the player makes it on the board. */
export interface MoveInput {
  from: string
  to: string
  promotion?: PromotionPiece
}

/** A position as the board shows it. */
export interface ShownPosition {
  fen: string
  turn: Color
  check: boolean
  /** The move that led here, as its two squares, to highlight it. */
  lastMove?: [from: string, to: string]
}

/** A position with everything needed to let the side to move play in it. */
export interface Position extends ShownPosition {
  /** For each square with a piece that can move, the squares it can move to. */
  dests: Record<string, string[]>
  /** The moves, as from and to squares ('e7e8'), that need the player to choose a piece. */
  promotions: string[]
}

/** Only what the board shows of a position, without the moves that could be made in it. */
export function shownPart({ fen, turn, check, lastMove }: ShownPosition): ShownPosition {
  return lastMove ? { fen, turn, check, lastMove } : { fen, turn, check }
}

/** A move that was played, and the position after it. */
export interface PlayedMove {
  uci: string
  san: string
  color: Color
  /** Whether the move gives check. */
  check: boolean
  fenAfter: string
}

/** A game against the engine, as the history lists it. */
export interface GameSummary {
  id: number
  playerColor: Color
  engineLevel: EngineLevelId
  opponent: OpponentKind
  startedAt: string
  endedAt?: string
  status: GameStatus
  result: GameResult
  termination?: Termination
  /** How many moves, counting each side's separately. */
  plies: number
}

/** A game with every position in it, to step through. */
export interface GameRecord extends GameSummary {
  initialFen: string
  moves: PlayedMove[]
  pgn: string
}

/** The game being played, as it stands. */
export interface GameState extends Omit<GameSummary, 'plies'> {
  initialFen: string
  moves: PlayedMove[]
  position: Position
  /** Whether the engine is choosing its move. */
  opponentThinking: boolean
  /** Whether the engine failed to choose its move; the player can ask it to try again. */
  opponentFailed: boolean
}

/** How to start a game. */
export interface NewGameOptions {
  playerColor: SideChoice
  engineLevel: EngineLevelId
  opponent: OpponentKind
  /** The starting position; the standard one if left out. */
  fen?: string
}

/** One step of a line of moves: the move, and the position it leads to. */
export interface LineStep {
  uci: string
  san: string
  position: Position
}

/** An evaluation, from White's side: centipawns, or moves to mate (negative if Black mates). */
export type Score = { type: 'cp'; value: number } | { type: 'mate'; value: number }

/** The most candidate lines the engine is asked for at once. */
export const MAX_ANALYSIS_LINES = 5

/** One of the engine's candidate lines. */
export interface AnalysisLine {
  /** 1 for the best line, 2 for the next, and so on. */
  rank: number
  depth: number
  score: Score
  uci: string[]
  san: string[]
}

/** What the engine thinks of a position. */
export interface Analysis {
  fen: string
  depth: number
  lines: AnalysisLine[]
}

export interface AnalysisRequest {
  fen: string
  /** How many candidate lines, from 1 to MAX_ANALYSIS_LINES. */
  lines: number
}
