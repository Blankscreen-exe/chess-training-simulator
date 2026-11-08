import { describe, expect, it } from 'vitest'
import { START_FEN } from '@shared/chess'
import { puzzleState } from '@test-support/fixtures'
import { describeEnding, playerOutcome } from './outcome'
import { loadNewGameChoices, loadPuzzleChoices, WEAK_SPOTS } from './preferences'
import { describePractice, describeRating, describeSolved, timesNoted } from './profile'
import { practiceNote, puzzleHeading, puzzleName, puzzleProgress, puzzleThemes } from './puzzle'
import { formatScore, whiteShare } from './score'
import { scoreSheet } from './scoreSheet'

describe('playerOutcome and describeEnding', () => {
  const ending = (overrides: Partial<Parameters<typeof playerOutcome>[0]>) => ({
    status: 'finished' as const,
    result: '1-0' as const,
    playerColor: 'white' as const,
    ...overrides,
  })

  it('tell a win from a loss by the side the player had', () => {
    expect(playerOutcome(ending({}))).toBe('won')
    expect(playerOutcome(ending({ playerColor: 'black' }))).toBe('lost')
    expect(describeEnding(ending({ termination: 'checkmate' }))).toBe('You won by checkmate')
    expect(describeEnding(ending({ playerColor: 'black', termination: 'checkmate' }))).toBe(
      'You lost by checkmate',
    )
  })

  it('name who resigned', () => {
    const resigned = ending({ status: 'resigned', result: '0-1', termination: 'resignation' })
    expect(describeEnding(resigned)).toBe('You resigned')
    expect(describeEnding({ ...resigned, playerColor: 'black' })).toBe('Your opponent resigned')
  })

  it('describe draws, unfinished games and games under way', () => {
    expect(describeEnding(ending({ result: '1/2-1/2', termination: 'stalemate' }))).toBe(
      'Draw by stalemate',
    )
    expect(playerOutcome(ending({ status: 'abandoned', result: '*' }))).toBe('unfinished')
    expect(describeEnding(ending({ status: 'abandoned', result: '*' }))).toBe('Left unfinished')
    expect(describeEnding(ending({ status: 'in_progress', result: '*' }))).toBe('In progress')
  })
})

describe('formatScore and whiteShare', () => {
  it('write scores as chess players do', () => {
    expect(formatScore({ type: 'cp', value: 35 })).toBe('+0.35')
    expect(formatScore({ type: 'cp', value: -120 })).toBe('−1.20')
    expect(formatScore({ type: 'cp', value: 0 })).toBe('0.00')
    expect(formatScore({ type: 'mate', value: 3 })).toBe('#3')
    expect(formatScore({ type: 'mate', value: -2 })).toBe('#-2')
  })

  it('fill the bar by who is better', () => {
    expect(whiteShare({ type: 'cp', value: 0 })).toBe(0.5)
    expect(whiteShare({ type: 'cp', value: 300 })).toBeGreaterThan(0.75)
    expect(whiteShare({ type: 'mate', value: 1 })).toBe(1)
    expect(whiteShare({ type: 'mate', value: -1 })).toBe(0)
  })
})

describe('scoreSheet', () => {
  const san = (...moves: string[]) => moves.map((move) => ({ san: move }))

  it('pairs moves under their numbers', () => {
    expect(scoreSheet(START_FEN, san('e4', 'e5', 'Nf3'))).toEqual([
      { number: 1, white: { san: 'e4', ply: 1 }, black: { san: 'e5', ply: 2 } },
      { number: 2, white: { san: 'Nf3', ply: 3 } },
    ])
  })

  it("leaves White's half empty when Black moves first", () => {
    expect(scoreSheet('4k3/8/8/8/8/8/4P3/4K3 b - - 0 12', san('Kd7', 'e4'))).toEqual([
      { number: 12, black: { san: 'Kd7', ply: 1 } },
      { number: 13, white: { san: 'e4', ply: 2 } },
    ])
  })
})

describe('loadNewGameChoices', () => {
  const storage = (value: string | null) => ({ getItem: () => value })
  const defaults = { playerColor: 'white', engineLevel: 3, opponent: 'engine' }

  it('reads what was saved', () => {
    expect(
      loadNewGameChoices(storage('{"playerColor":"black","engineLevel":6,"opponent":"coach"}')),
    ).toEqual({ playerColor: 'black', engineLevel: 6, opponent: 'coach' })
  })

  it('falls back to the defaults for anything missing, unknown or broken', () => {
    expect(loadNewGameChoices(storage(null))).toEqual(defaults)
    expect(loadNewGameChoices(storage('not json'))).toEqual(defaults)
    expect(
      loadNewGameChoices(storage('{"playerColor":"green","engineLevel":42,"opponent":"magnus"}')),
    ).toEqual(defaults)
    expect(loadNewGameChoices(storage('{"engineLevel":5}'))).toEqual({
      ...defaults,
      engineLevel: 5,
    })
  })
})

