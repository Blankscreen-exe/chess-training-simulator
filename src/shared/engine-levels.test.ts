import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ENGINE_LEVEL,
  ENGINE_LEVEL_IDS,
  ENGINE_LEVELS,
  engineLevelDescription,
  engineLevelName,
  isEngineLevel,
} from './engine-levels'

describe('engine levels', () => {
  it('describe every level once, weakest first', () => {
    expect(ENGINE_LEVELS.map((level) => level.id)).toEqual([...ENGINE_LEVEL_IDS])
    const ratings = ENGINE_LEVELS.flatMap((level) => (level.elo ? [level.elo] : []))
    expect(ratings).toEqual([...ratings].sort((a, b) => a - b))
    expect(isEngineLevel(DEFAULT_ENGINE_LEVEL)).toBe(true)
  })

  it('give every level something to say', () => {
    for (const id of ENGINE_LEVEL_IDS) expect(engineLevelDescription(id)).not.toBe('')
  })

  it('build names and descriptions', () => {
    expect(engineLevelName(4)).toBe('Level 4')
    expect(engineLevelDescription(3)).toBe('Casual player')
    expect(engineLevelDescription(4)).toBe('Club beginner, about 1350')
    expect(engineLevelDescription(5)).toBe('About 1600')
  })

  it('know which numbers are levels', () => {
    expect(isEngineLevel(1)).toBe(true)
    expect(isEngineLevel(0)).toBe(false)
    expect(isEngineLevel(9)).toBe(false)
  })
})
