import { describe, expect, it } from 'vitest'
import { parseBestMove, parseInfo } from './uci'

describe('parseInfo', () => {
  it('reads a scored line', () => {
    expect(
      parseInfo(
        'info depth 14 seldepth 21 multipv 2 score cp -50 nodes 266097 nps 430577 hashfull 84 time 618 pv c7c5 g1f3 e7e6',
      ),
    ).toEqual({
      depth: 14,
      multipv: 2,
      score: { type: 'cp', value: -50 },
      bound: false,
      pv: ['c7c5', 'g1f3', 'e7e6'],
    })
  })

  it('reads mate scores and bounds', () => {
    expect(parseInfo('info depth 9 score mate -3 lowerbound nodes 10 pv e1e2')).toMatchObject({
      multipv: 1,
      score: { type: 'mate', value: -3 },
      bound: true,
    })
  })

  it('ignores lines without a scored line of play', () => {
    expect(parseInfo('info string NNUE evaluation using nn-1111.nnue')).toBeNull()
    expect(parseInfo('info depth 5 currmove e2e4 currmovenumber 1')).toBeNull()
    expect(parseInfo('info depth 0 score mate 0')).toBeNull()
    expect(parseInfo('bestmove e2e4')).toBeNull()
  })
})

describe('parseBestMove', () => {
  it('reads the move, with or without a ponder move', () => {
    expect(parseBestMove('bestmove e7e5 ponder g1f3')).toBe('e7e5')
    expect(parseBestMove('bestmove e7e8q')).toBe('e7e8q')
  })

  it('gives null when the engine has no move', () => {
    expect(parseBestMove('bestmove (none)')).toBeNull()
  })

  it('gives undefined for other lines', () => {
    expect(parseBestMove('readyok')).toBeUndefined()
  })
})
