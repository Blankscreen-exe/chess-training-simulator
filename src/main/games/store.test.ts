import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GAME_RESULTS, GAME_STATUSES, START_FEN, TERMINATIONS } from '@shared/chess'
import { GameStore } from './store'

const fresh = { playerColor: 'white', engineLevel: 3, initialFen: START_FEN } as const

function storeWithGame() {
  const store = new GameStore(':memory:')
  const game = store.create({ ...fresh, startedAt: '2026-11-07T12:00:00.000Z' })
  return { store, game }
}

describe('GameStore', () => {
  it('creates a game under way with no moves', () => {
    const { game } = storeWithGame()
    expect(game).toStrictEqual({
      id: 1,
      ...fresh,
      startedAt: '2026-11-07T12:00:00.000Z',
      moves: [],
      status: 'in_progress',
      result: '*',
    })
  })

  it('saves moves and how the game ended', () => {
    const { store, game } = storeWithGame()
    store.save({
      ...game,
      moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
      status: 'finished',
      result: '0-1',
      termination: 'checkmate',
      endedAt: '2026-11-07T12:05:00.000Z',
    })
    expect(store.get(game.id)).toMatchObject({
      moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
      status: 'finished',
      result: '0-1',
      termination: 'checkmate',
      endedAt: '2026-11-07T12:05:00.000Z',
    })
  })

  it('finds the latest game still under way', () => {
    const { store, game } = storeWithGame()
    const second = store.create({ ...fresh, startedAt: '2026-11-07T13:00:00.000Z' })
    store.save({ ...second, status: 'abandoned', termination: 'abandoned' })
    expect(store.latestInProgress()?.id).toBe(game.id)
    store.save({ ...game, status: 'resigned', result: '0-1', termination: 'resignation' })
    expect(store.latestInProgress()).toBeUndefined()
  })

  it('lists games newest first, with how many moves they had', () => {
    const { store, game } = storeWithGame()
    store.save({ ...game, moves: ['e2e4', 'e7e5'] })
    store.create({ ...fresh, startedAt: '2026-11-07T13:00:00.000Z' })
    expect(store.list().map((summary) => [summary.id, summary.plies])).toEqual([
      [2, 0],
      [1, 2],
    ])
  })

  it('deletes games', () => {
    const { store, game } = storeWithGame()
    store.delete(game.id)
    expect(store.get(game.id)).toBeUndefined()
  })

  it('refuses a colour that is not white or black', () => {
    const store = new GameStore(':memory:')
    expect(() =>
      store.create({ ...fresh, playerColor: 'green' as 'white', startedAt: '2026-11-07' }),
    ).toThrow(/CHECK constraint/)
  })

  it('refuses to read a row that is not in the expected form', () => {
    const { store, game } = storeWithGame()
    store.save({ ...game, status: 'paused' as 'finished' })
    expect(() => store.get(game.id)).toThrow(/not in the expected form[\s\S]*status/)
  })

  it('stores every status, result and termination the app knows', () => {
    const { store, game } = storeWithGame()
    for (const status of GAME_STATUSES) {
      for (const result of GAME_RESULTS) {
        for (const termination of TERMINATIONS) {
          store.save({ ...game, status, result, termination })
          expect(store.get(game.id)).toMatchObject({ status, result, termination })
        }
      }
    }
  })

  it('keeps its data between openings, without migrating twice', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'games-')), 'games.db')
    const first = new GameStore(path)
    const game = first.create({ ...fresh, startedAt: '2026-11-07T12:00:00.000Z' })
    first.close()
    const second = new GameStore(path)
    expect(second.get(game.id)?.initialFen).toBe(START_FEN)
    second.close()
  })
})
