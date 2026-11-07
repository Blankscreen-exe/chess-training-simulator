import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '@shared/chess'
import { START_FEN } from '@shared/chess'
import type { CoachState } from '@shared/coach'
import { CoachHub, type CoachTimings } from './hub'

const TIMINGS: CoachTimings = { waitMs: 1_000, connectedWithinMs: 5_000, idleMs: 60_000 }

const game = (moves: GameState['moves'] = []): GameState => ({
  id: 1,
  playerColor: 'white',
  engineLevel: 3,
  startedAt: '2026-11-07T12:00:00.000Z',
  status: 'in_progress',
  result: '*',
  initialFen: START_FEN,
  moves,
  position: { fen: START_FEN, turn: 'white', check: false, dests: {}, promotions: [] },
  engineThinking: false,
  engineFailed: false,
})

const E4 = { uci: 'e2e4', san: 'e4', color: 'white', check: false, fenAfter: START_FEN } as const

describe('CoachHub', () => {
  let hub: CoachHub
  let states: CoachState[]

  beforeEach(() => {
    vi.useFakeTimers()
    hub = new CoachHub({ port: 8765, timings: TIMINGS, now: () => Date.now() })
    states = []
    hub.onChange((state) => states.push(state))
  })
  afterEach(() => vi.useRealTimers())

  it('starts offline, connects when Claude is in touch, and lapses without it', () => {
    expect(hub.state().status).toBe('offline')
    hub.touch()
    expect(hub.state().status).toBe('connected')
    vi.advanceTimersByTime(TIMINGS.connectedWithinMs)
    hub.refresh()
    expect(states.map((state) => state.status)).toEqual(['connected', 'offline'])
  })

  it('hands a waiting Claude the player message at once', async () => {
    const waiting = hub.waitForEvents()
    hub.playerMessage('  What should I do here?  ')
    await expect(waiting).resolves.toEqual({
      events: [{ type: 'player_message', text: 'What should I do here?' }],
    })
    expect(hub.state().messages).toMatchObject([{ from: 'player', text: 'What should I do here?' }])
  })

  it('keeps messages written while Claude was away, and hands them over on its next call', async () => {
    hub.playerMessage('Hello?')
    await expect(hub.waitForEvents()).resolves.toEqual({
      events: [{ type: 'player_message', text: 'Hello?' }],
    })
  })

  it('comes back empty after the wait, and counts as connected all the while', async () => {
    // A wait longer than the connection window, so only the wait itself keeps it connected.
    const patient = new CoachHub({
      port: 8765,
      timings: { ...TIMINGS, waitMs: 10_000, connectedWithinMs: 5_000 },
      now: () => Date.now(),
    })
    const waiting = patient.waitForEvents()
    vi.advanceTimersByTime(6_000)
    expect(patient.state().status).toBe('connected')
    await vi.advanceTimersByTimeAsync(4_000)
    await expect(waiting).resolves.toEqual({ events: [] })
  })

  it('ends a wait when the request is given up on', async () => {
    const abort = new AbortController()
    const waiting = hub.waitForEvents(abort.signal)
    abort.abort()
    await expect(waiting).resolves.toEqual({ events: [] })
  })

  it('lets a newer wait take over from an older one', async () => {
    const older = hub.waitForEvents()
    const newer = hub.waitForEvents()
    await expect(older).resolves.toEqual({ events: [] })
    hub.playerMessage('hi')
    await expect(newer).resolves.toEqual({ events: [{ type: 'player_message', text: 'hi' }] })
  })

  it('passes on moves only while Claude is connected', async () => {
    hub.gameChanged(game())
    hub.gameChanged(game([E4]))
    hub.touch()
    hub.gameChanged(game([E4, { ...E4, uci: 'e7e5', san: 'e5', color: 'black' }]))
    await expect(hub.waitForEvents()).resolves.toEqual({
      events: [{ type: 'move', by: 'engine', move: '1… e5', fen_after: START_FEN }],
    })
  })

  it('pauses after a long quiet spell, until Claude is in touch again', async () => {
    vi.advanceTimersByTime(TIMINGS.idleMs)
    await expect(hub.waitForEvents()).resolves.toEqual({ paused: true })
    expect(hub.state().status).toBe('paused')
    vi.advanceTimersByTime(TIMINGS.connectedWithinMs * 2)
    hub.refresh()
    expect(hub.state().status).toBe('paused')
    hub.touch()
    expect(hub.state().status).toBe('connected')
  })

  it('records what Claude says, and refuses empty messages from either side', () => {
    expect(hub.say('Develop your knights first.').ok).toBe(true)
    expect(hub.say('   ')).toEqual({ ok: false, error: 'There is nothing to say' })
    expect(hub.playerMessage('')).toEqual({ ok: false, error: 'There is nothing to send' })
    expect(hub.state().messages).toMatchObject([{ id: 1, from: 'coach' }])
  })

  it('reports when its server could not start', () => {
    hub.setUnavailable('Port 8765 is in use')
    expect(hub.state()).toMatchObject({ status: 'unavailable', problem: 'Port 8765 is in use' })
  })
})
