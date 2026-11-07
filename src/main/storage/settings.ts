// Settings kept in the app's database, one row per key, each value stored as JSON and checked
// against its schema when read. A value that no longer fits (from an older version, or edited
// by hand) is ignored and the default used.
import type { DatabaseSync } from 'node:sqlite'
import type { z } from 'zod'

export class SettingsStore {
  constructor(private readonly db: DatabaseSync) {}

  get<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined
    if (!row) return fallback
    try {
      const parsed = schema.safeParse(JSON.parse(row.value))
      return parsed.success ? parsed.data : fallback
    } catch {
      return fallback
    }
  }

  set<T>(key: string, value: T): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, JSON.stringify(value))
  }
}
