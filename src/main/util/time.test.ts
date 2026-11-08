import { describe, expect, it } from 'vitest'
import { daysSince, timeUntil } from './time'

const NOW = new Date('2026-11-08T12:00:00Z')
const at = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString()

describe('times in words', () => {
  it('says how long until a time, in hours and then days', () => {
    expect(timeUntil(at(0.5), NOW)).toBe('within the hour')
    expect(timeUntil(at(-2), NOW)).toBe('within the hour')
    expect(timeUntil(at(20), NOW)).toBe('in 20 hours')
    expect(timeUntil(at(72), NOW)).toBe('in 3 days')
  })

  it('says how many days ago a time was', () => {
    expect(daysSince(at(-3), NOW)).toBe('today')
    expect(daysSince(at(-30), NOW)).toBe('yesterday')
    expect(daysSince(at(-24 * 5), NOW)).toBe('5 days ago')
  })
})
