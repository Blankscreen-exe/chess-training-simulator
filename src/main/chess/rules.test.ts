import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { START_FEN } from '@shared/chess'
import {
  describeFen,
  describePosition,
  normalizeFen,
  outcome,
  playMove,
  replay,
  resolveLine,
  sanLine,
  toPlayedMove,
} from './rules'

describe('describePosition', () => {
  it('lists every legal move from the starting position', () => {
    const position = describePosition(new Chess())
    expect(position.turn).toBe('white')
    expect(position.check).toBe(false)
    expect(position.dests['e2']).toEqual(['e3', 'e4'])
    expect(position.dests['g1']).toEqual(['f3', 'h3'])
    expect(Object.values(position.dests).flat()).toHaveLength(20)
    expect(position.promotions).toEqual([])
    expect(position.lastMove).toBeUndefined()
  })

  it('lists the moves that promote, captures included', () => {
    const position = describePosition(new Chess('3r3k/4P3/8/8/8/8/8/K7 w - - 0 1'))
    expect(position.promotions).toEqual(['e7d8', 'e7e8'])
  })
})

describe('toPlayedMove', () => {
  it('records the move, its notation, who made it and whether it checks', () => {
    const chess = new Chess('7k/8/8/8/8/8/8/K5R1 w - - 0 1')
    expect(toPlayedMove(chess.move('Rh1+'))).toEqual({
      uci: 'g1h1',
      san: 'Rh1+',
      color: 'white',
      check: true,
      fenAfter: '7k/8/8/8/8/8/8/K6R b - - 1 1',
    })
  })
})

describe('normalizeFen', () => {
  it('accepts a legal position and tidies its spacing', () => {
    expect(normalizeFen(`  ${START_FEN.replaceAll(' ', '   ')} `)).toEqual({
      ok: true,
      fen: START_FEN,
    })
  })

  it('refuses positions chess.js refuses, without its prefix', () => {
    expect(normalizeFen('8/8/8/8/8/8/8/8 w - - 0 1')).toEqual({
      ok: false,
      error: 'missing white king',
    })
  })

  it('refuses a position where the side not to move is in check', () => {
    expect(normalizeFen('4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1')).toEqual({
      ok: false,
      error: 'Black is in check but it is not their move',
    })
  })

  it('drops castling rights the pieces do not allow', () => {
    // The white king has left e1, and the black rook a8.
    expect(normalizeFen('1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1KNR w KQkq - 0 1')).toEqual({
      ok: true,
      fen: '1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQ1KNR w k - 0 1',
    })
  })
})

describe('describeFen', () => {
  it('describes a legal position and refuses an illegal one', () => {
    const described = describeFen(START_FEN)
    expect(described.ok && described.position.fen).toBe(START_FEN)
    expect(describeFen('8/8/8/8/8/8/8/8 w - - 0 1').ok).toBe(false)
  })
})

describe('replay', () => {
  it('plays every move, telling the caller after each', () => {
    const chess = new Chess()
    const seen: string[] = []
    const { played, refused } = replay(chess, ['e2e4', 'e7e5'], () => seen.push(chess.fen()))
    expect(played.map((move) => move.san)).toEqual(['e4', 'e5'])
    expect(refused).toBeUndefined()
    expect(seen).toHaveLength(2)
  })

  it('stops at the first move that cannot be played, or is not a move at all', () => {
    expect(replay(new Chess(), ['e2e4', 'e2e4', 'd2d4']).refused).toEqual({
      index: 1,
      move: 'e2e4',
    })
    expect(replay(new Chess(), ['Nf6']).refused).toEqual({ index: 0, move: 'Nf6' })
  })
})

describe('playMove', () => {
  it('plays a legal move', () => {
    const result = playMove(START_FEN, { from: 'e2', to: 'e4' })
    expect(result.ok && result.san).toBe('e4')
    expect(result.ok && result.position.turn).toBe('black')
    expect(result.ok && result.position.lastMove).toEqual(['e2', 'e4'])
  })

  it('refuses an illegal one', () => {
    expect(playMove(START_FEN, { from: 'e2', to: 'e5' })).toEqual({
      ok: false,
      error: 'e2e5 is not a legal move here',
    })
  })
})

describe('resolveLine', () => {
  it('gives each position along a line', () => {
    const result = resolveLine(START_FEN, ['e2e4', 'e7e5', 'g1f3'])
    expect(result.ok && result.steps.map((step) => step.san)).toEqual(['e4', 'e5', 'Nf3'])
    expect(result.ok && result.steps[2]?.position.lastMove).toEqual(['g1', 'f3'])
  })

  it('names the first move that cannot be played', () => {
    expect(resolveLine(START_FEN, ['e2e4', 'e2e4'])).toEqual({
      ok: false,
      error: 'Move 2, e2e4, is not a legal move there',
    })
  })
})

describe('sanLine', () => {
  it('stops at the first illegal move', () => {
    expect(sanLine(START_FEN, ['d2d4', 'd7d5', 'a1a8', 'c2c4'])).toEqual(['d4', 'd5'])
  })
})

describe('outcome', () => {
  const after = (fen: string, moves: string[] = []) => {
    const chess = new Chess(fen)
    for (const move of moves) chess.move(move)
    return outcome(chess)
  }

  it('is null while the game goes on', () => {
    expect(after(START_FEN, ['e4'])).toBeNull()
  })

  it('sees checkmate, and who won', () => {
    expect(after(START_FEN, ['f3', 'e5', 'g4', 'Qh4#'])).toEqual({
      result: '0-1',
      termination: 'checkmate',
    })
  })

  it('sees the draws', () => {
    expect(after('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')?.termination).toBe('stalemate')
    expect(after('7k/8/6K1/8/8/8/8/8 w - - 0 1')?.termination).toBe('insufficient_material')
    expect(after('7k/8/6K1/8/8/8/8/R7 w - - 100 80')?.termination).toBe('fifty_moves')
    expect(
      after(START_FEN, ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'])?.termination,
    ).toBe('threefold_repetition')
  })
})
