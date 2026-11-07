// The game being played: the player's moves, the opponent's replies, and keeping it all stored.
// There is at most one game under way; starting another leaves the last one abandoned.
import { Chess } from 'chess.js'
import type {
  Color,
  GameRecord,
  GameState,
  GameSummary,
  MoveInput,
  NewGameOptions,
  OpponentKind,
  Result,
  SideChoice,
} from '@shared/chess'
import { START_FEN } from '@shared/chess'
import { parseUci } from '@shared/notation'
import { normalizeFen, outcome } from '../chess/rules'
import { Listeners } from '../util/listeners'
import { Game } from './game'
import type { Opponent } from './opponent'
import type { GameStore } from './store'

export interface GameServiceOptions {
  store: GameStore
  /** Who chooses the opponent's moves, for each kind of opponent a game can have. */
  opponents: Record<OpponentKind, Opponent>
  /** The opponent waits at least this long before moving, so its replies do not land instantly. */
  minReplyDelayMs?: number
  random?: () => number
  now?: () => Date
  log?: (message: string, error?: unknown) => void
}

export type GameChange = Result<{ state: GameState }>

const NO_GAME = { ok: false, error: 'There is no game under way' } as const
const DEFAULT_MIN_REPLY_DELAY_MS = 400

export class GameService {
  private game: Game | null = null
  /** Set while the opponent chooses its move; aborting it gives up on that move. */
  private reply: AbortController | null = null
  private opponentFailed = false
  private readonly changes = new Listeners<GameState | null>()
  private readonly store: GameStore
  private readonly opponents: Record<OpponentKind, Opponent>
  private readonly minReplyDelayMs: number
  private readonly random: () => number
  private readonly now: () => Date
  private readonly log: (message: string, error?: unknown) => void

  constructor(options: GameServiceOptions) {
    this.store = options.store
    this.opponents = options.opponents
    this.minReplyDelayMs = options.minReplyDelayMs ?? DEFAULT_MIN_REPLY_DELAY_MS
    this.random = options.random ?? Math.random
    this.now = options.now ?? (() => new Date())
    this.log = options.log ?? ((message, error) => console.error(message, error))
  }

  /** Calls `listener` with the game whenever it changes; returns a function that stops it. */
  onChange(listener: (state: GameState | null) => void): () => void {
    return this.changes.add(listener)
  }

  current(): GameState | null {
    return this.game?.state({ thinking: this.reply !== null, failed: this.opponentFailed }) ?? null
  }

  /** Carries on with the last game left under way, if any. */
  resume(): void {
    const stored = this.store.latestInProgress()
    if (!stored) return
    try {
      this.take(Game.restore(stored))
    } catch (error) {
      this.log(`Could not carry on with game ${stored.id}; leaving it abandoned`, error)
      this.store.save({
        ...stored,
        status: 'abandoned',
        termination: 'abandoned',
        endedAt: this.now().toISOString(),
      })
    }
  }

  newGame(options: NewGameOptions): GameChange {
    let initialFen = START_FEN
    if (options.fen !== undefined) {
      const normalized = normalizeFen(options.fen)
      if (!normalized.ok) return normalized
      initialFen = normalized.fen
    }
    if (outcome(new Chess(initialFen))) {
      return { ok: false, error: 'The game is already over in that position' }
    }

    // Stored before the last game is left: SQLite reuses the highest id once it is deleted, and
    // a new game must never take an old game's id.
    const game = Game.restore(
      this.store.create({
        playerColor: this.pickColor(options.playerColor),
        engineLevel: options.engineLevel,
        opponent: options.opponent,
        initialFen,
        startedAt: this.now().toISOString(),
      }),
    )
    this.leaveCurrent()
    this.opponents[game.opponent].newGame?.()
    this.take(game)
    return this.changed()
  }

  move(input: MoveInput): GameChange {
    const game = this.game
    if (!game) return NO_GAME
    if (this.reply) return { ok: false, error: 'Your opponent is still choosing its move' }
    const played = game.play(input, game.playerColor)
    if (!played.ok) return played
    this.store.save(game.record())
    this.afterChange()
    return this.changed()
  }

  resign(): GameChange {
    return this.finish((game) => game.resign())
  }

  abandon(): GameChange {
    return this.finish((game) => game.abandon())
  }

  /** Asks the opponent for its move again, after it failed. */
  retryOpponent(): GameChange {
    if (!this.game) return NO_GAME
    this.opponentFailed = false
    this.afterChange()
    return this.changed()
  }

  list(limit?: number): GameSummary[] {
    return this.store.list(limit)
  }

  /** A stored game with every position in it, to step through. */
  record(id: number): Result<{ game: GameRecord }> {
    const stored = this.store.get(id)
    if (!stored) return { ok: false, error: `There is no game ${id}` }
    const game = Game.restore(stored)
    const { moves } = game.state({ thinking: false, failed: false })
    return {
      ok: true,
      game: { ...game.summary(), initialFen: stored.initialFen, moves, pgn: game.pgn() },
    }
  }

  private finish(end: (game: Game) => void): GameChange {
    const game = this.game
    if (!game) return NO_GAME
    if (game.isOver) return { ok: false, error: 'The game is already over' }
    end(game)
    this.cancelReply()
    this.store.save(game.record())
    this.emit()
    return this.changed()
  }

  /** Leaves the current game for a new one: abandoned, or forgotten if no move was made. */
  private leaveCurrent(): void {
    const game = this.game
    this.cancelReply()
    if (!game || game.isOver) return
    if (game.plies === 0) {
      this.store.delete(game.id)
    } else {
      game.abandon()
      this.store.save(game.record())
    }
  }

  private take(game: Game): void {
    this.game = game
    this.opponentFailed = false
    this.afterChange()
  }

  /** Tells everyone, then lets the opponent move if it is its turn. */
  private afterChange(): void {
    const game = this.game
    if (game && !game.isOver && game.turn === game.opponentColor && !this.opponentFailed) {
      const reply = new AbortController()
      this.reply = reply
      void this.opponentReply(game, reply)
    }
    this.emit()
  }

  private async opponentReply(game: Game, reply: AbortController): Promise<void> {
    const started = this.now().getTime()
    try {
      const uci = await this.opponents[game.opponent].chooseMove(
        { gameId: game.id, fen: game.fen, level: game.engineLevel },
        reply.signal,
      )
      const waited = this.now().getTime() - started
      if (waited < this.minReplyDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, this.minReplyDelayMs - waited))
      }
      if (reply.signal.aborted) return
      const move = uci ? parseUci(uci) : null
      const played = move ? game.play(move, game.opponentColor) : null
      if (!played?.ok) {
        throw new Error(`The opponent chose a move that cannot be played: ${uci ?? 'none'}`)
      }
      this.store.save(game.record())
    } catch (error) {
      if (reply.signal.aborted) return
      this.log('The opponent could not choose a move', error)
      this.opponentFailed = true
    } finally {
      if (this.reply === reply) {
        this.reply = null
        this.emit()
      }
    }
  }

  /** Gives up on the opponent's move under way, if any; a late answer is then ignored. */
  private cancelReply(): void {
    this.reply?.abort()
    this.reply = null
  }

  private pickColor(choice: SideChoice): Color {
    if (choice !== 'random') return choice
    return this.random() < 0.5 ? 'white' : 'black'
  }

  /** The game as it now stands, as the answer to a request that changed it. */
  private changed(): GameChange {
    const state = this.current()
    return state ? { ok: true, state } : NO_GAME
  }

  private emit(): void {
    this.changes.emit(this.current())
  }
}
