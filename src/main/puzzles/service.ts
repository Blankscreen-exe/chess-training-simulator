// The puzzle on the board, if any: choosing one from the library or a position to practise, the
// player's moves, the opponent's replies after a pause, hints, showing the answer, and noting how
// each try went. A puzzle from the library the player misses comes back for practice.
import type { MoveInput, Result } from '@shared/chess'
import type {
  PuzzleRequest,
  PuzzleResult,
  PuzzleStart,
  PuzzleState,
  PuzzleTheme,
} from '@shared/training'
import type { LibraryPuzzle } from '../library/puzzles'
import type { LibraryService } from '../library/service'
import type { NewPracticePosition, PracticeStore } from '../profile/practice'
import { Listeners } from '../util/listeners'
import { timeUntil } from '../util/time'
import { outcomeOf, type AttemptStore } from './attempts'
import { Puzzle } from './puzzle'

export const NO_LIBRARY =
  'The puzzle library is not installed yet. The player can install it in the Training tab.'
const NO_FIT = 'No puzzle in the library fits that. Try another theme or piece.'
const NO_WEAK_SPOTS =
  'There are no weak spots to aim at yet: they show up as the player solves puzzles, and as weaknesses are noted.'
const NO_PUZZLE = { ok: false, error: 'There is no puzzle on the board' } as const

/** How many puzzles are drawn to choose from, so one not tried lately can be found. */
const DRAWN = 30
/** How many of the latest tries count as lately. */
const LATELY = 1000
/** How far the range of ratings is widened, each time no puzzle fits it, and how many times. */
const WIDEN_BY = 200
const WIDENINGS = 2
/** How many of the most pressing weak spots one is chosen from, for variety. */
const WEAK_SPOT_CHOICE = 3

export interface PuzzleServiceOptions {
  library: Pick<LibraryService, 'installed'>
  attempts: AttemptStore
  practice: Pick<PracticeStore, 'add' | 'next' | 'record' | 'summary'>
  /** The ratings that suit the player, when a request does not say. */
  ratings: () => { min: number; max: number }
  /** The themes of the player's weak spots, the most pressing first. */
  weakSpots: () => readonly PuzzleTheme[]
  /** How long the opponent takes over each reply, so the player sees it come. */
  replyDelayMs?: number
  now?: () => Date
  random?: () => number
}

/** A puzzle to start: a given one, one to choose by its request, or the next to practise. */
export type PuzzleChoice = { id: string } | PuzzleStart

/** What a try is noted as: a try at a puzzle from the library, or practice of a position. */
type Tracking =
  { kind: 'library'; attempt: number; source: LibraryPuzzle } | { kind: 'practice'; id: number }

export class PuzzleService {
  private puzzle: Puzzle | null = null
  private tracking: Tracking | null = null
  private replyTimer: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Listeners<PuzzleState | null>()
  private readonly ended = new Listeners<PuzzleResult>()
  private readonly replyDelayMs: number
  private readonly now: () => Date
  private readonly random: () => number

  constructor(private readonly options: PuzzleServiceOptions) {
    this.replyDelayMs = options.replyDelayMs ?? 500
    this.now = options.now ?? (() => new Date())
    this.random = options.random ?? Math.random
  }

  onChange(listener: (state: PuzzleState | null) => void): () => void {
    return this.listeners.add(listener)
  }

  /** Calls `listener` with how each try ended, once it is noted; returns a function that stops it. */
  onTryEnded(listener: (result: PuzzleResult) => void): () => void {
    return this.ended.add(listener)
  }

  current(): PuzzleState | null {
    return this.puzzle?.state() ?? null
  }

  /** The answer to the puzzle on the board, for the coach; null if there is none. */
  answer(): string[] | null {
    return this.puzzle?.answer ?? null
  }

