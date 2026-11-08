// The patterns in the player's mistakes the coach has noted ("leaves pieces undefended"), with how
// often, and the puzzle theme that trains each one. A pattern noted again, under the same name in
// any case, is counted again rather than added twice.
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { Weakness } from '@shared/profile'
import { isPuzzleTheme, type PuzzleTheme } from '@shared/training'

export interface WeaknessNote {
  pattern: string
  theme: PuzzleTheme | null
  note: string | null
}

const WeaknessRow = z
  .object({
    id: z.number().int(),
    pattern: z.string(),
    theme: z.string().nullable(),
    note: z.string().nullable(),
    seen: z.number().int(),
    first_seen: z.string(),
    last_seen: z.string(),
  })
  .transform((row): Weakness => ({
    id: row.id,
    pattern: row.pattern,
    // A theme the app no longer offers is kept, but not used.
    theme: row.theme !== null && isPuzzleTheme(row.theme) ? row.theme : null,
    note: row.note,
    seen: row.seen,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  }))

export class WeaknessStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Notes a pattern, new or seen again; a theme or note left out keeps the one noted before. */
  log(note: WeaknessNote, now: Date): Weakness {
    const at = now.toISOString()
    const row = this.db
      .prepare(
        `INSERT INTO weaknesses (pattern, theme, note, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (pattern COLLATE NOCASE) DO UPDATE SET
           seen = seen + 1,
           last_seen = excluded.last_seen,
           theme = COALESCE(excluded.theme, theme),
           note = COALESCE(excluded.note, note)
         RETURNING *`,
      )
      .get(note.pattern.trim(), note.theme, note.note, at, at)
    return WeaknessRow.parse(row)
  }

  /** The patterns noted since `since`, the latest first. */
  recent(since: Date, limit: number): Weakness[] {
    return this.db
      .prepare(
        'SELECT * FROM weaknesses WHERE last_seen >= ? ORDER BY last_seen DESC, id DESC LIMIT ?',
      )
      .all(since.toISOString(), limit)
      .map((row) => WeaknessRow.parse(row))
  }

  /** Forgets a pattern, as when the player says they have it in hand. */
  forget(id: number): void {
    this.db.prepare('DELETE FROM weaknesses WHERE id = ?').run(id)
  }
}
