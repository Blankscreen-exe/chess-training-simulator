import { describe, expect, it } from 'vitest'
import { assessMove, centipawnsFor, describeScore, winningChances } from './evaluation'

describe('centipawnsFor', () => {
  it('turns scores to the side asked for', () => {
    expect(centipawnsFor({ type: 'cp', value: 120 }, 'white')).toBe(120)
    expect(centipawnsFor({ type: 'cp', value: 120 }, 'black')).toBe(-120)
    expect(Object.is(centipawnsFor({ type: 'cp', value: 0 }, 'black'), 0)).toBe(true)
  })

  it('counts a mate as more than any material, and a quicker mate as more still', () => {
    const inTwo = centipawnsFor({ type: 'mate', value: 2 }, 'white')
    const inFive = centipawnsFor({ type: 'mate', value: 5 }, 'white')
    expect(inTwo).toBeGreaterThan(inFive)
    expect(inFive).toBeGreaterThan(5_000)
    expect(centipawnsFor({ type: 'mate', value: -2 }, 'black')).toBe(inTwo)
  })
})

describe('winningChances', () => {
  it('is even at level, and rises with the lead', () => {
    expect(winningChances(0)).toBe(50)
    expect(winningChances(300)).toBeGreaterThan(75)
    expect(winningChances(-300)).toBeLessThan(25)
  })
})

describe('assessMove', () => {
  const best = { uci: 'e2e4', san: 'e4', centipawns: 30 }

  it("calls the engine's own move best", () => {
    expect(assessMove({ played: 'e2e4', best, after: 30 }).quality).toBe('best')
  })

  it('grades other moves by the winning chances they give away', () => {
    expect(assessMove({ played: 'g1f3', best, after: 20 })).toEqual({
      quality: 'good',
      chances_lost: 1,
      centipawns_lost: 10,
      best_move: 'e4',
    })
    expect(assessMove({ played: 'a2a3', best, after: -80 }).quality).toBe('inaccuracy')
    expect(assessMove({ played: 'f2f3', best, after: -200 }).quality).toBe('mistake')
    expect(assessMove({ played: 'g2g4', best, after: -900 }).quality).toBe('blunder')
  })

  it('does not call a move a mistake when the game stays just as won', () => {
    expect(
      assessMove({ played: 'h2h3', best: { ...best, centipawns: 900 }, after: 700 }).quality,
    ).toBe('good')
  })
})

describe('describeScore', () => {
  it('puts scores in words', () => {
    expect(describeScore({ type: 'cp', value: 35 })).toBe('+0.35, White is better')
    expect(describeScore({ type: 'cp', value: -120 })).toBe('-1.20, Black is better')
    expect(describeScore({ type: 'cp', value: 10 })).toBe('+0.10, about level')
    expect(describeScore({ type: 'mate', value: -3 })).toBe('mate in 3 for Black')
  })
})
