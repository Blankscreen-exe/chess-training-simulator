// Where the player and the coach meet. The player's messages and the session's events queue here
// until Claude, waiting in wait_for_event, collects them; Claude's replies come back through say.
// It also keeps the coach's settings and what it is showing on the board, and tracks whether
// Claude Code is listening, from how recently it was in touch.
import type { Result } from '@shared/chess'
import type {
  BoardCommand,
  Candidates,
  ChatMessage,
  CoachSettings,
  CoachState,
  CoachStatus,
} from '@shared/coach'
import { MAX_CHAT_LENGTH } from '@shared/coach'
import { Listeners } from '../util/listeners'
import type { CoachEvent } from './events'

export interface CoachTimings {
  /** The longest one wait_for_event call waits before coming back empty. */
  waitMs: number
  /** Claude Code counts as connected while it was in touch at most this long ago. */
  connectedWithinMs: number
  /** With nothing from the player for this long, Claude is told to stop waiting. */
  idleMs: number
}

export const COACH_TIMINGS: CoachTimings = {
  waitMs: 40_000,
  connectedWithinMs: 90_000,
  idleMs: 10 * 60_000,
}

/** The most events kept for Claude; older ones are dropped, as Claude can ask for the game. */
const MAX_QUEUED_EVENTS = 100

export type WaitResult = { events: CoachEvent[] } | { paused: true }

/** Where the coach's settings are kept between runs of the app. */
export interface SettingsKeeper {
  load(): CoachSettings
  save(settings: CoachSettings): void
}

export interface CoachHubOptions {
  port: number
  settings: SettingsKeeper
  timings?: CoachTimings
  now?: () => number
}

export class CoachHub {
  private readonly messages: ChatMessage[] = []
  private queue: CoachEvent[] = []
  private waiter: ((events: CoachEvent[]) => void) | null = null
  private lastContact: number | null = null
  private lastActivity: number
  private paused = false
  private problem: string | undefined
  private settings: CoachSettings
  private candidates: Candidates | null = null
  private lastStatus: CoachStatus
  private nextMessageId = 1
  private readonly changes = new Listeners<CoachState>()
  private readonly commands = new Listeners<BoardCommand>()
  private readonly port: number
  private readonly keeper: SettingsKeeper
  private readonly timings: CoachTimings
  private readonly now: () => number

  constructor(options: CoachHubOptions) {
    this.port = options.port
    this.keeper = options.settings
    this.settings = options.settings.load()
    this.timings = options.timings ?? COACH_TIMINGS
    this.now = options.now ?? Date.now
    this.lastActivity = this.now()
    this.lastStatus = this.status()
  }

  /** Calls `listener` whenever the coach's state changes; returns a function that stops it. */
  onChange(listener: (state: CoachState) => void): () => void {
    return this.changes.add(listener)
  }

  /** Calls `listener` with each thing the coach asks the board to do. */
  onBoardCommand(listener: (command: BoardCommand) => void): () => void {
    return this.commands.add(listener)
  }

  state(): CoachState {
    const state: CoachState = {
      status: this.status(),
      port: this.port,
      settings: { ...this.settings },
      messages: this.messages.map((message) => ({ ...message })),
      candidates: this.candidates,
    }
    if (this.problem) state.problem = this.problem
    return state
  }

  get currentSettings(): CoachSettings {
    return { ...this.settings }
  }

  /** Whether Claude Code is listening, so that events sent now will be heard. */
  get connected(): boolean {
    return this.status() === 'connected'
  }

  /** The server could not start; the coach cannot connect until the app is restarted. */
  setUnavailable(problem: string): void {
    this.problem = problem
    this.emit()
  }

  /**
   * Notes that Claude Code was in touch, as every tool call does. Telling the app "time passed"
   * without anything happening is `refresh`.
   */
  touch(): void {
    this.lastContact = this.now()
    this.paused = false
    this.emitIfStatusChanged()
  }

  /** Re-checks the connection, which lapses with time alone; call it every few seconds. */
  refresh(): void {
    this.emitIfStatusChanged()
  }

  /** The player did something, so the coach should not yet give up waiting for them. */
  noteActivity(): void {
    this.lastActivity = this.now()
  }

  // From the player.