describe('loadPuzzleChoices', () => {
  const storage = (value: string | null) => ({ getItem: () => value })

  it('reads a known theme and piece, and takes anything else as any', () => {
    expect(loadPuzzleChoices(storage('{"theme":"fork","piece":"knight"}'))).toEqual({
      theme: 'fork',
      piece: 'knight',
    })
    expect(loadPuzzleChoices(storage('{"theme":"magic","piece":7}'))).toEqual({
      theme: null,
      piece: null,
    })
    expect(loadPuzzleChoices(storage('[1]'))).toEqual({ theme: null, piece: null })
    expect(loadPuzzleChoices(storage('{"theme":"weak-spots"}'))).toEqual({
      theme: WEAK_SPOTS,
      piece: null,
    })
  })
})

describe('puzzle wording', () => {
  const puzzle = puzzleState

  it('says what to do, and how the player is getting on', () => {
    expect(puzzleHeading(puzzle({}))).toBe('Puzzle rated 1819 — find the best move for White')
    expect(puzzleHeading(puzzle({ title: 'Forks, 1 of 3', status: 'solved' }))).toBe(
      'Forks, 1 of 3 — solved',
    )
    expect(puzzleProgress(puzzle({}))).toBe('White to play and win: the answer is 3 moves long.')
    expect(puzzleProgress(puzzle({ found: 1 }))).toBe('Right! 1 of 3 moves found. Keep going.')
    expect(puzzleProgress(puzzle({ found: 1, wrongMove: 'Qg6' }))).toBe('Qg6 is not it. Try again.')
    expect(puzzleProgress(puzzle({ status: 'solved' }))).toBe('Solved, first time.')
    expect(puzzleProgress(puzzle({ status: 'solved', mistakes: 2, hints: 1 }))).toBe(
      'Solved, with 2 wrong tries and 1 hint.',
    )
  })

  it('says where a position being practised comes from, and what was played there', () => {
    const fromGame = puzzle({
      rating: null,
      practice: { from: 'game', gameId: 4, played: '4. d3' },
    })
    expect(puzzleName(fromGame)).toBe('Practice: a position from your game')
    expect(practiceNote(fromGame)).toBe('In the game you played 4. d3 here.')
    const missed = puzzle({ practice: { from: 'puzzle' } })
    expect(puzzleName(missed)).toBe('Practice: a puzzle you missed')
    expect(practiceNote(missed)).toBeNull()
    expect(puzzleName(puzzle({ practice: { from: 'puzzle' }, title: 'Forks' }))).toBe('Forks')
  })

  it('keeps the themes back until the puzzle is over, as they give the idea away', () => {
    expect(puzzleThemes(puzzle({}))).toEqual([])
    expect(puzzleThemes(puzzle({ status: 'revealed' }))).toEqual(['Fork', 'Middlegame'])
  })
})

describe('profile wording', () => {
  const practice = { due: 0, waiting: 0, learned: 0, nextDue: null }

  it('says what is waiting to be practised', () => {
    expect(describePractice(practice)).toMatch(/^Puzzles you miss/)
    expect(describePractice({ ...practice, due: 2, waiting: 3, learned: 1 })).toBe(
      '2 positions to practise now. 3 more come back later. 1 learned.',
    )
    expect(describePractice({ ...practice, due: 1, waiting: 1 })).toBe(
      '1 position to practise now. 1 more comes back later.',
    )
    const nextDue = new Date(2026, 10, 9, 4).toISOString()
    expect(describePractice({ ...practice, waiting: 1, nextDue })).toMatch(
      /^Nothing to practise now\. The next comes back on .*9.*\.$/,
    )
  })

  it('gives the puzzle rating, or how many puzzles are left before one', () => {
    const record = { rating: null, tries: 7, solved: 3, themes: [] }
    expect(describeRating(record)).toBe('Not rated yet: 3 more puzzles to go.')
    expect(describeRating({ ...record, rating: 1432 })).toBe('Puzzle rating 1432')
    expect(describeSolved(record)).toBe('Solved first time: 3 of 7 (43%).')
    expect(describeSolved({ ...record, tries: 0 })).toBeNull()
  })

  it('counts how often a weakness was noted in words', () => {
    expect([1, 2, 5].map(timesNoted)).toEqual(['once', 'twice', '5 times'])
  })
})
