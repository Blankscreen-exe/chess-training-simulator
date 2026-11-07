import { describe, expect, it } from 'vitest'
import type { GameState, PlayedMove } from '@shared/chess'
import { START_FEN } from '@shared/chess'
import { gameEvents } from './events'

const E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
const played: PlayedMove[] = [
  { uci: 'e2e4', san: 'e4', color: 'white', check: false, fenAfter: E4 },
  { uci: 'e7e5', san: 'e5', color: 'black', check: false, fenAfter: E5 },
]

const game = (overrides: Partial<GameState> = {}): GameState => ({
  id: 1,
  playerColor: 'white',
  engineLevel: 3,
  startedAt: '2026-11-07T12:00:00.000Z',
  status: 'in_progress',
  result: '*',
  initialFen: START_FEN,
  moves: [],
  position: { fen: START_FEN, turn: 'white', check: false, dests: {}, promotions: [] },
  engineThinking: false,
  engineFailed: false,
  ...overrides,
})

describe('gameEvents', () => {
  it('announces a new game, with how far it has got', () => {
    expect(gameEvents(null, game({ moves: played }))).toEqual([
      {
        type: 'game_started',
        game_id: 1,
        player_color: 'white',
        engine_level: 'Level 3',
        moves_played: 2,
        fen: START_FEN,
      },
    ])
  })

  it('names each new move, who made it, and its number', () => {
    expect(gameEvents(game(), game({ moves: played }))).toEqual([
      { type: 'move', by: 'player', move: '1. e4', fen_after: E4 },
      { type: 'move', by: 'engine', move: '1… e5', fen_after: E5 },
    ])
  })

  it('says when the game ends, once', () => {
    const over = game({ status: 'resigned', result: '0-1', termination: 'resignation' })
    expect(gameEvents(game(), over)).toEqual([
      { type: 'game_ended', result: '0-1', termination: 'resignation' },
    ])
    expect(gameEvents(over, over)).toEqual([])
  })

  it('has nothing to say about a change that is not a move or an ending', () => {
    expect(gameEvents(game(), game({ engineThinking: true }))).toEqual([])
    expect(gameEvents(game(), null)).toEqual([])
  })
})
