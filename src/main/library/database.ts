// The library: puzzles and openings, in a database of their own beside the player's. It is
// built whole by an install and never changed after, so it has no migrations: a library made
// for another version of its layout is ignored, and the player asked to install it again.
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { z } from 'zod'
import { PUZZLE_PIECES, type LibraryContents, type Opening } from '@shared/training'
import type { LibraryOpening } from './openings'
import type { LibraryPuzzle } from './puzzles'

/** The layout's version; a change to the tables below needs a new one. */
export const LIBRARY_LAYOUT = 1

const TABLES = `
  CREATE TABLE puzzles (
    id          TEXT    PRIMARY KEY,
    fen         TEXT    NOT NULL,
    moves       TEXT    NOT NULL,
    rating      INTEGER NOT NULL,
    -- Space-separated, with a space at each end, so that a whole theme is matched by ' fork '.
    themes      TEXT    NOT NULL,
    piece       TEXT    NOT NULL,
    popularity  INTEGER NOT NULL,
    plays       INTEGER NOT NULL
  );
  CREATE TABLE openings (
    eco       TEXT NOT NULL,
    name      TEXT NOT NULL,
    moves     TEXT NOT NULL,
    position  TEXT NOT NULL
  );
  CREATE TABLE about (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );`

/** Made once the rows are in, as building an index at the end is far quicker than keeping one up. */
const INDEXES = `
  CREATE INDEX puzzles_by_rating ON puzzles (rating);
  CREATE INDEX openings_by_position ON openings (position);
  CREATE INDEX openings_by_moves ON openings (moves);`

