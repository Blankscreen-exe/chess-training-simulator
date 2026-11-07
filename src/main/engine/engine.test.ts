// These run the real Stockfish build the app ships, in this process.
import { Chess } from 'chess.js'
import { afterAll, describe, expect, it } from 'vitest'
import { START_FEN } from '@shared/chess'
import { ENGINE_LEVEL_IDS } from '@shared/engine-levels'
import { Engine, goCommand, type UciTransport } from './engine'
import { inProcessTransport } from './in-process-transport'
import { playSettings } from './levels'

const engine = new Engine(inProcessTransport())
afterAll(() => engine.close())

/** Long enough that a search ends at its depth, not its time. */
const BY_DEPTH = { movetimeMs: 10_000 }

function isLegal(fen: string, uci: string): boolean {
  try {
    new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
    return true
  } catch {
    return false
  }
}

describe('Engine', () => {
  it('gives as many lines as asked for, best first, each legal', async () => {
    const analysis = await engine.analyse(START_FEN, {
      lines: 3,
      limits: { ...BY_DEPTH, depth: 10 },
    })
    expect(analysis?.lines.map((line) => line.multipv)).toEqual([1, 2, 3])
    expect(analysis?.depth).toBeGreaterThanOrEqual(10)
    for (const line of analysis?.lines ?? [])
      expect(isLegal(START_FEN, line.pv[0] ?? '')).toBe(true)
  })

  it('finds mate in one', async () => {
    const fen = '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'
    const analysis = await engine.analyse(fen, { lines: 1, limits: { ...BY_DEPTH, depth: 8 } })
    expect(analysis?.lines[0]?.pv[0]).toBe('d1d8')
    expect(analysis?.lines[0]?.score).toEqual({ type: 'mate', value: 1 })
  })

  it('plays a legal move at every level', async () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    for (const level of ENGINE_LEVEL_IDS) {
      const move = await engine.bestMove(fen, { ...playSettings(level), movetimeMs: 50 })
      expect(move !== null && isLegal(fen, move), `level ${level}`).toBe(true)
    }
  })

  it('has no move when there is none to play', async () => {
    const stalemate = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'
    expect(await engine.bestMove(stalemate, playSettings(8))).toBeNull()
  })

  it('skips a search nobody wants any more', async () => {
    const options = { lines: 1, limits: BY_DEPTH, stillWanted: () => false }
    expect(await engine.analyse(START_FEN, options)).toBeNull()
  })

  it('fails what it was asked once the engine stops', async () => {
    let exit: (reason: string) => void = () => undefined
    const transport: UciTransport = {
      send() {},
      onLine: () => () => undefined,
      onExit(listener) {
        exit = listener
        return () => undefined
      },
      close() {},
    }
    const dying = new Engine(transport)
    const asked = dying.bestMove(START_FEN, playSettings(1))
    exit('it crashed')
    await expect(asked).rejects.toThrow('The engine stopped: it crashed')
    expect(dying.alive).toBe(false)
  })
})

describe('goCommand', () => {
  it('limits by time, and by depth when given', () => {
    expect(goCommand({ movetimeMs: 300 })).toBe('go movetime 300')
    expect(goCommand({ movetimeMs: 300, depth: 5 })).toBe('go movetime 300 depth 5')
  })
})

describe('playSettings', () => {
  it('limits strength by rating where the level has one, and by skill otherwise', () => {
    expect(playSettings(1)).toEqual({ skill: 0, depth: 1, movetimeMs: 50 })
    expect(playSettings(5)).toMatchObject({ elo: 1600, skill: 20 })
    expect(playSettings(8)).not.toHaveProperty('elo')
  })
})
