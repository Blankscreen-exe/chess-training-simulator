import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import type { InstallProgress } from '@shared/training'
import { LibraryStore } from './database'
import { buildLibrary, lineBatches } from './installer'
import { positionKey, readOpenings } from './openings'
import { PuzzleReader, PuzzleSampler } from './puzzles'
import { LibraryService } from './service'
import {
  libraryServer,
  OPENINGS_TSV,
  PUZZLE_HEADER,
  PUZZLE_ROWS,
  puzzleFile,
  testLibrary,
} from './test-support'

let folder: string
/** Closed after each test, as Windows cannot delete a database that is open. */
const opened: LibraryStore[] = []
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'library-'))
})
afterEach(() => {
  for (const store of opened.splice(0)) store.close()
  rmSync(folder, { recursive: true, force: true })
})

describe('PuzzleReader', () => {
  const reader = new PuzzleReader(PUZZLE_HEADER)

  it('reads a row, with the piece that makes the first winning move', () => {
    expect(reader.read(PUZZLE_ROWS.rookWins)).toEqual({
      puzzle: {
        id: '00008',
        fen: 'r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24',
        moves: ['f2g3', 'e6e7', 'b2b1', 'b3c1', 'b1c1', 'h6c1'],
        rating: 1819,
        themes: ['crushing', 'hangingPiece', 'long', 'middlegame'],
        piece: 'rook',
        popularity: 95,
        plays: 10446,
      },
      deviation: 77,
    })
  })

  it('finds columns by name, wherever they are', () => {
    const moved = new PuzzleReader(
      'Moves,PuzzleId,FEN,Rating,RatingDeviation,Popularity,NbPlays,Themes',
    )
    const row =
      'd3d6 f8d8,0000D,5rk1/1p3ppp/pq3b2/8/8/1P1Q1N2/P4PPP/3R2K1 w - - 2 27,1433,75,96,37700,endgame'
    expect(moved.read(row)?.puzzle).toMatchObject({
      id: '0000D',
      piece: 'rook',
      themes: ['endgame'],
    })
  })

  it('refuses a header without a column it needs, and rows that are not puzzles', () => {
    expect(() => new PuzzleReader('PuzzleId,FEN,Moves')).toThrow('no Rating column')
    expect(reader.read('')).toBeNull()
    expect(reader.read(PUZZLE_ROWS.rookWins.replace('e6e7', 'e6e9'))).toBeNull()
    // No piece on the square the answer moves from.
    expect(reader.read(PUZZLE_ROWS.rookWins.replace('e6e7', 'e5e7'))).toBeNull()
  })
})

describe('PuzzleSampler', () => {
  const reader = new PuzzleReader(PUZZLE_HEADER)
  const read = (row: string) => {
    const found = reader.read(row)
    if (!found) throw new Error('unreadable row')
    return found
  }

  it('keeps well-liked, often played puzzles with a settled rating', () => {
    const sampler = new PuzzleSampler()
    const { puzzle, deviation } = read(PUZZLE_ROWS.rookWins)
    expect(sampler.keep(puzzle, deviation)).toBe(true)
    expect(sampler.keep({ ...puzzle, popularity: 70 }, deviation)).toBe(false)
    expect(sampler.keep({ ...puzzle, plays: 100 }, deviation)).toBe(false)
    expect(sampler.keep(puzzle, 200)).toBe(false)
  })

  it('keeps no more than its share of each band of ratings', () => {
    const sampler = new PuzzleSampler(2)
    const { puzzle, deviation } = read(PUZZLE_ROWS.rookWins)
    const kept = [1810, 1850, 1899, 1900].map((rating) =>
      sampler.keep({ ...puzzle, rating }, deviation),
    )
    expect(kept).toEqual([true, true, false, true])
  })
})

