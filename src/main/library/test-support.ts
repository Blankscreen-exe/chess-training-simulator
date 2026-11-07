// Small stand-ins for the library's sources: rows from Lichess's puzzle file, a few openings, and
// a server that answers with them.
import { zstdCompressSync } from 'node:zlib'
import { LibraryStore, LibraryWriter } from './database'
import { LIBRARY_SOURCES, type Fetch } from './installer'
import { readOpenings } from './openings'
import { PuzzleReader } from './puzzles'

export const PUZZLE_HEADER =
  'PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate'

/** Rows as Lichess's file has them; the last is played too rarely to be kept. */
export const PUZZLE_ROWS = {
  /** White to find a rook move, after Black's bishop takes on g3. */
  rookWins:
    '00008,r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24,f2g3 e6e7 b2b1 b3c1 b1c1 h6c1,1819,77,95,10446,crushing hangingPiece long middlegame,https://lichess.org/game/787zsVup/black#48,,',
  /** Black to find a rook move, after White's queen goes to d6. */
  endgame:
    '0000D,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,d3d6 f8d8 d6d8 f6d8,1433,75,96,37700,advantage endgame short,https://lichess.org/game/F8M8OS71#53,,',
  /** Black mates in one with the queen; played only 92 times. */
  rarelyPlayed:
    '0000H,r4rk1/pp3ppp/8/2bqp2b/3N4/P2Bn2P/1PPN1P2/R1BQ1RK1 w - - 1 15,d1h5 d5g2,1032,78,100,92,mate mateIn1 middlegame oneMove,https://lichess.org/game/EwHRkfas#29,,',
} as const

export const OPENINGS_TSV = [
  'eco\tname\tpgn',
  'B20\tSicilian Defense\t1. e4 c5',
  'B90\tSicilian Defense: Najdorf Variation\t1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
  'C50\tItalian Game\t1. e4 e5 2. Nf3 Nc6 3. Bc4',
  'C00\tFrench Defense\t1. e4 e6',
  'A00\tNot An Opening\t1. e4 e4',
].join('\n')

/** A skippable frame, as pzstd puts before each frame of data. */
export function skippableFrame(payload: Buffer): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32LE(0x184d2a50, 0)
  header.writeUInt32LE(payload.length, 4)
  return Buffer.concat([header, payload])
}

/** A puzzle file as Lichess serves it: compressed in frames, each after a skippable one. */
export function puzzleFile(rows: readonly string[]): Buffer {
  const lines = [PUZZLE_HEADER, ...rows]
  const half = Math.ceil(lines.length / 2)
  const frames = [lines.slice(0, half), lines.slice(half)].map((part) =>
    zstdCompressSync(Buffer.from(part.map((line) => `${line}\n`).join(''))),
  )
  return Buffer.concat(
    frames.flatMap((frame) => {
      const size = Buffer.alloc(4)
      size.writeUInt32LE(frame.length)
      return [skippableFrame(size), frame]
    }),
  )
}

/**
 * A server holding the library's sources: the puzzle file and openings given, and an empty
 * openings volume for each of the others. Requests it was not given fail with 404.
 */
export function libraryServer(files: { puzzles: Buffer; openings?: string }): Fetch {
  const [first, ...rest] = LIBRARY_SOURCES.openings
  const bodies = new Map<string, Buffer | string>([
    [LIBRARY_SOURCES.puzzles, files.puzzles],
    ...(first ? [[first, files.openings ?? 'eco\tname\tpgn'] as const] : []),
    ...rest.map((url) => [url, 'eco\tname\tpgn'] as const),
  ])
  return (url, { signal }) => {
    signal.throwIfAborted()
    const body = bodies.get(url)
    return Promise.resolve(
      body === undefined
        ? new Response('Not found', { status: 404 })
        : new Response(body, { headers: { 'content-length': String(Buffer.byteLength(body)) } }),
    )
  }
}

/** The puzzles in rows of the puzzle file, as the library keeps them. */
export function puzzlesOf(rows: readonly string[]) {
  const reader = new PuzzleReader(PUZZLE_HEADER)
  return rows.map((row) => {
    const found = reader.read(row)
    if (!found) throw new Error(`Not a puzzle: ${row}`)
    return found.puzzle
  })
}

/** A library at `path` holding the rows given (by default all of PUZZLE_ROWS) and the openings. */
export function testLibrary(
  path: string,
  rows: readonly string[] = Object.values(PUZZLE_ROWS),
): LibraryStore {
  const writer = new LibraryWriter(path)
  writer.addPuzzles(puzzlesOf(rows))
  writer.addOpenings(readOpenings(OPENINGS_TSV))
  writer.finish('2026-11-08T12:00:00.000Z')
  const store = LibraryStore.open(path)
  if (!store) throw new Error('The test library could not be opened')
  return store
}