/** Builds a library in a new file. Nothing in it is meant to last until `finish` has run. */
export class LibraryWriter {
  private readonly db: DatabaseSync
  private readonly addPuzzle: StatementSync
  private readonly addOpening: StatementSync
  private puzzles = 0
  private openings = 0

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    // An install that fails is thrown away, so the database need not survive a crash.
    this.db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;')
    this.db.exec(TABLES)
    this.addPuzzle = this.db.prepare(
      'INSERT OR IGNORE INTO puzzles (id, fen, moves, rating, themes, piece, popularity, plays) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    this.addOpening = this.db.prepare(
      'INSERT INTO openings (eco, name, moves, position) VALUES (?, ?, ?, ?)',
    )
  }

  get puzzleCount(): number {
    return this.puzzles
  }

  addPuzzles(puzzles: readonly LibraryPuzzle[]): void {
    this.inTransaction(() => {
      for (const p of puzzles) {
        const { changes } = this.addPuzzle.run(
          p.id,
          p.fen,
          p.moves.join(' '),
          p.rating,
          ` ${p.themes.join(' ')} `,
          p.piece,
          p.popularity,
          p.plays,
        )
        this.puzzles += Number(changes)
      }
    })
  }

  addOpenings(openings: readonly LibraryOpening[]): void {
    this.inTransaction(() => {
      for (const o of openings) this.addOpening.run(o.eco, o.name, o.moves.join(' '), o.position)
      this.openings += openings.length
    })
  }

  /** Indexes the library, notes what it holds, and closes it. */
  finish(installedAt: string): LibraryContents {
    const contents: LibraryContents = {
      puzzles: this.puzzles,
      openings: this.openings,
      installedAt,
    }
    this.db.exec(INDEXES)
    const note = this.db.prepare('INSERT INTO about (key, value) VALUES (?, ?)')
    note.run('contents', JSON.stringify(contents))
    this.db.exec(`PRAGMA user_version = ${LIBRARY_LAYOUT}`)
    this.db.close()
    return contents
  }

  /** Closes the file without finishing it, so it can be deleted. */
  abandon(): void {
    if (this.db.isOpen) this.db.close()
  }

  private inTransaction(work: () => void): void {
    this.db.exec('BEGIN')
    try {
      work()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}

const ContentsSchema = z.object({
  puzzles: z.number(),
  openings: z.number(),
  installedAt: z.string(),
})

const PuzzleRow = z.object({
  id: z.string(),
  fen: z.string(),
  moves: z.string(),
  rating: z.number(),
  themes: z.string(),
  piece: z.enum(PUZZLE_PIECES),
  popularity: z.number(),
  plays: z.number(),
})

const OpeningRow = z.object({ eco: z.string(), name: z.string(), moves: z.string() })

export interface PuzzleQuery {
  rating: { min: number; max: number }
  /** A Lichess theme, matched whole. */
  theme?: string
  piece?: LibraryPuzzle['piece']
  /** How many to return, at most, chosen at random. */
  count: number
}

export interface OpeningQuery {
  /** Part of the name, in any case: "sicilian", "Queen's Gambit Declined". */
  name?: string
  /** An ECO code, or the start of one: "B90", "B9". */
  eco?: string
  /** The first moves, in standard notation, for the openings that begin with them. */
  moves?: string[]
}

/** An installed library, opened to read. */
export class LibraryStore {
  private constructor(
    private readonly db: DatabaseSync,
    readonly contents: LibraryContents,
  ) {}

  /** The library at `path`; null if there is none, or it was made for another layout. */
  static open(path: string): LibraryStore | null {
    let db: DatabaseSync | null = null
    try {
      db = new DatabaseSync(path, { readOnly: true })
      const { user_version: layout } = z
        .object({ user_version: z.number() })
        .parse(db.prepare('PRAGMA user_version').get())
      const row = z
        .object({ value: z.string() })
        .safeParse(db.prepare("SELECT value FROM about WHERE key = 'contents'").get())
      const contents = row.success ? ContentsSchema.safeParse(JSON.parse(row.data.value)) : null
      if (layout === LIBRARY_LAYOUT && contents?.success) return new LibraryStore(db, contents.data)
    } catch {
      // Missing, or not a library this version can read.
    }
    db?.close()
    return null
  }

  findPuzzles(query: PuzzleQuery): LibraryPuzzle[] {
    const rows = this.db
      .prepare(
        `SELECT id, fen, moves, rating, themes, piece, popularity, plays FROM puzzles
         WHERE rating BETWEEN :min AND :max
           AND (:piece IS NULL OR piece = :piece)
           AND (:theme IS NULL OR instr(themes, :theme) > 0)
         ORDER BY random() LIMIT :count`,
      )
      .all({
        min: query.rating.min,
        max: query.rating.max,
        piece: query.piece ?? null,
        theme: query.theme ? ` ${query.theme} ` : null,
        count: query.count,
      })
    return rows.map(readPuzzle)
  }

  puzzle(id: string): LibraryPuzzle | null {
    const row = this.db
      .prepare(
        'SELECT id, fen, moves, rating, themes, piece, popularity, plays FROM puzzles WHERE id = ?',
      )
      .get(id)
    return row ? readPuzzle(row) : null
  }

  /** Openings that fit every part of the query, fewest moves first. */
  findOpenings(query: OpeningQuery, limit: number): Opening[] {
    const line = query.moves?.join(' ')
    const rows = this.db
      .prepare(
        `SELECT eco, name, moves FROM openings
         WHERE (:name IS NULL OR name LIKE :name ESCAPE '\\')
           AND (:eco IS NULL OR eco LIKE :eco ESCAPE '\\')
           AND (:line IS NULL OR moves = :line OR moves LIKE :continued ESCAPE '\\')
         ORDER BY length(moves), name LIMIT :limit`,
      )
      .all({
        name: query.name ? `%${escapeLike(query.name)}%` : null,
        eco: query.eco ? `${escapeLike(query.eco.toUpperCase())}%` : null,
        line: line ?? null,
        continued: line ? `${escapeLike(line)} %` : null,
        limit,
      })
    return rows.map(readOpening)
  }

  /**
   * The opening a game is in: the named one for the latest of its positions that has a name.
   * `positions` are the game's, from its start, as `positionKey` gives them.
   */
  openingOf(positions: readonly string[]): Opening | null {
    if (positions.length === 0) return null
    const rows = this.db
      .prepare(
        `SELECT eco, name, moves, position FROM openings
         WHERE position IN (${positions.map(() => '?').join(', ')})
         ORDER BY length(moves)`,
      )
      .all(...positions)
    let found: { opening: Opening; depth: number } | null = null
    for (const row of rows) {
      const depth = positions.lastIndexOf(z.object({ position: z.string() }).parse(row).position)
      if (!found || depth > found.depth) found = { opening: readOpening(row), depth }
    }
    return found?.opening ?? null
  }

  close(): void {
    this.db.close()
  }
}

function readPuzzle(row: unknown): LibraryPuzzle {
  const r = PuzzleRow.parse(row)
  return { ...r, moves: r.moves.split(' '), themes: r.themes.trim().split(' ').filter(Boolean) }
}

function readOpening(row: unknown): Opening {
  const r = OpeningRow.parse(row)
  return { eco: r.eco, name: r.name, moves: r.moves.split(' ') }
}

/** Text to match literally in a LIKE pattern. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`)
}
