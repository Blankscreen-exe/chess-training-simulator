// The game being played: the player's moves, the engine's replies, and keeping it all stored.
// There is at most one game under way; starting another leaves the last one abandoned.
import { Chess } from 'chess.js'
import type {
  Color,
  GameRecord,
  GameState,
  GameSummary,
  MoveInput,
  NewGameOptions,
  Result,
  SideChoice,
} from '@shared/chess'
import { START_FEN } from '@shared/chess'
import { parseUci } from '@shared/notation'
import { normalizeFen, outcome } from '../chess/rules'
import { playSettings, type PlaySettings } from '../engine/levels'
import { Listeners } from '../util/listeners'
import { Game } from './game'
import type { GameStore } from './store'

/** The part of the engine a game needs. */
export interface PlayingEngine {
  bestMove(fen: string, settings: PlaySettings): Promise<string | null>
  newGame(): Promise<void>
  stop(): void
}

export interface GameServiceOptions {
  store: GameStore
  /** The engine to play with; asked for again after it fails, so it can be started afresh. */
  engine: () => PlayingEngine
  /** The engine waits at least this long before moving, so its replies do not land instantly. */
  minEngineDelayMs?: number
  random?: () => number
  now?: () => Date
  log?: (message: string, error?: unknown) => void
}

export type GameChange = Result<{ state: GameState }>

const NO_GAME = { ok: false, error: 'There is no game under way' } as const
const DEFAULT_MIN_ENGINE_DELAY_MS = 400

export class GameService {
  private game: Game | null = null
  private engineThinking = false
  private engineFailed = false
  /** Goes up whenever the game changes hands, so a reply meant for an old game is dropped. */
  private generation = 0
  private readonly changes = new Listeners<GameState | null>()
  private readonly store: GameStore
  private readonly engine: () => PlayingEngine
  private readonly minEngineDelayMs: number
  private readonly random: () => number
  private readonly now: () => Date
  private readonly log: (message: string, error?: unknown) => void

  constructor(options: GameServiceOptions) {
    this.store = options.store
    this.engine = options.engine
    this.minEngineDelayMs = options.minEngineDelayMs ?? DEFAULT_MIN_ENGINE_DELAY_MS
    this.random = options.random ?? Math.random
    this.now = options.now ?? (() => new Date())
    this.log = options.log ?? ((message, error) => console.error(message, error))
  }

  /** Calls `listener` with the game whenever it changes; returns a function that stops it. */
  onChange(listener: (state: GameState | null) => void): () => void {
    return this.changes.add(listener)
  }

  current(): GameState | null {
    return this.game?.state({ thinking: this.engineThinking, failed: this.engineFailed }) ?? null
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
        initialFen,
        startedAt: this.now().toISOString(),
      }),
    )
    this.leaveCurrent()
    void this.engine()
      .newGame()
      .catch((error: unknown) => this.log('The engine could not start a new game', error))
    this.take(game)
    return this.changed()
  }

  move(input: MoveInput): GameChange {
    const game = this.game
    if (!game) return NO_GAME
    if (this.engineThinking) return { ok: false, error: 'The engine is still choosing its move' }
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

  /** Asks the engine for its move again, after it failed. */
  retryEngine(): GameChange {
    if (!this.game) return NO_GAME
    this.engineFailed = false
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
    this.generation++
    this.stopEngine()
    this.store.save(game.record())
    this.emit()
    return this.changed()
  }

  /** Leaves the current game for a new one: abandoned, or forgotten if no move was made. */
  private leaveCurrent(): void {
    const game = this.game
    this.generation++
    this.stopEngine()
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
    this.generation++
    this.engineFailed = false
    this.afterChange()
  }

  /** Tells everyone, then lets the engine move if it is its turn. */
  private afterChange(): void {
    const game = this.game
    if (game && !game.isOver && game.turn === game.engineColor && !this.engineFailed) {
      this.engineThinking = true
      void this.engineReply(game, this.generation)
    }
    this.emit()
  }

  private async engineReply(game: Game, generation: number): Promise<void> {
    const started = this.now().getTime()
    const stillCurrent = () => generation === this.generation && !game.isOver
    try {
      const uci = await this.engine().bestMove(game.fen, playSettings(game.engineLevel))
      const waited = this.now().getTime() - started
      if (waited < this.minEngineDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, this.minEngineDelayMs - waited))
      }
      if (!stillCurrent()) return
      const move = uci ? parseUci(uci) : null
      const played = move ? game.play(move, game.engineColor) : null
      if (!played?.ok) {
        throw new Error(`The engine chose a move that cannot be played: ${uci ?? 'none'}`)
      }
      this.store.save(game.record())
    } catch (error) {
      if (!stillCurrent()) return
      this.log('The engine could not choose a move', error)
      this.engineFailed = true
    } finally {
      if (generation === this.generation) {
        this.engineThinking = false
        this.emit()
      }
    }
  }

  private stopEngine(): void {
    if (!this.engineThinking) return
    this.engine().stop()
    this.engineThinking = false
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
