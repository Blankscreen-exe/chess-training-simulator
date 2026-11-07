// The player's tries at puzzles, kept in their database: so the same puzzle is not offered again
// soon, and, later, to see what they find hard.
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { PuzzleResult } from '@shared/training'
import type { LibraryPuzzle } from '../library/puzzles'

export interface AttemptEnd {
  result: PuzzleResult
  mistakes: number
  hints: number
  endedAt: string
}

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

  /** The puzzles of the latest `limit` tries. */
  recentPuzzles(limit: number): Set<string> {
    const rows = this.db
      .prepare('SELECT puzzle_id FROM puzzle_attempts ORDER BY id DESC LIMIT ?')
      .all(limit)
    return new Set(rows.map((row) => z.object({ puzzle_id: z.string() }).parse(row).puzzle_id))
  }
}
