// The engine's reviews of the player's games. Each game is reviewed as it ends, in the background,
// and the review kept: so the coach's review is ready when asked for, mistakes can be counted
// across games, and the positions the player went wrong in come back for practice.
import type { GameRecord, GameState, Result } from '@shared/chess'
import type { PositionAnalyst } from '../coach/analyst'
import type { GameService } from '../games/service'
import type { LibraryService } from '../library/service'
import type { PracticeStore } from '../profile/practice'
import { Listeners } from '../util/listeners'
import { practiceFrom } from './practice'
import { assessGame, describeReview, type GameReview } from './review'
import type { ReviewedMove, ReviewStore } from './store'

/** How many games that ended without a review, as before reviews were kept, are caught up on. */
const CATCH_UP = 20

export interface ReviewServiceOptions {
  store: ReviewStore
  games: Pick<GameService, 'record'>
  library: Pick<LibraryService, 'openingOf'>
  /** An analyst of its own, so reviewing never keeps the coach waiting. */
  analyst: PositionAnalyst
  practice: Pick<PracticeStore, 'add'>
  now?: () => Date
  log?: (message: string, error?: unknown) => void
}

/**
 * The game that ended between two states of the game being played, if one did: it is over now,
 * or another took its place while it was under way.
 */
export function endedGame(previous: GameState | null, next: GameState | null): number | null {
  if (previous?.status !== 'in_progress') return null
  if (next?.id !== previous.id) return previous.id
  return next.status === 'in_progress' ? null : previous.id
}

export class ReviewService {
  /** Reviews being made, so one asked for twice is made once. */
  private readonly making = new Map<string, Promise<ReviewedMove[]>>()
  private readonly reviewed = new Listeners<number>()
  private last: GameState | null = null
  private work: Promise<void> = Promise.resolve()
  private readonly now: () => Date
  private readonly log: (message: string, error?: unknown) => void

  constructor(private readonly options: ReviewServiceOptions) {
    this.now = options.now ?? (() => new Date())
    this.log = options.log ?? ((message, error) => console.error(message, error))
  }

  /** Calls `listener` with a game's id once its review is kept; returns a function that stops it. */
  onReviewed(listener: (gameId: number) => void): () => void {
    return this.reviewed.add(listener)
  }

  /**
   * A game's review: the one kept, or else one made now. A game still under way is reviewed as
   * far as it has got, and that review is not kept.
   */
  async review(gameId: number): Promise<Result<{ review: GameReview }>> {
    const found = this.options.games.record(gameId)
    if (!found.ok) return found
    const { game } = found
    if (game.moves.length === 0) return { ok: false, error: 'That game has no moves to review' }
    const moves = await this.movesOf(game)
    return { ok: true, review: describeReview(game, moves, this.options.library.openingOf(game)) }
  }

  /** Follows the game being played, to review each game as it ends. */
  gameChanged(next: GameState | null): void {
    const ended = endedGame(this.last, next)
    this.last = next
    if (ended !== null) this.inBackground(ended)
  }

  /** Reviews the latest games that ended without a review. */
  catchUp(): void {
    for (const id of this.options.store.unreviewed(CATCH_UP)) this.inBackground(id)
  }

  /** Resolves once every review asked for in the background is done; for tests. */
  idle(): Promise<void> {
    return this.work
  }

  /** Reviews a game after those already asked for, one at a time. */
  private inBackground(gameId: number): void {
    this.work = this.work
      // A game that cannot be reviewed (forgotten, as one left before any move) is passed over.
      .then(() => this.review(gameId))
      .then(
        () => undefined,
        (error: unknown) => this.log(`Could not review game ${gameId}`, error),
      )
  }

  private movesOf(game: GameRecord): Promise<ReviewedMove[]> {
    const over = game.status !== 'in_progress'
    const kept = over ? this.options.store.get(game.id) : null
    if (kept) return Promise.resolve(kept)
    const key = `${game.id}:${game.moves.length}:${game.status}`
    const making = this.making.get(key)
    if (making) return making
    const made = this.make(game, over).finally(() => this.making.delete(key))
    this.making.set(key, made)
    return made
  }

  private async make(game: GameRecord, keep: boolean): Promise<ReviewedMove[]> {
    const { analyst, store, practice } = this.options
    const moves = await assessGame(game, analyst)
    if (!keep) return moves
    const now = this.now()
    for (const position of await practiceFrom(game, moves, analyst)) practice.add(position, now)
    store.save(game.id, moves, now.toISOString())
    this.reviewed.emit(game.id)
    return moves
  }
}