describe('readOpenings', () => {
  it('plays each line through, and skips any that cannot be played', () => {
    const openings = readOpenings(OPENINGS_TSV)
    expect(openings.map((o) => o.name)).toEqual([
      'Sicilian Defense',
      'Sicilian Defense: Najdorf Variation',
      'Italian Game',
      'French Defense',
    ])
    const italian = new Chess()
    for (const move of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']) italian.move(move)
    expect(openings[2]).toEqual({
      eco: 'C50',
      name: 'Italian Game',
      moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
      position: positionKey(italian.fen()),
    })
  })

  it('refuses a file laid out otherwise', () => {
    expect(() => readOpenings('name\tmoves\n')).toThrow('not laid out')
  })
})

describe('lineBatches', () => {
  it('splits text into lines, whatever the chunks, multi-byte characters included', async () => {
    const text = Buffer.from('é1\nline two\n\nlast')
    const chunks = Array.from(text, (byte) => Buffer.from([byte]))
    const lines: string[] = []
    for await (const batch of lineBatches(Readable.from(chunks))) lines.push(...batch)
    expect(lines).toEqual(['é1', 'line two', '', 'last'])
  })
})

describe('LibraryStore', () => {
  function library(): LibraryStore {
    const store = testLibrary(join(folder, 'library.db'))
    opened.push(store)
    return store
  }

  it('says what it holds', () => {
    expect(library().contents).toEqual({
      puzzles: 3,
      openings: 4,
      installedAt: '2026-11-08T12:00:00.000Z',
    })
  })

  it('finds puzzles by rating, whole theme and piece', () => {
    const store = library()
    const ids = (query: Parameters<LibraryStore['findPuzzles']>[0]) =>
      store
        .findPuzzles(query)
        .map((p) => p.id)
        .sort()
    const all = { rating: { min: 0, max: 3000 }, count: 10 }
    expect(ids(all)).toEqual(['00008', '0000D', '0000H'])
    expect(ids({ ...all, rating: { min: 1400, max: 1500 } })).toEqual(['0000D'])
    expect(ids({ ...all, theme: 'mateIn1' })).toEqual(['0000H'])
    // 'mate' is a theme of its own, not a part of 'mateIn1'.
    expect(ids({ ...all, theme: 'mate' })).toEqual(['0000H'])
    expect(ids({ ...all, theme: 'middlegame', piece: 'rook' })).toEqual(['00008'])
    expect(ids({ ...all, count: 1 })).toHaveLength(1)
    expect(store.puzzle('0000D')?.themes).toEqual(['advantage', 'endgame', 'short'])
    expect(store.puzzle('nope')).toBeNull()
  })

  it('finds openings by name, code and first moves, the shortest first', () => {
    const store = library()
    const names = (query: Parameters<LibraryStore['findOpenings']>[0]) =>
      store.findOpenings(query, 10).map((o) => o.name)
    expect(names({ name: 'sicilian' })).toEqual([
      'Sicilian Defense',
      'Sicilian Defense: Najdorf Variation',
    ])
    expect(names({ eco: 'b9' })).toEqual(['Sicilian Defense: Najdorf Variation'])
    expect(names({ moves: ['e4', 'e5'] })).toEqual(['Italian Game'])
    expect(names({ moves: ['e4', 'c5'] })).toHaveLength(2)
    // The pattern characters of LIKE are matched as they are.
    expect(names({ name: '%' })).toEqual([])
  })

  it("names a game's opening by the latest of its positions that has a name", () => {
    const store = library()
    const chess = new Chess()
    const positions = [positionKey(chess.fen())]
    for (const move of ['e4', 'c5', 'Nf3', 'Nc6']) {
      chess.move(move)
      positions.push(positionKey(chess.fen()))
    }
    expect(store.openingOf(positions)?.name).toBe('Sicilian Defense')
    expect(store.openingOf(positions.slice(0, 2))).toBeNull()
  })

  it('opens nothing where there is no library', () => {
    expect(LibraryStore.open(join(folder, 'missing.db'))).toBeNull()
  })
})

describe('buildLibrary', () => {
  it('keeps the good puzzles from a file in frames, and the openings', async () => {
    const progress: InstallProgress[] = []
    const puzzles = puzzleFile(Object.values(PUZZLE_ROWS))
    const contents = await buildLibrary({
      path: join(folder, 'built.db'),
      fetch: libraryServer({ puzzles, openings: OPENINGS_TSV }),
      signal: new AbortController().signal,
      onProgress: (p) => progress.push(p),
      now: () => new Date('2026-11-08T12:00:00Z'),
    })
    expect(contents).toEqual({ puzzles: 2, openings: 4, installedAt: '2026-11-08T12:00:00.000Z' })
    expect(progress).toEqual([
      { stage: 'puzzles', receivedBytes: 0, totalBytes: puzzles.length, puzzles: 0 },
      { stage: 'openings' },
      { stage: 'finishing' },
    ])
  })

  it('deletes what it built when a download fails', async () => {
    const path = join(folder, 'built.db')
    const fetch = libraryServer({ puzzles: Buffer.from('not compressed') })
    await expect(
      buildLibrary({ path, fetch, signal: new AbortController().signal, onProgress: () => {} }),
    ).rejects.toThrow('not a zstd file')
    expect(existsSync(path)).toBe(false)
  })
})

describe('LibraryService', () => {
  const settled = (service: LibraryService) =>
    new Promise<void>((resolve) => {
      const stop = service.onChange((state) => {
        if (!state.install) {
          stop()
          resolve()
        }
      })
    })

  it('installs a library and starts using it', async () => {
    const service = new LibraryService({
      path: join(folder, 'library.db'),
      fetch: libraryServer({ puzzles: puzzleFile([PUZZLE_ROWS.rookWins]), openings: OPENINGS_TSV }),
    })
    expect(service.installed).toBeNull()
    const done = settled(service)
    expect(service.startInstall()).toMatchObject({
      ok: true,
      state: { install: { stage: 'puzzles' } },
    })
    expect(service.startInstall()).toEqual({
      ok: false,
      error: 'The library is already being installed',
    })
    await done
    expect(service.state()).toMatchObject({
      contents: { puzzles: 1, openings: 4 },
      install: null,
      error: null,
    })
    expect(service.installed?.puzzle('00008')).not.toBeNull()
    service.close()
  })

  it('keeps the library it has when installing another fails, and says why', async () => {
    const path = join(folder, 'library.db')
    const first = new LibraryService({
      path,
      fetch: libraryServer({ puzzles: puzzleFile([PUZZLE_ROWS.rookWins]) }),
    })
    const installed = settled(first)
    first.startInstall()
    await installed
    first.close()

    const service = new LibraryService({
      path,
      fetch: libraryServer({ puzzles: puzzleFile([]) }),
      log: () => {},
    })
    const failed = settled(service)
    service.startInstall()
    await failed
    expect(service.state()).toMatchObject({
      contents: { puzzles: 1 },
      error: 'The puzzle file held no puzzles',
    })
    expect(existsSync(`${path}.partial`)).toBe(false)
    service.close()
  })

  it('stops an install when cancelled, without calling it a failure', async () => {
    const service = new LibraryService({
      path: join(folder, 'library.db'),
      fetch: (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    })
    const done = settled(service)
    service.startInstall()
    service.cancelInstall()
    await done
    expect(service.state()).toEqual({ contents: null, install: null, error: null })
  })
})
