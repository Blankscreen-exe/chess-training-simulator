// Building the library from its sources: Lichess's puzzles, streamed (the file is about 300 MB
// compressed, and more than three times that once not), and its openings. Puzzles are read as
// they arrive, so neither the download nor the whole file is ever held or saved.
import { rmSync } from 'node:fs'
import { Readable, Transform, type TransformCallback } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { StringDecoder } from 'node:string_decoder'
import { createZstdDecompress } from 'node:zlib'
import type { InstallProgress, LibraryContents } from '@shared/training'
import { LibraryWriter } from './database'
import { readOpenings } from './openings'
import { PuzzleReader, PuzzleSampler } from './puzzles'
import { ZstdDataFrames } from './zstd'

const OPENINGS_BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master'

export const LIBRARY_SOURCES = {
  puzzles: 'https://database.lichess.org/lichess_db_puzzle.csv.zst',
  openings: ['a', 'b', 'c', 'd', 'e'].map((volume) => `${OPENINGS_BASE}/${volume}.tsv`),
}

export type LibrarySources = typeof LIBRARY_SOURCES

/** How much is downloaded between reports of progress. */
const REPORT_EVERY_BYTES = 1 << 20

/** What the installer needs of `fetch`; Electron's `net.fetch` in the app, which uses its proxy. */
export type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>

export interface InstallOptions {
  /** The file to build the library in; anything there already is replaced. */
  path: string
  fetch: Fetch
  signal: AbortSignal
  onProgress: (progress: InstallProgress) => void
  sources?: LibrarySources
  now?: () => Date
}

/** Builds a library at `options.path`. On failure the file is deleted, and the error thrown. */
export async function buildLibrary(options: InstallOptions): Promise<LibraryContents> {
  const { path, signal, onProgress, sources = LIBRARY_SOURCES, now = () => new Date() } = options
  const fetchOk = async (url: string) => {
    const response = await options.fetch(url, { signal })
    if (!response.ok || !response.body)
      throw new Error(`Could not download ${url} (HTTP ${response.status})`)
    return response
  }

  rmSync(path, { force: true })
  const writer = new LibraryWriter(path)
  try {
    const response = await fetchOk(sources.puzzles)
    const totalBytes = Number(response.headers.get('content-length')) || null
    const report = (receivedBytes: number) =>
      onProgress({ stage: 'puzzles', receivedBytes, totalBytes, puzzles: writer.puzzleCount })
    report(0)

    const sampler = new PuzzleSampler()
    let reader: PuzzleReader | null = null
    await pipeline(
      Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
      new ByteCounter(REPORT_EVERY_BYTES, report),
      new ZstdDataFrames(),
      createZstdDecompress(),
      async (text: AsyncIterable<Buffer>) => {
        for await (const lines of lineBatches(text)) {
          const kept = []
          for (const line of lines) {
            if (!reader) {
              reader = new PuzzleReader(line)
              continue
            }
            const row = reader.read(line)
            if (row && sampler.keep(row.puzzle, row.deviation)) kept.push(row.puzzle)
          }
          writer.addPuzzles(kept)
        }
      },
      { signal },
    )
    if (writer.puzzleCount === 0) throw new Error('The puzzle file held no puzzles')

    onProgress({ stage: 'openings' })
    for (const url of sources.openings) {
      const response = await fetchOk(url)
      writer.addOpenings(readOpenings(await response.text()))
    }

    onProgress({ stage: 'finishing' })
    return writer.finish(now().toISOString())
  } catch (error) {
    writer.abandon()
    rmSync(path, { force: true })
    throw error
  }
}

/** Passes bytes on, telling `onCount` how many have passed each time `interval` more have. */
class ByteCounter extends Transform {
  private count = 0
  private reported = 0

  constructor(
    private readonly interval: number,
    private readonly onCount: (count: number) => void,
  ) {
    super()
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.count += chunk.length
    if (this.count - this.reported >= this.interval) {
      this.reported = this.count
      this.onCount(this.count)
    }
    done(null, chunk)
  }
}

/** The lines of a stream of UTF-8 text, a batch at a time: those complete in each chunk. */
export async function* lineBatches(chunks: AsyncIterable<Buffer>): AsyncGenerator<string[]> {
  const decoder = new StringDecoder('utf8')
  let partial = ''
  for await (const chunk of chunks) {
    const lines = (partial + decoder.write(chunk)).split('\n')
    partial = lines.pop() ?? ''
    if (lines.length > 0) yield lines
  }
  const last = partial + decoder.end()
  if (last.length > 0) yield [last]
}
