import { describe, expect, it } from 'vitest'
import { gameState, playedMoves } from '@test-support/fixtures'
import { candidateMoves, gameEvents } from './events'

const [e4, e5] = playedMoves(['e4', 'e5'])

describe('gameEvents', () => {
  it('announces a new game, with how far it has got', () => {
    const resumed = gameState({ moves: [e4!, e5!] })
    expect(gameEvents(null, resumed)).toEqual([
      {
        type: 'game_started',
        game_id: 1,
        player_color: 'white',
        engine_level: 'Level 3',
        opponent: 'engine',
        moves_played: 2,
        fen: e5!.fenAfter,
      },
    ])
  })

  it('names each new move, who made it, its number and its place in the game', () => {
    expect(gameEvents(gameState(), gameState({ moves: [e4!, e5!] }))).toEqual([
      { type: 'move', by: 'player', ply: 1, move: '1. e4', fen_after: e4!.fenAfter },
      { type: 'move', by: 'opponent', ply: 2, move: '1… e5', fen_after: e5!.fenAfter },
    ])
  })

  it('says when the game ends, once', () => {
    const over = gameState({ status: 'resigned', result: '0-1', termination: 'resignation' })
    expect(gameEvents(gameState(), over)).toEqual([
      { type: 'game_ended', result: '0-1', termination: 'resignation' },
    ])
    expect(gameEvents(over, over)).toEqual([])
  })

  it('has nothing to say about a change that is not a move or an ending', () => {
    expect(gameEvents(gameState(), gameState({ opponentThinking: true }))).toEqual([])
    expect(gameEvents(gameState(), null)).toEqual([])
  })
})

describe('candidateMoves', () => {
  it('gives the first move of each line, with the engine’s view in words', () => {
    expect(
      candidateMoves([
        { rank: 1, depth: 10, score: { type: 'cp', value: 31 }, uci: ['e2e4'], san: ['e4'] },
        { rank: 2, depth: 10, score: { type: 'mate', value: -2 }, uci: ['f2f3'], san: ['f3'] },
        { rank: 3, depth: 10, score: { type: 'cp', value: 0 }, uci: [], san: [] },
      ]),
    ).toEqual([
      { move: 'e4', evaluation: '+0.31, White is better' },
      { move: 'f3', evaluation: 'mate in 2 for Black' },
    ])
  })
})
