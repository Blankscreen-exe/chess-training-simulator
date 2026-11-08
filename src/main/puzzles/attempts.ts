// The player's tries at puzzles from the library, kept in their database: so the same puzzle is
// not offered again soon, and to see how they do, overall and by theme.
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { PUZZLE_RESULTS, type PuzzleResult } from '@shared/training'
import type { LibraryPuzzle } from '../library/puzzles'

export interface AttemptEnd {
  result: PuzzleResult
  mistakes: number
  hints: number
  endedAt: string
}

/**
 * How a try went: `clean` when solved first time, with no wrong move and no hint, and `missed`
 * when the player went wrong, asked for help or was shown the answer.
 */
export type TryOutcome = 'clean' | 'missed'

/** How a try went; null for one left before the player tried anything, which says nothing. */
export function outcomeOf(
  end: Pick<AttemptEnd, 'result' | 'mistakes' | 'hints'>,
): TryOutcome | null {
  const helped = end.mistakes > 0 || end.hints > 0
  if (end.result === 'solved' && !helped) return 'clean'
  if (end.result === 'left' && !helped) return null
  return 'missed'
}

/** A first try at a puzzle, and how it went. */
export interface FirstTry {
  rating: number
  themes: string[]
  outcome: TryOutcome
}

const FirstTryRow = z.object({
  rating: z.number().int(),
  themes: z.string(),
  result: z.enum(PUZZLE_RESULTS),
  mistakes: z.number().int(),
  hints: z.number().int(),
})

export class AttemptStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Notes a try starting; returns its id, to end it with. */
  begin(puzzle: Pick<LibraryPuzzle, 'id' | 'rating' | 'themes'>, startedAt: string): number {
    const { lastInsertRowid } = this.db
      .prepare(
        'INSERT INTO puzzle_attempts (puzzle_id, rating, themes, started_at) VALUES (?, ?, ?, ?)',
      )
      .run(puzzle.id, puzzle.rating, puzzle.themes.join(' '), startedAt)
    return Number(lastInsertRowid)
  }

  end(id: number, end: AttemptEnd): void {
    this.db
      .prepare(
        'UPDATE puzzle_attempts SET result = ?, mistakes = ?, hints = ?, ended_at = ? WHERE id = ?',
      )
      .run(end.result, end.mistakes, end.hints, end.endedAt, id)
  }

  /**
   * The first try at each puzzle, oldest first, bar those left untried. Only first tries count:
   * a puzzle seen before is easier.
   */
  firstTries(): FirstTry[] {
    const rows = this.db
      .prepare(
        `SELECT rating, themes, result, mistakes, hints FROM puzzle_attempts AS try
         WHERE result IS NOT NULL
           AND id = (SELECT MIN(id) FROM puzzle_attempts WHERE puzzle_id = try.puzzle_id)
         ORDER BY id`,
      )
      .all()
    return rows.flatMap((row) => {
      const parsed = FirstTryRow.parse(row)
      const outcome = outcomeOf(parsed)
      if (!outcome) return []
      const themes = parsed.themes ? parsed.themes.split(' ') : []
      return [{ rating: parsed.rating, themes, outcome }]
    })
  }

  /** The puzzles of the latest `limit` tries. */
  recentPuzzles(limit: number): Set<string> {
    const rows = this.db
      .prepare('SELECT puzzle_id FROM puzzle_attempts ORDER BY id DESC LIMIT ?')
      .all(limit)
    return new Set(rows.map((row) => z.object({ puzzle_id: z.string() }).parse(row).puzzle_id))
  }
}
