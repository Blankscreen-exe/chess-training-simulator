import { describe, expect, it } from 'vitest'
import { START_FEN } from '@shared/chess'
import { describeEnding, playerOutcome } from './outcome'
import { loadNewGameChoices } from './preferences'
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