  playerMessage(text: string): Result<{ message: ChatMessage }> {
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, error: 'There is nothing to send' }
    if (trimmed.length > MAX_CHAT_LENGTH) {
      return { ok: false, error: `Messages can be at most ${MAX_CHAT_LENGTH} characters` }
    }
    const message = this.addMessage('player', trimmed)
    this.noteActivity()
    // Kept even while no coach is listening, for it to read when it connects.
    this.enqueue([{ type: 'player_message', text: trimmed }])
    this.emit()
    return { ok: true, message }
  }

  /**
   * Changes the coach's settings, and keeps them. A change the player makes in the app is passed
   * on to Claude; one Claude makes, it already knows about.
   */
  updateSettings(change: Partial<CoachSettings>, by: 'player' | 'coach'): CoachSettings {
    const before = this.settings
    this.settings = { ...before, ...change }
    this.keeper.save(this.settings)
    if (by === 'player' && this.settings.mode !== before.mode) {
      this.deliver([{ type: 'mode_changed', mode: this.settings.mode }])
    }
    this.emit()
    return { ...this.settings }
  }

  // From the session and the tools.

  /** Passes events on to Claude, if it is listening; events nobody hears would go stale. */
  deliver(events: CoachEvent[]): void {
    if (events.length > 0 && this.connected) this.enqueue(events)
  }

  /** Shows these moves on the board as numbered arrows, or none. */
  setCandidates(candidates: Candidates | null): void {
    if (candidates === null && this.candidates === null) return
    this.candidates = candidates
    this.emit()
  }

  /** Asks the board to do something once, such as playing a line out. */
  command(command: BoardCommand): void {
    this.commands.emit(command)
  }

  // From Claude.

  say(text: string): Result<{ message: ChatMessage }> {
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, error: 'There is nothing to say' }
    const message = this.addMessage('coach', trimmed.slice(0, MAX_CHAT_LENGTH))
    this.emit()
    return { ok: true, message }
  }

  /**
   * Waits for something to happen: the player's messages and the game's events since the last
   * call, at once if there are any. After `waitMs` with nothing, it comes back empty; after
   * `idleMs` without the player doing anything, it says to stop. `signal` ends the wait early,
   * as when Claude Code gives up on the request.
   */
  async waitForEvents(signal?: AbortSignal): Promise<WaitResult> {
    this.touch()
    if (signal?.aborted) return { events: [] }
    if (this.queue.length > 0) return { events: this.drain() }
    if (this.now() - this.lastActivity >= this.timings.idleMs) {
      this.paused = true
      this.emitIfStatusChanged()
      return { paused: true }
    }

    // One listener at a time: a newer call takes over from an older one.
    this.waiter?.([])
    const events = await new Promise<CoachEvent[]>((resolve) => {
      const finish = (found: CoachEvent[]) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        if (this.waiter === finish) this.waiter = null
        resolve(found)
      }
      const onAbort = () => finish([])
      const timer = setTimeout(() => finish(this.drain()), this.timings.waitMs)
      signal?.addEventListener('abort', onAbort)
      this.waiter = finish
    })
    this.touch()
    return { events }
  }

  private status(): CoachStatus {
    if (this.problem) return 'unavailable'
    if (this.paused) return 'paused'
    const recent =
      this.lastContact !== null && this.now() - this.lastContact < this.timings.connectedWithinMs
    return this.waiter || recent ? 'connected' : 'offline'
  }

  private addMessage(from: ChatMessage['from'], text: string): ChatMessage {
    const message = { id: this.nextMessageId++, from, text, at: new Date(this.now()).toISOString() }
    this.messages.push(message)
    return message
  }

  private enqueue(events: CoachEvent[]): void {
    this.queue.push(...events)
    if (this.queue.length > MAX_QUEUED_EVENTS) {
      this.queue.splice(0, this.queue.length - MAX_QUEUED_EVENTS)
    }
    this.waiter?.(this.drain())
  }

  private drain(): CoachEvent[] {
    const events = this.queue
    this.queue = []
    return events
  }

  private emitIfStatusChanged(): void {
    if (this.status() !== this.lastStatus) this.emit()
  }

  private emit(): void {
    const state = this.state()
    this.lastStatus = state.status
    this.changes.emit(state)
  }
}
