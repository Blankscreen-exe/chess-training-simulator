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

  `CREATE TABLE puzzle_attempts (
     id          INTEGER PRIMARY KEY,
     puzzle_id   TEXT    NOT NULL,
     rating      INTEGER NOT NULL,
     themes      TEXT    NOT NULL,
     started_at  TEXT    NOT NULL,
     ended_at    TEXT,
     result      TEXT,
     mistakes    INTEGER NOT NULL DEFAULT 0,
     hints       INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX puzzle_attempts_by_start ON puzzle_attempts (started_at);`,

  // The engine's review of each game, move by move; the positions the player missed, coming back
  // for practice; and the patterns in their mistakes the coach has noted.
  `CREATE INDEX puzzle_attempts_by_puzzle ON puzzle_attempts (puzzle_id, id);
   CREATE TABLE game_reviews (
     game_id      INTEGER PRIMARY KEY,
     reviewed_at  TEXT    NOT NULL
   );
   CREATE TABLE move_reviews (
     game_id          INTEGER NOT NULL,
     ply              INTEGER NOT NULL,
     by_player        INTEGER NOT NULL,
     phase            TEXT    NOT NULL,
     quality          TEXT    NOT NULL,
     chances_lost     INTEGER NOT NULL,
     centipawns_lost  INTEGER NOT NULL,
     best_move        TEXT    NOT NULL,
     PRIMARY KEY (game_id, ply)
   ) WITHOUT ROWID;
   CREATE TABLE practice (
     id          INTEGER PRIMARY KEY,
     key         TEXT    NOT NULL UNIQUE,
     origin      TEXT    NOT NULL,
     game_id     INTEGER,
     played      TEXT,
     fen         TEXT    NOT NULL,
     moves       TEXT    NOT NULL,
     rating      INTEGER,
     themes      TEXT    NOT NULL,
     added_at    TEXT    NOT NULL,
     due_at      TEXT    NOT NULL,
     box         INTEGER NOT NULL DEFAULT 0,
     reviews     INTEGER NOT NULL DEFAULT 0,
     lapses      INTEGER NOT NULL DEFAULT 0,
     learned_at  TEXT
   );
   CREATE INDEX practice_by_due ON practice (learned_at, due_at);
   CREATE TABLE weaknesses (
     id          INTEGER PRIMARY KEY,
     pattern     TEXT    NOT NULL,
     theme       TEXT,
     note        TEXT,
     seen        INTEGER NOT NULL DEFAULT 1,
     first_seen  TEXT    NOT NULL,
     last_seen   TEXT    NOT NULL
   );
   CREATE UNIQUE INDEX weaknesses_by_pattern ON weaknesses (pattern COLLATE NOCASE);`,
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
    inTransaction(db, () => {
      db.exec(step)
      db.exec(`PRAGMA user_version = ${index + 1}`)
    })
  }
}

/** Runs `work` in a transaction: all of it is kept, or, if it throws, none. */
export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
