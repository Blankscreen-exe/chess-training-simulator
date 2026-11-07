import { describe, expect, it } from 'vitest'
import type { GameRecord, GameState, LineStep, PlayedMove, Position } from '@shared/chess'
import { START_FEN } from '@shared/chess'
import {
  afterPly,
  boardReducer,
  hasMoves,
  isAnalysable,
  LIVE,
  shownPosition,
  stepRange,
  type BoardView,
} from './boardView'

const position = (fen: string): Position => ({
  fen,
  turn: fen.split(' ')[1] === 'b' ? 'black' : 'white',
  check: false,
  dests: { e2: ['e4'] },
  promotions: [],
})

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'

const moves: PlayedMove[] = [
  { uci: 'e2e4', san: 'e4', color: 'white', check: false, fenAfter: AFTER_E4 },
  { uci: 'e7e5', san: 'e5', color: 'black', check: false, fenAfter: AFTER_E5 },
]

const step = (uci: string, fen: string): LineStep => ({ uci, san: uci, position: position(fen) })

const record: GameRecord = {
  id: 7,
  playerColor: 'white',
  engineLevel: 3,
  startedAt: '2026-11-07T12:00:00.000Z',
  status: 'finished',
  result: '1-0',
  plies: 2,
  initialFen: START_FEN,
  moves,
  pgn: '',
}

const game: GameState = {
  id: 1,
  playerColor: 'white',
  engineLevel: 3,
  startedAt: '2026-11-07T12:00:00.000Z',
  status: 'in_progress',
  result: '*',
  initialFen: START_FEN,
  moves,
  position: position(AFTER_E5),
  engineThinking: false,
  engineFailed: false,
}

const reduce = (view: BoardView, ...actions: Parameters<typeof boardReducer>[1][]) =>
  actions.reduce(boardReducer, view)

describe('boardReducer', () => {
  it('steps through the live game, and back to its current position at the end', () => {
    const back = reduce(LIVE, { type: 'go-to', ply: 1, liveMoves: 2 })
    expect(back).toEqual({ kind: 'live', ply: 1 })
    expect(reduce(back, { type: 'go-to', ply: 2, liveMoves: 2 })).toEqual(LIVE)
    expect(reduce(back, { type: 'go-to', ply: -5, liveMoves: 2 })).toEqual({ kind: 'live', ply: 0 })
  })

  it('opens a replay at its last move', () => {
    expect(reduce(LIVE, { type: 'open-replay', game: record })).toMatchObject({
      kind: 'replay',
      ply: 2,
    })
  })

  it('replaces what followed when a move is tried earlier on the analysis board', () => {
    const analysis = reduce(
      LIVE,
      { type: 'open-analysis', start: position(START_FEN) },
      { type: 'analysis-move', step: step('e2e4', AFTER_E4) },
      { type: 'analysis-move', step: step('e7e5', AFTER_E5) },
      { type: 'go-to', ply: 1, liveMoves: 0 },
      { type: 'analysis-move', step: step('c7c5', AFTER_E5) },
    )
    expect(analysis).toMatchObject({ kind: 'analysis', ply: 2 })
    expect(analysis.kind === 'analysis' && analysis.steps.map((s) => s.uci)).toEqual([
      'e2e4',
      'c7c5',
    ])
  })

  it('ignores analysis moves anywhere but the analysis board', () => {
    expect(reduce(LIVE, { type: 'analysis-move', step: step('e2e4', AFTER_E4) })).toBe(LIVE)
  })

  describe('previews', () => {
    const steps = [step('e2e4', AFTER_E4), step('e7e5', AFTER_E5)]
    const open = (from: BoardView) =>
      reduce(from, {
        type: 'open-preview',
        title: 'line',
        start: { fen: START_FEN, turn: 'white', check: false },
        steps,
      })

    it('play move by move, linger, then return where they came from', () => {
      const replay = reduce(LIVE, { type: 'open-replay', game: record })
      let view = open(replay)
      expect(view).toMatchObject({ kind: 'preview', ply: 0, playing: true })
      view = reduce(view, { type: 'preview-tick' }, { type: 'preview-tick' })
      expect(view).toMatchObject({ kind: 'preview', ply: 2 })
      expect(reduce(view, { type: 'preview-tick' })).toBe(replay)
    })

    it('stop playing when stepped by hand, and start over when played again from the end', () => {
      const stepped = reduce(open(LIVE), { type: 'go-to', ply: 2, liveMoves: 0 })
      expect(stepped).toMatchObject({ ply: 2, playing: false })
      expect(reduce(stepped, { type: 'preview-tick' })).toBe(stepped)
      expect(reduce(stepped, { type: 'preview-toggle-play' })).toMatchObject({
        ply: 0,
        playing: true,
      })
    })

    it('return to the board under them, not to another preview', () => {
      const first = open(LIVE)
      expect(reduce(open(first), { type: 'leave-preview' })).toBe(LIVE)
    })

    it('are left when a move is picked from the move list', () => {
      const analysis = reduce(
        LIVE,
        { type: 'open-analysis', start: position(START_FEN) },
        { type: 'analysis-move', step: step('e2e4', AFTER_E4) },
      )
      expect(reduce(open(analysis), { type: 'select-move', ply: 0, liveMoves: 0 })).toMatchObject({
        kind: 'analysis',
        ply: 0,
      })
    })
  })
})

describe('stepRange', () => {
  it('counts the moves of each kind of view', () => {
    expect(stepRange(LIVE, 5)).toEqual({ ply: 5, count: 5 })
    expect(stepRange({ kind: 'live', ply: 2 }, 5)).toEqual({ ply: 2, count: 5 })
    expect(stepRange({ kind: 'replay', game: record, ply: 1 }, 0)).toEqual({ ply: 1, count: 2 })
    expect(stepRange({ kind: 'editor', fen: START_FEN }, 0)).toBeNull()
  })
})

describe('shownPosition', () => {
  it('shows the live position, with its moves, only when it is current', () => {
    expect(shownPosition(LIVE, game)).toBe(game.position)
    expect(hasMoves(shownPosition({ kind: 'live', ply: 1 }, game))).toBe(false)
    expect(shownPosition(LIVE, null).fen).toBe(START_FEN)
  })

  it('never lets a preview be played on', () => {
    const view: BoardView = {
      kind: 'preview',
      title: '',
      start: position(START_FEN),
      steps: [step('e2e4', AFTER_E4)],
      ply: 1,
      playing: false,
      returnTo: LIVE,
    }
    const shown = shownPosition(view, game)
    expect(shown.fen).toBe(AFTER_E4)
    expect(hasMoves(shown)).toBe(false)
  })
})

describe('afterPly', () => {
  it('gives the start, or the position after a move with its squares highlighted', () => {
    expect(afterPly(START_FEN, moves, 0)).toEqual({ fen: START_FEN, turn: 'white', check: false })
    expect(afterPly(START_FEN, moves, 1)).toEqual({
      fen: AFTER_E4,
      turn: 'black',
      check: false,
      lastMove: ['e2', 'e4'],
    })
  })
})

describe('isAnalysable', () => {
  it('is false while the board moves by itself or is being set up', () => {
    expect(isAnalysable(LIVE)).toBe(true)
    expect(isAnalysable({ kind: 'editor', fen: START_FEN })).toBe(false)
  })
})
