import { describe, expect, it, vi } from 'vitest'
import type { GameState } from '@shared/chess'
import { START_FEN } from '@shared/chess'
import type { PlaySettings } from '../engine/levels'
import { GameService, type PlayingEngine } from './service'
import { GameStore } from './store'

/** An engine whose replies the test hands out one at a time. */
class ScriptedEngine implements PlayingEngine {
  readonly asked: { fen: string; settings: PlaySettings }[] = []
  stops = 0
  newGames = 0
  private pending: { resolve: (move: string | null) => void; reject: (error: Error) => void }[] = []

  bestMove(fen: string, settings: PlaySettings): Promise<string | null> {
    this.asked.push({ fen, settings })
    return new Promise((resolve, reject) => this.pending.push({ resolve, reject }))
  }
  newGame(): Promise<void> {
    this.newGames++
    return Promise.resolve()
  }
  stop(): void {
    this.stops++
  }
  reply(move: string | null): void {
    this.pending.shift()?.resolve(move)
  }
  fail(): void {
    this.pending.shift()?.reject(new Error('crashed'))
  }
}

function setUp() {
  const store = new GameStore(':memory:')
  const engine = new ScriptedEngine()
  const service = new GameService({
    store,
    engine: () => engine,
    minEngineDelayMs: 0,
    random: () => 0.9,
    log: () => undefined,
  })
  const states: (GameState | null)[] = []
  service.onChange((state) => states.push(state))
  return { store, engine, service, states }
}

