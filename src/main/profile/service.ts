// The player's profile, put together from everything the app keeps about them: their tries at
// puzzles, their games and the engine's reviews of them, the weaknesses the coach has noted, and
// the positions they are practising. It is worked out afresh when asked for, so it is never out
// of date, and those who show it are told when something it counts changes.
import type { PlayerLevel } from '@shared/coach'
import type { PlayerProfile, PuzzleRecord, Weakness } from '@shared/profile'
import { PUZZLE_RATINGS, type PuzzleTheme } from '@shared/training'
import type { GameStore } from '../games/store'
import type { AttemptStore } from '../puzzles/attempts'
import type { ReviewStore } from '../reviews/store'
import { Listeners } from '../util/listeners'
import type { PracticeStore } from './practice'
import { puzzleRating, themeRecords, weakSpots } from './stats'
import type { WeaknessNote, WeaknessStore } from './weaknesses'

/** How long a weakness counts for once last noted, in days. */
const WEAKNESS_DAYS = 90
const MAX_WEAKNESSES = 8
/** How many of the latest reviewed games mistakes are counted over. */
const MISTAKE_GAMES = 20
/** How far either side of the player's puzzle rating the puzzles they are given are rated. */
const RATING_SPREAD = 200

const DAY_MS = 24 * 60 * 60 * 1000

export interface ProfileServiceOptions {
  attempts: Pick<AttemptStore, 'firstTries'>
  games: Pick<GameStore, 'tally'>
  reviews: Pick<ReviewStore, 'mistakes'>
  weaknesses: WeaknessStore
  practice: Pick<PracticeStore, 'summary'>
  /** The level the player says they are at, where a rating starts from. */
  level: () => PlayerLevel
  now?: () => Date
}

export class ProfileService {
  private readonly listeners = new Listeners<PlayerProfile>()
  private readonly now: () => Date

  constructor(private readonly options: ProfileServiceOptions) {
    this.now = options.now ?? (() => new Date())
  }

  onChange(listener: (profile: PlayerProfile) => void): () => void {
    return this.listeners.add(listener)
  }

  /** Tells everyone showing the profile that something it counts has changed; returns it. */
  changed(): PlayerProfile {
    const profile = this.profile()
    this.listeners.emit(profile)
    return profile
  }

  profile(): PlayerProfile {
    const puzzles = this.puzzleRecord()
    const weaknesses = this.weaknesses()
    return {
      puzzles,
      games: this.options.games.tally(),
      mistakes: this.options.reviews.mistakes(MISTAKE_GAMES),
      weaknesses,
      weakSpots: this.weakSpotsOf(puzzles, weaknesses),
      practice: this.options.practice.summary(this.now()),
    }
  }

  /** The themes to aim puzzles at, the most pressing first. */
  weakSpots(): PuzzleTheme[] {
    return this.weakSpotsOf(this.puzzleRecord(), this.weaknesses())
  }

  /** The puzzle ratings that suit the player: around their rating once there is one, else by level. */
  puzzleRatings(): { min: number; max: number } {
    const { rating } = this.puzzleRecord()
    if (rating === null) return PUZZLE_RATINGS[this.options.level()]
    return { min: rating - RATING_SPREAD, max: rating + RATING_SPREAD }
  }

  logWeakness(note: WeaknessNote): Weakness {
    const weakness = this.options.weaknesses.log(note, this.now())
    this.changed()
    return weakness
  }

  forgetWeakness(id: number): PlayerProfile {
    this.options.weaknesses.forget(id)
    return this.changed()
  }

  private puzzleRecord(): PuzzleRecord {
    const tries = this.options.attempts.firstTries()
    const levelRange = PUZZLE_RATINGS[this.options.level()]
    return {
      rating: puzzleRating(tries, (levelRange.min + levelRange.max) / 2),
      tries: tries.length,
      solved: tries.filter((attempt) => attempt.outcome === 'clean').length,
      themes: themeRecords(tries),
    }
  }

  private weaknesses(): Weakness[] {
    const since = new Date(this.now().getTime() - WEAKNESS_DAYS * DAY_MS)
    return this.options.weaknesses.recent(since, MAX_WEAKNESSES)
  }

  private weakSpotsOf(puzzles: PuzzleRecord, weaknesses: readonly Weakness[]): PuzzleTheme[] {
    const overall = puzzles.tries > 0 ? puzzles.solved / puzzles.tries : 0
    return weakSpots(weaknesses, puzzles.themes, overall)
  }
}
