// Positions the player missed, coming back for them to practise, spaced out over days: a Leitner
// system. Each position sits in a box. Solving it first time moves it up a box, to come back after
// longer; missing it sends it back to the first. Solved first time from the last box, it is learned.
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { PracticeRecord } from '@shared/profile'
import type { PracticeOrigin } from '@shared/training'
import type { TryOutcome } from '../puzzles/attempts'

/** How many days a position waits in each box before it comes back. */
export const BOX_DAYS: readonly number[] = [1, 3, 7, 16, 35]
/**
 * The hour, in the player's own time, a day's positions come back at: so one due tomorrow is
 * there all of tomorrow, and a late-night session still counts as the day it began.
 */
const DAY_STARTS_AT = 4

export interface PracticeSchedule {
  box: number
  dueAt: string
  learned: boolean
}

/** Where a position goes after a try: up a box when solved first time, else back to the first. */
export function reschedule(box: number, outcome: TryOutcome, now: Date): PracticeSchedule {
  if (outcome === 'missed')
    return { box: 0, dueAt: dayStart(now, BOX_DAYS[0] ?? 1), learned: false }
  const days = BOX_DAYS[box + 1]
  if (days === undefined) return { box, dueAt: now.toISOString(), learned: true }
  return { box: box + 1, dueAt: dayStart(now, days), learned: false }
}

/** When the player's day `days` days after `now`'s starts. */
export function dayStart(now: Date, days: number): string {
  const due = new Date(now)
  if (due.getHours() < DAY_STARTS_AT) due.setDate(due.getDate() - 1)
  due.setDate(due.getDate() + days)
  due.setHours(DAY_STARTS_AT, 0, 0, 0)
  return due.toISOString()
}

/** A position to practise, as a puzzle: the opponent's move that leads to it, then the answer. */
export interface NewPracticePosition {
  /** What it is, so the same position is not added twice: "puzzle:00008", "game:12:27". */
  key: string
  origin: PracticeOrigin
  /** The position before the opponent's move. */
  fen: string
  /** That move, then the answer, in UCI. */
  moves: string[]
  rating: number | null
  themes: string[]
}

export interface PracticePosition extends NewPracticePosition {
  id: number
  box: number
  dueAt: string
}

const PracticeRow = z
  .object({
    id: z.number().int(),
    key: z.string(),
    origin: z.enum(['puzzle', 'game']),
    game_id: z.number().int().nullable(),
    played: z.string().nullable(),
    fen: z.string(),
    moves: z.string(),
    rating: z.number().int().nullable(),
    themes: z.string(),
    box: z.number().int(),
    due_at: z.string(),
  })
  .transform((row, context): PracticePosition => {
    let origin: PracticeOrigin = { from: 'puzzle' }
    if (row.origin === 'game') {
      if (row.game_id === null || row.played === null) {
        context.addIssue({ code: 'custom', message: 'A position from a game names no game' })
        return z.NEVER
      }
      origin = { from: 'game', gameId: row.game_id, played: row.played }
    }
    return {
      id: row.id,
      key: row.key,
      origin,
      fen: row.fen,
      moves: row.moves.split(' '),
      rating: row.rating,
      themes: row.themes ? row.themes.split(' ') : [],
      box: row.box,
      dueAt: row.due_at,
    }
  })

const SummaryRow = z.object({
  due: z.number().nullable(),
  waiting: z.number().nullable(),
  learned: z.number().nullable(),
  next_due: z.string().nullable(),
})

export class PracticeStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Adds a position the player has just missed, due the next day; one already there starts over. */
  add(position: NewPracticePosition, now: Date): void {
    const { origin } = position
    this.db
      .prepare(
        `INSERT INTO practice (key, origin, game_id, played, fen, moves, rating, themes, added_at, due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET
           box = 0, due_at = excluded.due_at, learned_at = NULL, lapses = lapses + 1`,
      )
      .run(
        position.key,
        origin.from,
        origin.from === 'game' ? origin.gameId : null,
        origin.from === 'game' ? origin.played : null,
        position.fen,
        position.moves.join(' '),
        position.rating,
        position.themes.join(' '),
        now.toISOString(),
        reschedule(0, 'missed', now).dueAt,
      )
  }

  /** The position due longest ago, if any is due. */
  next(now: Date): PracticePosition | null {
    const row = this.db
      .prepare(
        `SELECT * FROM practice WHERE learned_at IS NULL AND due_at <= ?
         ORDER BY due_at, id LIMIT 1`,
      )
      .get(now.toISOString())
    return row ? PracticeRow.parse(row) : null
  }

  get(id: number): PracticePosition | null {
    const row = this.db.prepare('SELECT * FROM practice WHERE id = ?').get(id)
    return row ? PracticeRow.parse(row) : null
  }

  /** Notes a try at a position, and when it comes back. */
  record(id: number, outcome: TryOutcome, now: Date): void {
    const position = this.get(id)
    if (!position) return
    const next = reschedule(position.box, outcome, now)
    this.db
      .prepare(
        `UPDATE practice SET box = ?, due_at = ?, learned_at = ?, reviews = reviews + 1,
           lapses = lapses + ? WHERE id = ?`,
      )
      .run(
        next.box,
        next.dueAt,
        next.learned ? now.toISOString() : null,
        outcome === 'missed' ? 1 : 0,
        id,
      )
  }

  summary(now: Date): PracticeRecord {
    const at = now.toISOString()
    const row = SummaryRow.parse(
      this.db
        .prepare(
          `SELECT
             SUM(learned_at IS NULL AND due_at <= ?) AS due,
             SUM(learned_at IS NULL AND due_at > ?) AS waiting,
             SUM(learned_at IS NOT NULL) AS learned,
             MIN(CASE WHEN learned_at IS NULL AND due_at > ? THEN due_at END) AS next_due
           FROM practice`,
        )
        .get(at, at, at),
    )
    return {
      due: row.due ?? 0,
      waiting: row.waiting ?? 0,
      learned: row.learned ?? 0,
      nextDue: row.next_due,
    }
  }
}
