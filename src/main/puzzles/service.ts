// The puzzle on the board, if any: choosing one from the library, the player's moves, the
// opponent's replies after a pause, hints, showing the answer, and noting how each try went.
import type { MoveInput, Result } from '@shared/chess'
import type { PuzzleRequest, PuzzleState } from '@shared/training'
import type { LibraryPuzzle } from '../library/puzzles'
import type { LibraryService } from '../library/service'
import { Listeners } from '../util/listeners'
import type { AttemptStore } from './attempts'
import { Puzzle } from './puzzle'

export const NO_LIBRARY =
  'The puzzle library is not installed yet. The player can install it in the Training tab.'

/** How many puzzles are drawn to choose from, so one not tried lately can be found. */
const DRAWN = 30
/** How many of the latest tries count as lately. */
const LATELY = 1000
/** How far the range of ratings is widened, each time no puzzle fits it, and how many times. */
const WIDEN_BY = 200
const WIDENINGS = 2

export interface PuzzleServiceOptions {
  library: Pick<LibraryService, 'installed'>
  attempts: AttemptStore
  /** The ratings that suit the player, when a request does not say. */
  ratings: () => { min: number; max: number }
  /** How long the opponent takes over each reply, so the player sees it come. */
  replyDelayMs?: number
  now?: () => Date
}

/** A puzzle to start: a given one, or one to choose by its request. */
export type PuzzleChoice = { id: string } | PuzzleRequest

export class PuzzleService {
  private puzzle: Puzzle | null = null
  private attempt: number | null = null
  private replyTimer: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Listeners<PuzzleState | null>()
  private readonly replyDelayMs: number
  private readonly now: () => Date

  constructor(private readonly options: PuzzleServiceOptions) {
    this.replyDelayMs = options.replyDelayMs ?? 500
    this.now = options.now ?? (() => new Date())
  }

  onChange(listener: (state: PuzzleState | null) => void): () => void {
    return this.listeners.add(listener)
  }

  current(): PuzzleState | null {
    return this.puzzle?.state() ?? null
  }

  /** The answer to the puzzle on the board, for the coach; null if there is none. */
  answer(): string[] | null {
    return this.puzzle?.answer ?? null
  }

  /** Puzzles that fit a request, not tried lately where there are enough of those. */
  find(request: PuzzleRequest, count: number): Result<{ puzzles: LibraryPuzzle[] }> {
    const library = this.options.library.installed
    if (!library) return { ok: false, error: NO_LIBRARY }
    const base = request.rating ?? this.options.ratings()
    const recent = this.options.attempts.recentPuzzles(LATELY)
    for (let widening = 0; widening <= WIDENINGS; widening++) {
      const drawn = library.findPuzzles({
        rating: { min: base.min - widening * WIDEN_BY, max: base.max + widening * WIDEN_BY },
        ...(request.theme ? { theme: request.theme } : {}),
        ...(request.piece ? { piece: request.piece } : {}),
        count: DRAWN,
      })
      if (drawn.length === 0) continue
      const fresh = drawn.filter((puzzle) => !recent.has(puzzle.id))
      return {
        ok: true,
        puzzles: [...fresh, ...drawn.filter((p) => recent.has(p.id))].slice(0, count),
      }
    }
    return { ok: false, error: 'No puzzle in the library fits that. Try another theme or piece.' }
  }

  /** Puts a puzzle on the board in place of any other. */
  start(choice: PuzzleChoice, title: string | null = null): Result<{ state: PuzzleState }> {
    const library = this.options.library.installed
    if (!library) return { ok: false, error: NO_LIBRARY }
    let source: LibraryPuzzle | null
    if ('id' in choice) {
      source = library.puzzle(choice.id)
      if (!source) return { ok: false, error: `There is no puzzle ${choice.id} in the library` }
    } else {
      const found = this.find(choice, 1)
      if (!found.ok) return found
      source = found.puzzles[0] ?? null
      if (!source) return { ok: false, error: 'No puzzle was found' }
    }
    const started = Puzzle.start(source, title)
    if (!started.ok) return started

    this.leave()
    this.puzzle = started.puzzle
    this.attempt = this.options.attempts.begin(source, this.now().toISOString())
    return this.changed()
  }

  /** The player's move: played if it is the answer, else refused, and counted as a mistake. */
  move(input: MoveInput): Result<{ state: PuzzleState }> {
    const puzzle = this.puzzle
    if (!puzzle) return { ok: false, error: 'There is no puzzle on the board' }
    const tried = puzzle.tryMove(input)
    if (!tried.ok) return tried
    if (tried.attempt === 'wrong') {
      this.emit()
      return { ok: false, error: `${tried.san} is not the answer. Try again.` }
    }
    if (puzzle.replyDue) {
      this.replyTimer = setTimeout(() => {
        this.replyTimer = null
        puzzle.playReply()
        if (this.puzzle === puzzle) this.emit()
      }, this.replyDelayMs)
    }
    this.endIfOver()
    return this.changed()
  }

  hint(): Result<{ state: PuzzleState }> {
    if (!this.puzzle) return { ok: false, error: 'There is no puzzle on the board' }
    const hint = this.puzzle.giveHint()
    if (!hint.ok) return hint
    return this.changed()
  }

  /** Plays the rest of the answer out. */
  reveal(): Result<{ state: PuzzleState }> {
    if (!this.puzzle) return { ok: false, error: 'There is no puzzle on the board' }
    this.cancelReply()
    this.puzzle.reveal()
    this.endIfOver()
    return this.changed()
  }

  /** Takes the puzzle off the board. */
  close(): void {
    if (!this.puzzle) return
    this.leave()
    this.emit()
  }

  private leave(): void {
    this.cancelReply()
    if (this.puzzle?.isSolving) this.endAttempt('left')
    this.puzzle = null
  }

  private endIfOver(): void {
    const state = this.puzzle?.state()
    if (state && state.status !== 'solving') this.endAttempt(state.status)
  }

  private endAttempt(result: 'solved' | 'revealed' | 'left'): void {
    if (this.attempt === null || !this.puzzle) return
    const { mistakes, hints } = this.puzzle.state()
    this.options.attempts.end(this.attempt, {
      result,
      mistakes,
      hints,
      endedAt: this.now().toISOString(),
    })
    this.attempt = null
  }

  private cancelReply(): void {
    if (this.replyTimer) clearTimeout(this.replyTimer)
    this.replyTimer = null
  }

  private changed(): Result<{ state: PuzzleState }> {
    this.emit()
    const state = this.current()
    return state ? { ok: true, state } : { ok: false, error: 'There is no puzzle on the board' }
  }

  private emit(): void {
    this.listeners.emit(this.current())
  }
}
