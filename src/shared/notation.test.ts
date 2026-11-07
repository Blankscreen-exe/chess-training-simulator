import { describe, expect, it } from 'vitest'
import { START_FEN } from './chess'
import {
  joinFen,
  moveAt,
  numberedLine,
  parseUci,
  pieceLetterAt,
  splitFen,
  toUci,
  uciSquares,
} from './notation'

describe('parseUci', () => {
  it('reads moves and promotions', () => {
    expect(parseUci('e2e4')).toEqual({ from: 'e2', to: 'e4' })
    expect(parseUci('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' })
  })

  it('refuses anything else', () => {
    for (const bad of ['', 'e2', 'e2e9', 'e7e8k', 'e2e4 ', 'Nf3', '0000']) {
      expect(parseUci(bad), bad).toBeNull()
    }
  })
})

describe('toUci and uciSquares', () => {
  it('write and split a move', () => {
    expect(toUci({ from: 'e7', to: 'e8', promotion: 'n' })).toBe('e7e8n')
    expect(toUci({ from: 'g1', to: 'f3' })).toBe('g1f3')
    expect(uciSquares('e7e8q')).toEqual(['e7', 'e8'])
  })
})

describe('splitFen and joinFen', () => {
  it('round-trip a FEN', () => {
    expect(splitFen(START_FEN)).toEqual({
      placement: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',
      turn: 'white',
      castling: 'KQkq',
      enPassant: '-',
      halfmoves: 0,
      fullmoves: 1,
    })
    expect(joinFen(splitFen(START_FEN))).toBe(START_FEN)
  })

  it('fill in missing fields', () => {
    expect(joinFen(splitFen('8/8/8/8/8/8/8/8 b'))).toBe('8/8/8/8/8/8/8/8 b - - 0 1')
  })
})

describe('moveAt', () => {
  it('numbers moves from the start', () => {
    expect(moveAt(START_FEN, 1)).toEqual({ number: 1, color: 'white' })
    expect(moveAt(START_FEN, 2)).toEqual({ number: 1, color: 'black' })
    expect(moveAt(START_FEN, 3)).toEqual({ number: 2, color: 'white' })
  })

  it('numbers moves from a position with Black to move', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 b - - 0 12'
    expect(moveAt(fen, 1)).toEqual({ number: 12, color: 'black' })
    expect(moveAt(fen, 2)).toEqual({ number: 13, color: 'white' })
  })
})

describe('numberedLine', () => {
  it('writes a line as players do', () => {
    expect(numberedLine(START_FEN, ['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Nf3')
    expect(numberedLine('4k3/8/8/8/8/8/4P3/4K3 b - - 0 12', ['Kd7', 'e4'])).toBe('12… Kd7 13. e4')
    expect(numberedLine(START_FEN, [])).toBe('')
  })
})

describe('pieceLetterAt', () => {
  const placement = splitFen(
    'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
  ).placement

  it('reads the piece on a square', () => {
    expect(pieceLetterAt(placement, 'c4')).toBe('B')
    expect(pieceLetterAt(placement, 'c6')).toBe('n')
    expect(pieceLetterAt(placement, 'a8')).toBe('r')
    expect(pieceLetterAt(placement, 'h1')).toBe('R')
  })

  it('finds nothing on an empty square', () => {
    expect(pieceLetterAt(placement, 'd5')).toBeNull()
    expect(pieceLetterAt(placement, 'g1')).toBeNull()
  })
})