/** Lets the engine's reply, and the service's handling of it, run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('GameService', () => {
  it('starts a game and waits for the player when they are White', () => {
    const { service, engine } = setUp()
    const started = service.newGame({ playerColor: 'white', engineLevel: 3 })
    expect(started.ok && started.state).toMatchObject({
      playerColor: 'white',
      engineLevel: 3,
      initialFen: START_FEN,
      status: 'in_progress',
      engineThinking: false,
    })
    expect(engine.asked).toHaveLength(0)
    expect(engine.newGames).toBe(1)
  })

  it('lets the engine open when the player is Black, at the chosen level', async () => {
    const { service, engine } = setUp()
    const started = service.newGame({ playerColor: 'black', engineLevel: 4 })
    expect(started.ok && started.state.engineThinking).toBe(true)
    expect(engine.asked[0]?.settings).toMatchObject({ elo: 1350 })
    engine.reply('e2e4')
    await settle()
    expect(service.current()).toMatchObject({ engineThinking: false, moves: [{ san: 'e4' }] })
  })

  it('picks a colour when asked for a random one', () => {
    const { service } = setUp()
    const started = service.newGame({ playerColor: 'random', engineLevel: 3 })
    expect(started.ok && started.state.playerColor).toBe('black')
  })

  it('plays the engine reply after each player move, and stores both', async () => {
    const { service, engine, store } = setUp()
    service.newGame({ playerColor: 'white', engineLevel: 3 })
    const moved = service.move({ from: 'e2', to: 'e4' })
    expect(moved.ok && moved.state.engineThinking).toBe(true)
    expect(service.move({ from: 'd2', to: 'd4' })).toEqual({
      ok: false,
      error: 'The engine is still choosing its move',
    })
    engine.reply('c7c5')
    await settle()
    expect(service.current()?.moves.map((move) => move.san)).toEqual(['e4', 'c5'])
    expect(store.get(1)?.moves).toEqual(['e2e4', 'c7c5'])
  })

  it('refuses illegal moves', () => {
    const { service } = setUp()
    service.newGame({ playerColor: 'white', engineLevel: 3 })
    expect(service.move({ from: 'e2', to: 'e5' })).toEqual({
      ok: false,
      error: 'e2e5 is not a legal move here',
    })
  })

  it('drops the engine reply when the player resigns while it thinks', async () => {
    const { service, engine } = setUp()
    service.newGame({ playerColor: 'white', engineLevel: 3 })
    service.move({ from: 'e2', to: 'e4' })
    const resigned = service.resign()
    expect(resigned.ok && resigned.state).toMatchObject({ status: 'resigned', result: '0-1' })
    expect(engine.stops).toBe(1)
    engine.reply('e7e5')
    await settle()
    expect(service.current()?.moves).toHaveLength(1)
  })

  it('abandons the game under way when a new one starts, and forgets one with no moves', () => {
    const { service, store } = setUp()
    service.newGame({ playerColor: 'white', engineLevel: 3 })
    service.newGame({ playerColor: 'white', engineLevel: 3 })
    expect(store.get(1)).toBeUndefined()

    service.move({ from: 'e2', to: 'e4' })
    service.newGame({ playerColor: 'white', engineLevel: 5 })
    expect(store.get(2)).toMatchObject({ status: 'abandoned', moves: ['e2e4'] })
    expect(service.current()).toMatchObject({ id: 3, engineLevel: 5 })
  })

  it('starts from a set-up position, and refuses one where the game is already over', () => {
    const { service } = setUp()
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'
    const started = service.newGame({ playerColor: 'white', engineLevel: 3, fen })
    expect(started.ok && started.state.initialFen).toBe(fen)
    expect(
      service.newGame({
        playerColor: 'black',
        engineLevel: 3,
        fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
      }),
    ).toEqual({ ok: false, error: 'The game is already over in that position' })
    expect(service.current()?.initialFen).toBe(fen)
  })

  it('refuses positions that are not legal', () => {
    const { service } = setUp()
    expect(
      service.newGame({
        playerColor: 'white',
        engineLevel: 3,
        fen: '4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1',
      }).ok,
    ).toBe(false)
  })

  it('reports an engine failure, and tries again when asked', async () => {
    const { service, engine } = setUp()
    service.newGame({ playerColor: 'white', engineLevel: 3 })
    service.move({ from: 'e2', to: 'e4' })
    engine.fail()
    await settle()
    expect(service.current()).toMatchObject({ engineThinking: false, engineFailed: true })
    service.retryEngine()
    expect(service.current()).toMatchObject({ engineThinking: true, engineFailed: false })
    engine.reply('e7e5')
    await settle()
    expect(service.current()?.moves).toHaveLength(2)
  })

  it('carries on with a game left under way, the engine moving if it is its turn', () => {
    const { store, engine, service } = setUp()
    const data = store.create({
      playerColor: 'black',
      engineLevel: 3,
      initialFen: START_FEN,
      startedAt: '2026-11-07T12:00:00.000Z',
    })
    store.save({ ...data, moves: ['e2e4', 'e7e5'] })
    service.resume()
    expect(service.current()).toMatchObject({ id: data.id, engineThinking: true })
    expect(engine.asked).toHaveLength(1)
  })

  it('tells listeners about every change', async () => {
    const { service, engine, states } = setUp()
    service.newGame({ playerColor: 'white', engineLevel: 3 })
    service.move({ from: 'e2', to: 'e4' })
    engine.reply('e7e5')
    await settle()
    expect(states.map((state) => [state?.moves.length, state?.engineThinking])).toEqual([
      [0, false],
      [1, true],
      [2, false],
    ])
  })

  it('gives a stored game with every position and its PGN', () => {
    const { service, store } = setUp()
    const data = store.create({
      playerColor: 'black',
      engineLevel: 4,
      initialFen: START_FEN,
      startedAt: '2026-11-07T12:00:00.000Z',
    })
    store.save({
      ...data,
      moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
      status: 'finished',
      result: '0-1',
      termination: 'checkmate',
    })
    const result = service.record(data.id)
    expect(result.ok && result.game).toMatchObject({
      id: data.id,
      plies: 4,
      initialFen: START_FEN,
      result: '0-1',
    })
    expect(result.ok && result.game.moves.map((move) => move.san)).toEqual([
      'f3',
      'e5',
      'g4',
      'Qh4#',
    ])
    expect(result.ok && result.game.pgn).toMatch(/Qh4# 0-1$/)
    expect(service.record(99)).toEqual({ ok: false, error: 'There is no game 99' })
  })

  it('waits at least the minimum time before the engine moves', async () => {
    vi.useFakeTimers()
    try {
      const store = new GameStore(':memory:')
      const engine = new ScriptedEngine()
      const service = new GameService({ store, engine: () => engine, minEngineDelayMs: 400 })
      service.newGame({ playerColor: 'white', engineLevel: 3 })
      service.move({ from: 'e2', to: 'e4' })
      engine.reply('e7e5')
      await vi.advanceTimersByTimeAsync(300)
      expect(service.current()?.moves).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(150)
      expect(service.current()?.moves).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
