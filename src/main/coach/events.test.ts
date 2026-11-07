import { describe, expect, it } from 'vitest'
import { gameState, playedMoves } from '@test-support/fixtures'
import { PUZZLE_ROWS, puzzlesOf } from '../library/test-support'
import { Puzzle } from '../puzzles/puzzle'
import { candidateMoves, gameEvents, puzzleEvents } from './events'
import { puzzleSnapshotOf } from './snapshot'

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

describe('puzzleEvents', () => {
  const [source] = puzzlesOf([PUZZLE_ROWS.rookWins])
  const snapshot = (state: Parameters<typeof puzzleSnapshotOf>[0]) => puzzleSnapshotOf(state, [])
  const start = () => {
    const started = source && Puzzle.start(source)
    if (!started?.ok) throw new Error('fixture')
    return started.puzzle
  }

  it('tells of a right move, then of the end when the answer is shown', () => {
    const puzzle = start()
    const before = puzzle.state()
    puzzle.tryMove({ from: 'e6', to: 'e7' })
    const after = puzzle.state()
    expect(puzzleEvents(before, after, snapshot)).toEqual([
      { type: 'puzzle_move', move: 'Rxe7', right: true, moves_found: 1, moves_to_find: 3 },
    ])
    puzzle.reveal()
    expect(puzzleEvents(after, puzzle.state(), snapshot)).toEqual([
      { type: 'puzzle_ended', result: 'revealed', mistakes: 0, hints: 0 },
    ])
  })

  it('counts a puzzle replaced or closed while being solved as left', () => {
    const first = start().state()
    const second = { ...start().state(), id: 'other' }
    expect(puzzleEvents(first, second, snapshot).map((event) => event.type)).toEqual([
      'puzzle_ended',
      'puzzle_started',
    ])
    expect(puzzleEvents(first, null, snapshot)).toEqual([
      { type: 'puzzle_ended', result: 'left', mistakes: 0, hints: 0 },
    ])
    expect(puzzleEvents(null, null, snapshot)).toEqual([])
  })
})
