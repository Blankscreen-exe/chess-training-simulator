// These run the real Stockfish build the app ships, in this process.
import { afterAll, describe, expect, it } from 'vitest'
import { Engine } from '../engine/engine'
import { inProcessTransport } from '../engine/in-process-transport'
import { AnalysisService, fromWhite } from './service'

const engine = new Engine(inProcessTransport())
afterAll(() => engine.close())
const service = new AnalysisService(() => engine)

describe('AnalysisService', () => {
  it('gives scores from White and lines in standard notation', async () => {
    // Black to move and mate in one with Qh4.
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2'
    const result = await service.analyse({ fen, lines: 2 })
    const best = result.ok ? result.analysis?.lines[0] : undefined
    expect(best?.san[0]).toBe('Qh4#')
    expect(best?.score).toEqual({ type: 'mate', value: -1 })
    expect(result.ok && result.analysis?.lines).toHaveLength(2)
  })

  it('answers only the newest of two requests', async () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    const [first, second] = await Promise.all([
      service.analyse({ fen, lines: 1 }),
      service.analyse({ fen, lines: 1 }),
    ])
    expect(first).toEqual({ ok: true, analysis: null })
    expect(second.ok && second.analysis?.lines).toHaveLength(1)
  })

  it('refuses positions that are not legal', async () => {
    expect(await service.analyse({ fen: '4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1', lines: 1 })).toEqual({
      ok: false,
      error: 'Black is in check but it is not their move',
    })
  })
})

describe('fromWhite', () => {
  it('turns Black-to-move scores around, without a negative zero', () => {
    expect(fromWhite({ type: 'cp', value: 35 }, 'black')).toEqual({ type: 'cp', value: -35 })
    expect(fromWhite({ type: 'mate', value: -2 }, 'black')).toEqual({ type: 'mate', value: 2 })
    expect(Object.is(fromWhite({ type: 'cp', value: 0 }, 'black').value, 0)).toBe(true)
  })
})
