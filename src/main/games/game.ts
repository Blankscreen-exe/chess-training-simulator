// One game between the player and their opponent: its moves, whose turn it is, and how it ended.
// It knows nothing of storage or of who chooses the opponent's moves; GameService does that.
import { Chess, type Move } from 'chess.js'
import type {
  Color,
  GameResult,
  GameState,
  GameStatus,
  GameSummary,
  MoveInput,
  OpponentKind,
  PlayedMove,
  Result,
  Termination,
} from '@shared/chess'
import { otherColor, START_FEN } from '@shared/chess'
import { engineLevelName, type EngineLevelId } from '@shared/engine-levels'
import { toUci } from '@shared/notation'
import {
  colorOf,
  describePosition,
  outcome,
  replay,
  resultOfResigning,
  toPlayedMove,
  tryMove,
} from '../chess/rules'

/** What is stored of a game: enough to rebuild it. */
export interface StoredGame {
  id: number
  playerColor: Color
  engineLevel: EngineLevelId
  opponent: OpponentKind
  initialFen: string
  startedAt: string
  endedAt?: string
  /** The moves in UCI notation. */
  moves: string[]
  status: GameStatus
  result: GameResult
  termination?: Termination
}

export class Game {
  private readonly chess: Chess
  private readonly played: PlayedMove[]
  private lastMove: Move | undefined
  private stored: StoredGame

  private constructor(stored: StoredGame) {
    this.chess = new Chess(stored.initialFen)
    const { played, refused } = replay(this.chess, stored.moves)
    if (refused) {
      throw new Error(`Game ${stored.id} has a move that cannot be played: ${refused.move}`)
    }
    this.played = played.map(toPlayedMove)
    this.lastMove = played.at(-1)
    this.stored = { ...stored, moves: [...stored.moves] }
  }

  /** Rebuilds a game from what was stored, replaying its moves. */
  static restore(stored: StoredGame): Game {
    return new Game(stored)
  }

  get id(): number {
    return this.stored.id
  }

  get playerColor(): Color {
    return this.stored.playerColor
  }

  get opponentColor(): Color {
    return otherColor(this.stored.playerColor)
  }

  get opponent(): OpponentKind {
    return this.stored.opponent
  }

  get engineLevel(): EngineLevelId {
    return this.stored.engineLevel
  }

  get turn(): Color {
    return colorOf(this.chess.turn())
  }

  get fen(): string {
    return this.chess.fen()
  }

  get isOver(): boolean {
    return this.stored.status !== 'in_progress'
  }

  get plies(): number {
    return this.played.length
  }

  /** Plays a move for `by`, if it is their turn and the move is legal. */
  play(move: MoveInput, by: Color): Result {
    if (this.isOver) return { ok: false, error: 'The game is over' }
    if (by !== this.turn) return { ok: false, error: `It is ${this.turn}'s move` }
    const done = tryMove(this.chess, move)
    if (!done) return { ok: false, error: `${toUci(move)} is not a legal move here` }

    this.lastMove = done
    this.played.push(toPlayedMove(done))
    this.stored.moves.push(toUci(done))
    const ended = outcome(this.chess)
    if (ended) this.end('finished', ended.result, ended.termination)
    return { ok: true }
  }

  /** The player gives up. */
  resign(): void {
    if (!this.isOver) {
      this.end('resigned', resultOfResigning(this.stored.playerColor), 'resignation')
    }
  }

  /** The game is left unfinished. */
  abandon(): void {
    if (!this.isOver) this.end('abandoned', '*', 'abandoned')
  }

  /** What is stored of the game. */
  record(): StoredGame {
    return { ...this.stored, moves: [...this.stored.moves] }
  }

  summary(): GameSummary {
    return summaryOf(this.stored)
  }

  state(opponent: { thinking: boolean; failed: boolean }): GameState {
    const { moves, ...stored } = this.stored
    return {
      ...stored,
      moves: this.played.map((move) => ({ ...move })),
      position: describePosition(this.chess, this.lastMove),
      opponentThinking: opponent.thinking && !this.isOver,
      opponentFailed: opponent.failed && !this.isOver,
    }
  }

  /** The game in PGN, the format other chess programs read. */
  pgn(): string {
    const engine =
      this.stored.opponent === 'coach'
        ? 'Coach (choosing from Stockfish)'
        : `Stockfish (${engineLevelName(this.stored.engineLevel)})`
    const headers: [string, string][] = [
      ['Event', 'Training game'],
      ['Site', 'Chess Training Simulator'],
      ['Date', this.stored.startedAt.slice(0, 10).replaceAll('-', '.')],
      ['White', this.stored.playerColor === 'white' ? 'You' : engine],
      ['Black', this.stored.playerColor === 'black' ? 'You' : engine],
      ['Result', this.stored.result],
    ]
    if (this.stored.initialFen !== START_FEN) {
      headers.push(['SetUp', '1'], ['FEN', this.stored.initialFen])
    }
    for (const [name, value] of headers) this.chess.setHeader(name, value)
    return this.chess.pgn()
  }

  private end(status: GameStatus, result: GameResult, termination: Termination): void {
    this.stored = { ...this.stored, status, result, termination, endedAt: new Date().toISOString() }
  }
}

/** A stored game as the history lists it, without replaying its moves. */
export function summaryOf(stored: StoredGame): GameSummary {
  const { moves, initialFen, ...summary } = stored
  return { ...summary, plies: moves.length }
}
