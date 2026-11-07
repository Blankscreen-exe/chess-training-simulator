// The app's SQLite database, through Node's own driver, so the app needs no native modules. Every
// store shares one database; opening it brings it up to date.
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'

/**
 * Each step brings the database from the version before it to its own. Once released, a step is
 * never edited: changes are new steps.
 *
 * Lists the app may extend (statuses, results, terminations, engine levels, opponents) are
 * checked as rows are read, not by CHECK constraints, as SQLite cannot change a constraint
 * without rebuilding the table.
 */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE games (
     id            INTEGER PRIMARY KEY,
     started_at    TEXT    NOT NULL,
     ended_at      TEXT,
     player_color  TEXT    NOT NULL CHECK (player_color IN ('white', 'black')),
     engine_level  INTEGER NOT NULL,
     initial_fen   TEXT    NOT NULL,
     moves         TEXT    NOT NULL DEFAULT '',
     status        TEXT    NOT NULL,
     result        TEXT    NOT NULL DEFAULT '*',
     termination   TEXT
   );
   CREATE INDEX games_by_status ON games (status, id);`,

  `ALTER TABLE games ADD COLUMN opponent TEXT NOT NULL DEFAULT 'engine';
   CREATE TABLE settings (
     key    TEXT PRIMARY KEY,
     value  TEXT NOT NULL
   );`,
]

/** Opens the database at `path`, or in memory for ':memory:', and brings it up to date. */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  migrate(db)
  return db
}

function migrate(db: DatabaseSync): void {
  const { user_version: version } = z
    .object({ user_version: z.number() })
    .parse(db.prepare('PRAGMA user_version').get())
  for (const [index, step] of MIGRATIONS.entries()) {
    if (index < version) continue
    db.exec('BEGIN')
    try {
      db.exec(step)
      db.exec(`PRAGMA user_version = ${index + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}
