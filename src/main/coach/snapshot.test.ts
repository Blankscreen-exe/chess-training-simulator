import { describe, expect, it } from 'vitest'
import type { PlayerProfile, ThemeRecord } from '@shared/profile'
import { PUZZLE_THEMES } from '@shared/training'
import { profileSnapshotOf } from './snapshot'

const NOW = new Date('2026-11-08T12:00:00Z')
const noMoves = { moves: 0, inaccuracies: 0, mistakes: 0, blunders: 0 }

describe('profileSnapshotOf', () => {
  it('lists the weakest and strongest themes apart, and times from now', () => {
    const themes = PUZZLE_THEMES.slice(0, 7).map((theme, index): ThemeRecord => ({
      theme,
      tries: 10,
      solved: index,
    }))
    const profile: PlayerProfile = {
      puzzles: { rating: 1500, tries: 70, solved: 21, themes },
      games: { won: 1, drawn: 0, lost: 2, unfinished: 0 },
      mistakes: { games: 0, byPhase: { opening: noMoves, middlegame: noMoves, endgame: noMoves } },
      weaknesses: [
        {
          id: 1,
          pattern: 'Misses forks',
          theme: 'fork',
          note: null,
          seen: 2,
          firstSeen: '2026-11-01T12:00:00Z',
          lastSeen: '2026-11-06T12:00:00Z',
        },
      ],
      weakSpots: ['fork'],
      practice: { due: 1, waiting: 2, learned: 0, nextDue: '2026-11-09T08:00:00Z' },
    }
    const snapshot = profileSnapshotOf(profile, NOW)
    expect(snapshot.puzzles.weakest_themes.map((t) => t.solved)).toEqual([0, 1, 2, 3, 4])
    expect(snapshot.puzzles.strongest_themes.map((t) => t.solved)).toEqual([6, 5])
    expect(snapshot.weaknesses[0]?.last_noted).toBe('2 days ago')
    expect(snapshot.practice).toEqual({
      due_now: 1,
      coming_back_later: 2,
      learned: 0,
      next_due: 'in 20 hours',
    })
  })
})
