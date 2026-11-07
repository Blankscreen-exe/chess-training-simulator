import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardCommand, CoachState } from '@shared/coach'
import { CoachHub, type CoachTimings } from './hub'
import { memoryKeeper } from './test-support'

const TIMINGS: CoachTimings = { waitMs: 1_000, connectedWithinMs: 5_000, idleMs: 60_000 }

function makeHub(timings = TIMINGS, keeper = memoryKeeper().keeper) {
  return new CoachHub({ port: 8765, settings: keeper, timings, now: () => Date.now() })
}

describe('CoachHub', () => {
  let hub: CoachHub
  let states: CoachState[]

  beforeEach(() => {
    vi.useFakeTimers()
    hub = makeHub()
    states = []
    hub.onChange((state) => states.push(state))
  })
  afterEach(() => vi.useRealTimers())

  it('starts offline, connects when Claude is in touch, and lapses without it', () => {
    expect(hub.state().status).toBe('offline')
    hub.touch()
    expect(hub.connected).toBe(true)
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
    const patient = makeHub({ ...TIMINGS, waitMs: 10_000, connectedWithinMs: 5_000 })
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

  it('delivers events only while Claude is listening', async () => {
    hub.deliver([{ type: 'mode_changed', mode: 'casual' }])
    hub.touch()
    hub.deliver([{ type: 'mode_changed', mode: 'silent' }])
    await expect(hub.waitForEvents()).resolves.toEqual({
      events: [{ type: 'mode_changed', mode: 'silent' }],
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

  it('does not pause while the player is busy', async () => {
    vi.advanceTimersByTime(TIMINGS.idleMs - 1)
    hub.noteActivity()
    vi.advanceTimersByTime(TIMINGS.idleMs - 1)
    const waiting = hub.waitForEvents()
    await vi.advanceTimersByTimeAsync(TIMINGS.waitMs)
    await expect(waiting).resolves.toEqual({ events: [] })
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

  describe('settings', () => {
    it('start from what was kept, and keep every change', () => {
      const { keeper, saved } = memoryKeeper({ mode: 'silent', playerLevel: 'club' })
      const kept = makeHub(TIMINGS, keeper)
      expect(kept.state().settings).toEqual({ mode: 'silent', playerLevel: 'club' })
      kept.updateSettings({ playerLevel: 'beginner' }, 'player')
      expect(saved).toEqual([{ mode: 'silent', playerLevel: 'beginner' }])
    })

    it('tell Claude when the player changes the mode, but not when Claude does', async () => {
      hub.touch()
      hub.updateSettings({ mode: 'casual' }, 'coach')
      hub.updateSettings({ mode: 'blunder_watch' }, 'player')
      await expect(hub.waitForEvents()).resolves.toEqual({
        events: [{ type: 'mode_changed', mode: 'blunder_watch' }],
      })
    })
  })

  it('shows candidates until they are cleared, and passes board commands on', () => {
    const commands: BoardCommand[] = []
    hub.onBoardCommand((command) => commands.push(command))
    hub.setCandidates({ fen: 'x', moves: [{ uci: 'e2e4', san: 'e4' }] })
    expect(hub.state().candidates?.moves).toHaveLength(1)
    hub.setCandidates(null)
    expect(hub.state().candidates).toBeNull()
    hub.command({ type: 'show-game' })
    expect(commands).toEqual([{ type: 'show-game' }])
  })
})
