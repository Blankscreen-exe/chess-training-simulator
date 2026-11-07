// Games, kept in SQLite through Node's own driver, so the app needs no native modules.
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { GameSummary } from '@shared/chess'
import { COLORS, GAME_RESULTS, GAME_STATUSES, TERMINATIONS } from '@shared/chess'
import { ENGINE_LEVEL_IDS } from '@shared/engine-levels'
import { summaryOf, type StoredGame } from './game'

/**
 * Each step brings the database from the version before it to its own. Once released, a step is
 * never edited: changes are new steps.
 *
 * Statuses, results, terminations and engine levels are lists the app may extend, and SQLite
 * cannot change a CHECK constraint without rebuilding the table, so those are checked as rows
 * are read (GameRow below) rather than by the database.
 */
const MIGRATIONS: readonly string[] = [
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
]

/** A row of the games table, checked, as a stored game. */
const GameRow = z
  .object({
    id: z.number().int(),
    started_at: z.string(),
    ended_at: z.string().nullable(),
    player_color: z.enum(COLORS),
    engine_level: z.literal(ENGINE_LEVEL_IDS),
    initial_fen: z.string(),
    moves: z.string(),
    status: z.enum(GAME_STATUSES),
    result: z.enum(GAME_RESULTS),
    termination: z.enum(TERMINATIONS).nullable(),
  })
  .transform((row): StoredGame => ({
    id: row.id,
    playerColor: row.player_color,
    engineLevel: row.engine_level,
    initialFen: row.initial_fen,
    startedAt: row.started_at,
    ...(row.ended_at !== null ? { endedAt: row.ended_at } : {}),
    moves: row.moves ? row.moves.split(' ') : [],
    status: row.status,
    result: row.result,
    ...(row.termination !== null ? { termination: row.termination } : {}),
  }))

/** What is needed to start storing a game. */
export type NewStoredGame = Pick<
  StoredGame,
  'playerColor' | 'engineLevel' | 'initialFen' | 'startedAt'
>

export class GameStore {
  private readonly db: DatabaseSync

  /** Opens the database at `path`, or in memory for ':memory:', bringing it up to date. */
  constructor(path: string) {
    this.db = new DatabaseSync(path)
    if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL')
    this.migrate()
  }

  close(): void {
    this.db.close()
  }

  create(game: NewStoredGame): StoredGame {
    const row = this.db
      .prepare(
        `INSERT INTO games (started_at, player_color, engine_level, initial_fen, status)
         VALUES (?, ?, ?, ?, 'in_progress') RETURNING *`,
      )
      .get(game.startedAt, game.playerColor, game.engineLevel, game.initialFen)
    return this.read(row)
  }

  save(game: StoredGame): void {
    this.db
      .prepare(
        `UPDATE games SET moves = ?, status = ?, result = ?, termination = ?, ended_at = ?
         WHERE id = ?`,
      )
      .run(
        game.moves.join(' '),
        game.status,
        game.result,
        game.termination ?? null,
        game.endedAt ?? null,
        game.id,
      )
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM games WHERE id = ?').run(id)
  }

  get(id: number): StoredGame | undefined {
    const row = this.db.prepare('SELECT * FROM games WHERE id = ?').get(id)
    return row && this.read(row)
  }

  /** The most recent game still under way, to carry on with. */
  latestInProgress(): StoredGame | undefined {
    const row = this.db
      .prepare(`SELECT * FROM games WHERE status = 'in_progress' ORDER BY id DESC LIMIT 1`)
      .get()
    return row && this.read(row)
  }

  /** Games, newest first. */
  list(limit = 100): GameSummary[] {
    return this.db
      .prepare('SELECT * FROM games ORDER BY id DESC LIMIT ?')
      .all(limit)
      .map((row) => summaryOf(this.read(row)))
  }

  /** Checks a row; one that does not fit means the database was changed by something else. */
  private read(row: unknown): StoredGame {
    const parsed = GameRow.safeParse(row)
    if (!parsed.success) {
      throw new Error(`A stored game is not in the expected form: ${z.prettifyError(parsed.error)}`)
    }
    return parsed.data
  }

  private migrate(): void {
    const { user_version: version } = z
      .object({ user_version: z.number() })
      .parse(this.db.prepare('PRAGMA user_version').get())
    for (const [index, step] of MIGRATIONS.entries()) {
      if (index < version) continue
      this.db.exec('BEGIN')
      try {
        this.db.exec(step)
        this.db.exec(`PRAGMA user_version = ${index + 1}`)
        this.db.exec('COMMIT')
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      }
    }
  }
}
