import type { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { RATED_AFTER, type Weakness } from '@shared/profile'
import { PUZZLE_RATINGS } from '@shared/training'
import { GameStore } from '../games/store'
import { AttemptStore, outcomeOf, type FirstTry } from '../puzzles/attempts'
import { ReviewStore } from '../reviews/store'
import { openDatabase } from '../storage/database'
import { BOX_DAYS, dayStart, PracticeStore, reschedule, type NewPracticePosition } from './practice'
import { ProfileService } from './service'
import { puzzleRating, themeRecords, THEME_TRIES, weakSpots } from './stats'
import { WeaknessStore } from './weaknesses'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-11-08T12:00:00Z')
const daysLater = (days: number) => new Date(NOW.getTime() + days * DAY_MS)

let db: DatabaseSync
beforeEach(() => {
  db = openDatabase(':memory:')
})

const missedPuzzle: NewPracticePosition = {
  key: 'puzzle:00008',
  origin: { from: 'puzzle' },
  fen: 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24',
  moves: ['f2g3', 'e6e7'],
  rating: 1819,
  themes: ['crushing', 'middlegame'],
}
const fromGame: NewPracticePosition = {
  key: 'game:4:7',
  origin: { from: 'game', gameId: 4, played: '4. d3' },
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  moves: ['g8f6', 'h5f7'],
  rating: null,
  themes: ['opening'],
}

describe('outcomeOf', () => {
  it('counts only a solve with no wrong move and no hint as clean, and ignores an untried puzzle', () => {
    expect(outcomeOf({ result: 'solved', mistakes: 0, hints: 0 })).toBe('clean')
    expect(outcomeOf({ result: 'solved', mistakes: 1, hints: 0 })).toBe('missed')
    expect(outcomeOf({ result: 'solved', mistakes: 0, hints: 1 })).toBe('missed')
    expect(outcomeOf({ result: 'revealed', mistakes: 0, hints: 0 })).toBe('missed')
    expect(outcomeOf({ result: 'left', mistakes: 2, hints: 0 })).toBe('missed')
    expect(outcomeOf({ result: 'left', mistakes: 0, hints: 0 })).toBeNull()
  })
})

describe('dayStart', () => {
  it("is four in the morning, the player's time, counting a late night as the day before", () => {
    const evening = new Date(2026, 10, 8, 21, 30)
    expect(new Date(dayStart(evening, 1))).toEqual(new Date(2026, 10, 9, 4))
    expect(new Date(dayStart(evening, 7))).toEqual(new Date(2026, 10, 15, 4))
    const lateNight = new Date(2026, 10, 9, 1, 0)
    expect(new Date(dayStart(lateNight, 1))).toEqual(new Date(2026, 10, 9, 4))
  })
})

describe('reschedule', () => {
  it('moves a position up a box when solved first time, to come back later each time', () => {
    const due = []
    let box = 0
    for (let step = 1; step < BOX_DAYS.length; step++) {
      const next = reschedule(box, 'clean', NOW)
      expect(next.learned).toBe(false)
      due.push(next.dueAt)
      box = next.box
    }
    expect(due).toEqual(BOX_DAYS.slice(1).map((days) => dayStart(NOW, days)))
    expect(reschedule(box, 'clean', NOW).learned).toBe(true)
  })

  it('sends a missed position back to the first box, for the next day', () => {
    expect(reschedule(3, 'missed', NOW)).toEqual({
      box: 0,
      dueAt: dayStart(NOW, 1),
      learned: false,
    })
  })
})

describe('PracticeStore', () => {
  /** When a position added or tried at NOW comes back after `days`. */
  const day = (days: number) => new Date(dayStart(NOW, days))

  it('brings a missed position back the next day, and not before', () => {
    const store = new PracticeStore(db)
    store.add(fromGame, NOW)
    expect(store.next(NOW)).toBeNull()
    expect(store.summary(NOW)).toEqual({
      due: 0,
      waiting: 1,
      learned: 0,
      nextDue: dayStart(NOW, 1),
    })
    expect(store.next(day(1))).toMatchObject({
      key: 'game:4:7',
      origin: { from: 'game', gameId: 4, played: '4. d3' },
      moves: ['g8f6', 'h5f7'],
      rating: null,
      themes: ['opening'],
      box: 0,
    })
  })

  it('offers the position due longest ago first', () => {
    const store = new PracticeStore(db)
    store.add(fromGame, NOW)
    store.add(missedPuzzle, day(1))
    expect(store.next(day(5))?.key).toBe('game:4:7')
  })

  it('spaces a position out as it is solved, until it is learned', () => {
    const store = new PracticeStore(db)
    store.add(missedPuzzle, NOW)
    let at = NOW
    for (let tries = 0; tries < BOX_DAYS.length; tries++) {
      at = new Date(store.summary(at).nextDue ?? '')
      const position = store.next(at)
      if (!position) throw new Error('nothing due')
      store.record(position.id, 'clean', at)
    }
    expect(store.summary(at)).toEqual({ due: 0, waiting: 0, learned: 1, nextDue: null })
  })

  it('starts a position over when it is missed, in practice or in the library again', () => {
    const store = new PracticeStore(db)
    store.add(missedPuzzle, NOW)
    const position = store.next(day(1))
    if (!position) throw new Error('nothing due')
    store.record(position.id, 'clean', day(1))
    expect(store.get(position.id)?.box).toBe(1)
    store.record(position.id, 'missed', day(4))
    expect(store.get(position.id)).toMatchObject({ box: 0, dueAt: dayStart(day(4), 1) })

    store.record(position.id, 'clean', day(5))
    store.add(missedPuzzle, day(6))
    expect(store.get(position.id)).toMatchObject({ box: 0, dueAt: dayStart(day(6), 1) })
    expect(store.summary(day(6)).waiting).toBe(1)
  })
})

describe('WeaknessStore', () => {
  it('counts a pattern noted again, whatever its case, keeping what was not said again', () => {
    const store = new WeaknessStore(db)
    store.log({ pattern: 'Leaves pieces undefended', theme: 'hangingPiece', note: '14. Nf3' }, NOW)
    const again = store.log(
      { pattern: 'leaves pieces undefended ', theme: null, note: null },
      daysLater(2),
    )
    expect(again).toEqual<Weakness>({
      id: again.id,
      pattern: 'Leaves pieces undefended',
      theme: 'hangingPiece',
      note: '14. Nf3',
      seen: 2,
      firstSeen: NOW.toISOString(),
      lastSeen: daysLater(2).toISOString(),
    })
  })

  it('lists the patterns noted lately, the latest first, and forgets one when asked', () => {
    const store = new WeaknessStore(db)
    store.log({ pattern: 'Old habit', theme: null, note: null }, NOW)
    const missesForks = store.log(
      { pattern: 'Misses forks', theme: 'fork', note: null },
      daysLater(50),
    )
    store.log({ pattern: 'Rushes', theme: null, note: null }, daysLater(60))
    const recent = store.recent(daysLater(30), 10)
    expect(recent.map((w) => w.pattern)).toEqual(['Rushes', 'Misses forks'])
    store.forget(missesForks.id)
    expect(store.recent(NOW, 10).map((w) => w.pattern)).toEqual(['Rushes', 'Old habit'])
  })
})

describe('AttemptStore.firstTries', () => {
  it("counts each puzzle's first try once it ends, bar one left untried", () => {
    const attempts = new AttemptStore(db)
    const at = NOW.toISOString()
    const end = (id: number, result: 'solved' | 'revealed' | 'left', mistakes = 0) =>
      attempts.end(id, { result, mistakes, hints: 0, endedAt: at })
    end(attempts.begin({ id: 'a', rating: 1500, themes: ['fork', 'short'] }, at), 'solved')
    end(attempts.begin({ id: 'a', rating: 1500, themes: ['fork', 'short'] }, at), 'revealed')
    end(attempts.begin({ id: 'b', rating: 1600, themes: ['pin'] }, at), 'left', 1)
    end(attempts.begin({ id: 'c', rating: 1700, themes: ['pin'] }, at), 'left')
    attempts.begin({ id: 'd', rating: 1800, themes: [] }, at)
    expect(attempts.firstTries()).toEqual<FirstTry[]>([
      { rating: 1500, themes: ['fork', 'short'], outcome: 'clean' },
      { rating: 1600, themes: ['pin'], outcome: 'missed' },
    ])
  })
})

describe('puzzle statistics', () => {
  const tries = (count: number, rating: number, outcome: FirstTry['outcome'], themes = ['fork']) =>
    Array.from({ length: count }, (): FirstTry => ({ rating, themes, outcome }))

  it('gives a rating only after enough tries, rising with puzzles solved above it', () => {
    expect(puzzleRating(tries(RATED_AFTER - 1, 1500, 'clean'), 1250)).toBeNull()
    const rating = puzzleRating(tries(RATED_AFTER, 1500, 'clean'), 1250)
    expect(rating).toBeGreaterThan(1250)
    const missed = puzzleRating(tries(RATED_AFTER, 1500, 'missed'), 1250)
    expect(missed).toBeLessThan(1250)
  })

  it('settles near the rating of puzzles solved half the time', () => {
    const mixed = Array.from({ length: 200 }, (_, index): FirstTry => ({
      rating: 1600,
      themes: [],
      outcome: index % 2 === 0 ? 'clean' : 'missed',
    }))
    expect(Math.abs((puzzleRating(mixed, 1000) ?? 0) - 1600)).toBeLessThan(40)
  })

  it('records the skills tried often enough, the weakest first, leaving out lengths', () => {
    const records = themeRecords([
      ...tries(THEME_TRIES, 1500, 'clean', ['fork', 'short']),
      ...tries(THEME_TRIES, 1500, 'missed', ['pin']),
      ...tries(THEME_TRIES - 1, 1500, 'missed', ['skewer']),
      ...tries(THEME_TRIES, 1500, 'missed', ['notAnAppTheme']),
    ])
    expect(records).toEqual([
      { theme: 'pin', tries: THEME_TRIES, solved: 0 },
      { theme: 'fork', tries: THEME_TRIES, solved: THEME_TRIES },
    ])
  })

  it("aims at the coach's noted weaknesses first, then the themes solved least often", () => {
    const weakness = (pattern: string, theme: Weakness['theme'], seen: number): Weakness => ({
      id: seen,
      pattern,
      theme,
      note: null,
      seen,
      firstSeen: NOW.toISOString(),
      lastSeen: NOW.toISOString(),
    })
    const spots = weakSpots(
      [
        weakness('Rushes', null, 5),
        weakness('Misses pins', 'pin', 1),
        weakness('Forks', 'fork', 3),
      ],
      [
        { theme: 'skewer', tries: 10, solved: 2 },
        { theme: 'pin', tries: 10, solved: 3 },
        { theme: 'endgame', tries: 10, solved: 6 },
      ],
      0.6,
    )
    expect(spots).toEqual(['fork', 'pin', 'skewer'])
  })
})

describe('ProfileService', () => {
  function service() {
    const attempts = new AttemptStore(db)
    const practice = new PracticeStore(db)
    const profile = new ProfileService({
      attempts,
      games: new GameStore(db),
      reviews: new ReviewStore(db),
      weaknesses: new WeaknessStore(db),
      practice,
      level: () => 'club',
      now: () => NOW,
    })
    return { attempts, practice, profile }
  }

  it('starts empty, aiming puzzles by the level the player gave', () => {
    const { profile } = service()
    expect(profile.profile()).toEqual({
      puzzles: { rating: null, tries: 0, solved: 0, themes: [] },
      games: { won: 0, drawn: 0, lost: 0, unfinished: 0 },
      mistakes: {
        games: 0,
        byPhase: {
          opening: { moves: 0, inaccuracies: 0, mistakes: 0, blunders: 0 },
          middlegame: { moves: 0, inaccuracies: 0, mistakes: 0, blunders: 0 },
          endgame: { moves: 0, inaccuracies: 0, mistakes: 0, blunders: 0 },
        },
      },
      weaknesses: [],
      weakSpots: [],
      practice: { due: 0, waiting: 0, learned: 0, nextDue: null },
    })
    expect(profile.puzzleRatings()).toEqual(PUZZLE_RATINGS.club)
  })

  it('rates the player once they have tried enough puzzles, and aims puzzles around it', () => {
    const { attempts, profile } = service()
    const at = NOW.toISOString()
    for (let index = 0; index < RATED_AFTER; index++) {
      const id = attempts.begin({ id: `p${index}`, rating: 1650, themes: ['fork'] }, at)
      attempts.end(id, { result: 'solved', mistakes: 0, hints: 0, endedAt: at })
    }
    const { rating } = profile.profile().puzzles
    if (rating === null) throw new Error('no rating')
    expect(profile.puzzleRatings()).toEqual({ min: rating - 200, max: rating + 200 })
  })

  it('tells those showing it when a weakness is noted or forgotten', () => {
    const { profile } = service()
    const seen: string[][] = []
    profile.onChange((changed) => seen.push(changed.weaknesses.map((w) => w.pattern)))
    const weakness = profile.logWeakness({ pattern: 'Misses forks', theme: 'fork', note: null })
    expect(profile.weakSpots()).toEqual(['fork'])
    expect(profile.forgetWeakness(weakness.id).weaknesses).toEqual([])
    expect(seen).toEqual([['Misses forks'], []])
  })
})