  /**
   * Puzzles that fit a request, not tried lately where there are enough of those. One aimed at
   * the player's weak spots tries each in turn, starting with one of the most pressing.
   */
  find(request: PuzzleRequest, count: number): Result<{ puzzles: LibraryPuzzle[] }> {
    const library = this.options.library.installed
    if (!library) return { ok: false, error: NO_LIBRARY }
    const themes = request.weakSpots ? this.weakSpotThemes() : [request.theme]
    if (themes.length === 0) return { ok: false, error: NO_WEAK_SPOTS }
    const base = request.rating ?? this.options.ratings()
    const recent = this.options.attempts.recentPuzzles(LATELY)
    for (const theme of themes) {
      for (let widening = 0; widening <= WIDENINGS; widening++) {
        const drawn = library.findPuzzles({
          rating: { min: base.min - widening * WIDEN_BY, max: base.max + widening * WIDEN_BY },
          ...(theme ? { theme } : {}),
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
    }
    return { ok: false, error: NO_FIT }
  }

  /** Puts a puzzle on the board in place of any other. */
  start(choice: PuzzleChoice, title: string | null = null): Result<{ state: PuzzleState }> {
    if ('practice' in choice) return this.startPractice()
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
    const started = Puzzle.start(source, { title })
    if (!started.ok) return started
    const chosen = source
    return this.take(started.puzzle, (startedAt) => ({
      kind: 'library',
      attempt: this.options.attempts.begin(chosen, startedAt),
      source: chosen,
    }))
  }

  /** The player's move: played if it is the answer, else refused, and counted as a mistake. */
  move(input: MoveInput): Result<{ state: PuzzleState }> {
    const puzzle = this.puzzle
    if (!puzzle) return NO_PUZZLE
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
    if (!this.puzzle) return NO_PUZZLE
    const hint = this.puzzle.giveHint()
    if (!hint.ok) return hint
    return this.changed()
  }

  /** Plays the rest of the answer out. */
  reveal(): Result<{ state: PuzzleState }> {
    if (!this.puzzle) return NO_PUZZLE
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

  /** Puts the position due for practice longest ago on the board. */
  private startPractice(): Result<{ state: PuzzleState }> {
    const { practice } = this.options
    const position = practice.next(this.now())
    if (!position) {
      const now = this.now()
      const { nextDue } = practice.summary(now)
      const later = nextDue ? `: the next comes back ${timeUntil(nextDue, now)}` : ''
      return { ok: false, error: `Nothing is due for practice now${later}` }
    }
    // Named by what it is, which tells it apart from the library's puzzles.
    const started = Puzzle.start({ ...position, id: position.key }, { practice: position.origin })
    if (!started.ok) return started
    return this.take(started.puzzle, () => ({ kind: 'practice', id: position.id }))
  }

  /** Puts `puzzle` on the board in place of any other, and starts noting the try at it. */
  private take(
    puzzle: Puzzle,
    track: (startedAt: string) => Tracking,
  ): Result<{ state: PuzzleState }> {
    this.leave()
    this.puzzle = puzzle
    this.tracking = track(this.now().toISOString())
    return this.changed()
  }

  private leave(): void {
    this.cancelReply()
    if (this.puzzle?.isSolving) this.endTry('left')
    this.puzzle = null
  }

  private endIfOver(): void {
    const state = this.puzzle?.state()
    if (state && state.status !== 'solving') this.endTry(state.status)
  }

  /** Notes how the try went: for a puzzle from the library, a missed one is kept to practise. */
  private endTry(result: PuzzleResult): void {
    const tracking = this.tracking
    if (!tracking || !this.puzzle) return
    this.tracking = null
    const { mistakes, hints } = this.puzzle.state()
    const outcome = outcomeOf({ result, mistakes, hints })
    const now = this.now()
    if (tracking.kind === 'library') {
      this.options.attempts.end(tracking.attempt, {
        result,
        mistakes,
        hints,
        endedAt: now.toISOString(),
      })
      if (outcome === 'missed') this.options.practice.add(practiceOf(tracking.source), now)
    } else if (outcome) {
      this.options.practice.record(tracking.id, outcome, now)
    }
    this.ended.emit(result)
  }

  /** The weak spots' themes to try, in order: one of the most pressing first, then the rest. */
  private weakSpotThemes(): PuzzleTheme[] {
    const spots = [...this.options.weakSpots()]
    const first = Math.floor(this.random() * Math.min(WEAK_SPOT_CHOICE, spots.length))
    return [...spots.splice(first, 1), ...spots]
  }

  private cancelReply(): void {
    if (this.replyTimer) clearTimeout(this.replyTimer)
    this.replyTimer = null
  }

  private changed(): Result<{ state: PuzzleState }> {
    this.emit()
    const state = this.current()
    return state ? { ok: true, state } : NO_PUZZLE
  }

  private emit(): void {
    this.listeners.emit(this.current())
  }
}

/** A puzzle from the library the player missed, as a position to practise. */
function practiceOf(puzzle: LibraryPuzzle): NewPracticePosition {
  return {
    key: `puzzle:${puzzle.id}`,
    origin: { from: 'puzzle' },
    fen: puzzle.fen,
    moves: puzzle.moves,
    rating: puzzle.rating,
    themes: puzzle.themes,
  }
}
