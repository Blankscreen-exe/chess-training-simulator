// Where the player and the coach meet. The player's messages and the game's events queue here
// until Claude, waiting in wait_for_event, collects them; Claude's replies come back through say.
// It also keeps track of whether Claude Code is listening, from how recently it was in touch.
import type { GameState, Result } from '@shared/chess'
import type { ChatMessage, CoachState, CoachStatus } from '@shared/coach'
import { MAX_CHAT_LENGTH } from '@shared/coach'
import { Listeners } from '../util/listeners'
import { gameEvents, type CoachEvent } from './events'

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

export interface CoachHubOptions {
  port: number
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
  private lastGame: GameState | null = null
  private lastStatus: CoachStatus
  private nextMessageId = 1
  private readonly changes = new Listeners<CoachState>()
  private readonly port: number
  private readonly timings: CoachTimings
  private readonly now: () => number

  constructor(options: CoachHubOptions) {
    this.port = options.port
    this.timings = options.timings ?? COACH_TIMINGS
    this.now = options.now ?? Date.now
    this.lastActivity = this.now()
    this.lastStatus = this.status()
  }

  /** Calls `listener` whenever the coach's state changes; returns a function that stops it. */
  onChange(listener: (state: CoachState) => void): () => void {
    return this.changes.add(listener)
  }

  state(): CoachState {
    const state: CoachState = {
      status: this.status(),
      port: this.port,
      messages: this.messages.map((message) => ({ ...message })),
    }
    if (this.problem) state.problem = this.problem
    return state
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

  // From the player.

  playerMessage(text: string): Result<{ message: ChatMessage }> {
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, error: 'There is nothing to send' }
    if (trimmed.length > MAX_CHAT_LENGTH) {
      return { ok: false, error: `Messages can be at most ${MAX_CHAT_LENGTH} characters` }
    }
    const message = this.addMessage('player', trimmed)
    this.lastActivity = this.now()
    this.enqueue([{ type: 'player_message', text: trimmed }])
    this.emit()
    return { ok: true, message }
  }

  /** The game changed; Claude hears what happened, if it is listening. */
  gameChanged(state: GameState | null): void {
    const events = gameEvents(this.lastGame, state)
    this.lastGame = state
    if (events.length === 0) return
    if (events.some((event) => event.type !== 'move' || event.by === 'player')) {
      this.lastActivity = this.now()
    }
    // Moves made while no coach was listening would be stale by the time one connects.
    if (this.status() === 'connected') this.enqueue(events)
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
    if (this.queue.length > MAX_QUEUED_EVENTS)
      this.queue.splice(0, this.queue.length - MAX_QUEUED_EVENTS)
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
