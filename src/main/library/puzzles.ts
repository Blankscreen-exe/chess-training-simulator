// Reading Lichess's puzzle file (https://database.lichess.org/#puzzles, CC0) and choosing which
// puzzles to keep. Its columns are found by name, so one added later does not break reading it.
import type { PuzzlePiece } from '@shared/training'
import { pieceLetterAt, splitFen, UCI_MOVE_PATTERN, uciSquares } from '@shared/notation'

/** A puzzle as the library keeps it. */
export interface LibraryPuzzle {
  id: string
  /** The position before the opponent's move that sets the puzzle. */
  fen: string
  /** That move, then the answer, in UCI: the player's moves and the opponent's replies in turn. */
  moves: string[]
  rating: number
  themes: string[]
  /** The piece that makes the player's first move. */
  piece: PuzzlePiece
  popularity: number
  plays: number
}

/** The columns read, by their names in the file's header. */
const COLUMNS = {
  id: 'PuzzleId',
  fen: 'FEN',
  moves: 'Moves',
  rating: 'Rating',
  deviation: 'RatingDeviation',
  popularity: 'Popularity',
  plays: 'NbPlays',
  themes: 'Themes',
} as const

type Column = keyof typeof COLUMNS

const PIECES: Record<string, PuzzlePiece> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

/** Reads the file's rows, once given its header. */
export class PuzzleReader {
  private readonly index: Record<Column, number>

  /** Throws if the header lacks a column the app needs, as when Lichess changes the file. */
  constructor(header: string) {
    const names = header.trim().split(',')
    const index = {} as Record<Column, number>
    for (const [column, name] of Object.entries(COLUMNS) as [Column, string][]) {
      const at = names.indexOf(name)
      if (at < 0) throw new Error(`The puzzle file has no ${name} column`)
      index[column] = at
    }
    this.index = index
  }

  /** A row as a puzzle with its rating's reliability; null if the row is not a sound puzzle. */
  read(line: string): { puzzle: LibraryPuzzle; deviation: number } | null {
    const fields = line.split(',')
    const field = (column: Column) => fields[this.index[column]] ?? ''
    const moves = field('moves').split(' ')
    const rating = Number(field('rating'))
    const deviation = Number(field('deviation'))
    const popularity = Number(field('popularity'))
    const plays = Number(field('plays'))
    const playerMove = moves[1]
    const fen = field('fen')
    if (
      !playerMove ||
      !moves.every((move) => UCI_MOVE_PATTERN.test(move)) ||
      ![rating, deviation, popularity, plays].every(Number.isFinite) ||
      fen.split(' ').length !== 6
    )
      return null
    const letter = pieceLetterAt(splitFen(fen).placement, uciSquares(playerMove)[0])
    const piece = letter ? PIECES[letter.toLowerCase()] : undefined
    if (!piece) return null
    return {
      puzzle: {
        id: field('id'),
        fen,
        moves,
        rating,
        themes: field('themes').split(' ').filter(Boolean),
        piece,
        popularity,
        plays,
      },
      deviation,
    }
  }
}

/**
 * Which puzzles are worth keeping: liked by those who played them, played often enough for that
 * to mean something, and with a settled rating.
 */
export const PUZZLE_QUALITY = { minPopularity: 90, minPlays: 500, maxDeviation: 90 } as const

/**
 * The most puzzles kept in each band of ratings. The file's puzzles are in no particular order,
 * so the first ones of each band are a fair sample of it; capping each band keeps the library
 * small while leaving as many puzzles for a beginner as for a master.
 */
export const PUZZLES_PER_BAND = 10_000
export const RATING_BAND = 100

/** Chooses the puzzles to keep, as the file is read from start to end. */
export class PuzzleSampler {
  private readonly bands = new Map<number, number>()

  constructor(private readonly perBand = PUZZLES_PER_BAND) {}

  keep(puzzle: LibraryPuzzle, deviation: number): boolean {
    if (
      puzzle.popularity < PUZZLE_QUALITY.minPopularity ||
      puzzle.plays < PUZZLE_QUALITY.minPlays ||
      deviation > PUZZLE_QUALITY.maxDeviation
    )
      return false
    const band = Math.floor(puzzle.rating / RATING_BAND)
    const kept = this.bands.get(band) ?? 0
    if (kept >= this.perBand) return false
    this.bands.set(band, kept + 1)
    return true
  }
}
