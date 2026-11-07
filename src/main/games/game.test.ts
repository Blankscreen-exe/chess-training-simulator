import { describe, expect, it } from 'vitest'
import { START_FEN } from '@shared/chess'
import { Game, summaryOf, type StoredGame } from './game'

const IDLE = { thinking: false, failed: false }

const stored = (overrides: Partial<StoredGame> = {}): StoredGame => ({
  id: 1,
  playerColor: 'white',
  engineLevel: 3,
  opponent: 'engine',
  initialFen: START_FEN,
  startedAt: '2026-11-07T12:00:00.000Z',
  moves: [],
  status: 'in_progress',
  result: '*',
  ...overrides,
})

const newGame = (overrides: Partial<StoredGame> = {}) => Game.restore(stored(overrides))

describe('Game', () => {
  it('lets each side move only on its turn', () => {
    const game = newGame()
    expect(game.play({ from: 'e7', to: 'e5' }, 'black')).toEqual({
      ok: false,
      error: "It is white's move",
    })
    expect(game.play({ from: 'e2', to: 'e4' }, 'white')).toEqual({ ok: true })
    expect(game.turn).toBe('black')
    expect(game.opponentColor).toBe('black')
  })

  it('refuses illegal moves and leaves the game as it was', () => {
    const game = newGame()
    expect(game.play({ from: 'e2', to: 'e5' }, 'white')).toEqual({
      ok: false,
      error: 'e2e5 is not a legal move here',
    })
    expect(game.plies).toBe(0)
  })

  it('records each move, and keeps the stored moves in step', () => {
    const game = newGame()
    game.play({ from: 'g1', to: 'f3' }, 'white')
    const state = game.state(IDLE)
    expect(state.moves).toEqual([
      {
        uci: 'g1f3',
        san: 'Nf3',
        color: 'white',
        check: false,
        fenAfter: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
      },
    ])
    expect(state.position.lastMove).toEqual(['g1', 'f3'])
    expect(game.record().moves).toEqual(['g1f3'])
  })

  it('ends at checkmate, and the engine is no longer thinking or failed', () => {
    const game = newGame({ playerColor: 'black' })
    game.play({ from: 'f2', to: 'f3' }, 'white')
    game.play({ from: 'e7', to: 'e5' }, 'black')
    game.play({ from: 'g2', to: 'g4' }, 'white')
    game.play({ from: 'd8', to: 'h4' }, 'black')
    const state = game.state({ thinking: true, failed: true })
    expect(state).toMatchObject({
      status: 'finished',
      result: '0-1',
      termination: 'checkmate',
      opponentThinking: false,
      opponentFailed: false,
    })
    expect(state.endedAt).toBeDefined()
    expect(game.play({ from: 'a2', to: 'a3' }, 'white')).toEqual({
      ok: false,
      error: 'The game is over',
    })
  })

  it('counts resigning as a loss for the player', () => {
    const asWhite = newGame()
    asWhite.resign()
    expect(asWhite.state(IDLE)).toMatchObject({ status: 'resigned', result: '0-1' })
    const asBlack = newGame({ playerColor: 'black' })
    asBlack.resign()
    expect(asBlack.state(IDLE)).toMatchObject({ status: 'resigned', result: '1-0' })
  })

  it('leaves an abandoned game without a result', () => {
    const game = newGame()
    game.abandon()
    expect(game.state(IDLE)).toMatchObject({
      status: 'abandoned',
      result: '*',
      termination: 'abandoned',
    })
  })

  it('rebuilds a stored game from its moves', () => {
    const game = newGame({ moves: ['e2e4', 'e7e5', 'g1f3'] })
    expect(game.plies).toBe(3)
    expect(game.turn).toBe('black')
    expect(game.state(IDLE).moves.map((move) => move.san)).toEqual(['e4', 'e5', 'Nf3'])
    expect(game.state(IDLE).position.lastMove).toEqual(['g1', 'f3'])
  })

  it('refuses to rebuild a game with a move that cannot be played', () => {
    expect(() => newGame({ moves: ['e2e4', 'e2e4'] })).toThrow(/cannot be played: e2e4/)
  })

  it('starts from a set-up position', () => {
    const game = newGame({ initialFen: '4k3/8/8/8/8/8/4P3/4K3 b - - 0 1', playerColor: 'black' })
    expect(game.turn).toBe('black')
    expect(game.play({ from: 'e8', to: 'd7' }, 'black')).toEqual({ ok: true })
  })
})

describe('Game.pgn', () => {
  it('writes the game with its players, date and result', () => {
    const game = newGame({
      playerColor: 'black',
      engineLevel: 4,
      moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
      status: 'finished',
      result: '0-1',
      termination: 'checkmate',
    })
    const pgn = game.pgn()
    expect(pgn).toContain('[White "Stockfish (Level 4)"]')
    expect(pgn).toContain('[Black "You"]')
    expect(pgn).toContain('[Date "2026.11.07"]')
    expect(pgn).not.toContain('[FEN')
    expect(pgn).toMatch(/1\. f3 e5 2\. g4 Qh4# 0-1$/)
  })

  it('names the starting position when it is not the standard one', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'
    expect(newGame({ initialFen: fen }).pgn()).toContain(`[FEN "${fen}"]`)
  })
})

describe('summaryOf', () => {
  it('counts the moves instead of listing them', () => {
    expect(summaryOf(stored({ moves: ['e2e4', 'e7e5'] }))).toEqual({
      id: 1,
      playerColor: 'white',
      engineLevel: 3,
      opponent: 'engine',
      startedAt: '2026-11-07T12:00:00.000Z',
      status: 'in_progress',
      result: '*',
      plies: 2,
    })
  })
})
