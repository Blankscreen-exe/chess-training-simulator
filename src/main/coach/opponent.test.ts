import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Analysis } from '@shared/chess'
import { START_FEN } from '@shared/chess'
import type { Opponent } from '../games/opponent'
import type { PositionAnalyst } from './analyst'
import { CoachOpponent } from './opponent'
import { testHub } from './test-support'

/** The engine's best moves in every position: e4, then d4. */
const analyst: PositionAnalyst = {
  analyse: (fen): Promise<Analysis> =>
    Promise.resolve({
      fen,
      depth: 12,
      lines: [
        { rank: 1, depth: 12, score: { type: 'cp', value: 30 }, uci: ['e2e4'], san: ['e4'] },
        { rank: 2, depth: 12, score: { type: 'cp', value: 20 }, uci: ['d2d4'], san: ['d4'] },
      ],
    }),
  assess: () => Promise.resolve(null),
}

/** Stockfish's stand-in, playing h4 whenever asked. */
const stockfish: Opponent = { chooseMove: () => Promise.resolve('h2h4') }

const turn = { gameId: 1, fen: START_FEN, level: 3 } as const
const CHOOSE_WITHIN_MS = 1_000

function setUp(connected = true) {
  const hub = testHub({ connected })
  return { hub, opponent: new CoachOpponent(hub, analyst, stockfish, CHOOSE_WITHIN_MS) }
}

afterEach(() => vi.useRealTimers())

describe('CoachOpponent', () => {
  it('offers the coach the engine’s best moves, and plays the one it chooses', async () => {
    const { hub, opponent } = setUp()
    const choosing = opponent.chooseMove(turn, new AbortController().signal)
    await vi.waitFor(() => expect(opponent.choose('d4')).toEqual({ ok: true, move: 'd4' }))
    await expect(choosing).resolves.toBe('d2d4')
    await expect(hub.waitForEvents()).resolves.toEqual({
      events: [
        {
          type: 'opponent_to_move',
          fen: START_FEN,
          candidates: [
            { move: 'e4', evaluation: '+0.30, White is better' },
            { move: 'd4', evaluation: '+0.20, about level' },
          ],
        },
      ],
    })
  })

  it('refuses a move it was not offered, and keeps waiting', async () => {
    const { opponent } = setUp()
    const choosing = opponent.chooseMove(turn, new AbortController().signal)
    await vi.waitFor(() =>
      expect(opponent.choose('Nf3')).toEqual({
        ok: false,
        error: 'Choose one of the moves offered: e4, d4',
      }),
    )
    expect(opponent.choose('e4')).toEqual({ ok: true, move: 'e4' })
    await expect(choosing).resolves.toBe('e2e4')
  })

  it("plays the engine's best move if the coach takes too long", async () => {
    vi.useFakeTimers()
    const { opponent } = setUp()
    const choosing = opponent.chooseMove(turn, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(CHOOSE_WITHIN_MS)
    await expect(choosing).resolves.toBe('e2e4')
    expect(opponent.choose('d4').ok).toBe(false)
  })

  it('lets Stockfish play while the coach is not listening', async () => {
    const { opponent } = setUp(false)
    await expect(opponent.chooseMove(turn, new AbortController().signal)).resolves.toBe('h2h4')
  })

  it('stops waiting when the move is no longer wanted', async () => {
    const { opponent } = setUp()
    const abort = new AbortController()
    const choosing = opponent.chooseMove(turn, abort.signal)
    await vi.waitFor(() => expect(opponent.choose('x').ok).toBe(false))
    abort.abort()
    await expect(choosing).resolves.toBeNull()
    expect(opponent.choose('e4')).toEqual({
      ok: false,
      error: 'It is not your move as the opponent',
    })
  })
})
