// Node decompresses zstd, but stops at a skippable frame, which compressors such as pzstd put
// before each frame of data (Lichess's puzzle file has one every 8 MB or so). This stream walks
// the frames, following the format's own description of their sizes (RFC 8878), and passes on
// only the frames of data, ready for zlib's zstd decompressor.
import { Transform, type TransformCallback } from 'node:stream'

const DATA_FRAME_MAGIC = 0xfd2fb528
/** Skippable frames have any magic number from 0x184D2A50 to 0x184D2A5F. */
const SKIPPABLE_MAGIC = 0x184d2a50
const SKIPPABLE_MASK = 0xfffffff0

const BLOCK_HEADER_SIZE = 3
const CHECKSUM_SIZE = 4
const BLOCK_TYPE_RLE = 1
const BLOCK_TYPE_RESERVED = 3

/** What the walker is waiting for next. */
type Expecting =
  /** A frame's magic number, and the first header fields that say how long the header is. */
  | { kind: 'frame' }
  /** The bytes of a skippable frame, which are dropped. */
  | { kind: 'skip'; remaining: number }
  | { kind: 'block-header'; checksum: boolean }
  /** The rest of a block, or a frame's checksum, which are passed on. */
  | { kind: 'copy'; remaining: number; then: Expecting }

export class ZstdDataFrames extends Transform {
  private pending: Buffer = Buffer.alloc(0)
  private expecting: Expecting = { kind: 'frame' }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.pending = this.pending.length > 0 ? Buffer.concat([this.pending, chunk]) : chunk
    try {
      this.walk()
      done()
    } catch (error) {
      done(error as Error)
    }
  }

  override _flush(done: TransformCallback): void {
    const complete = this.pending.length === 0 && this.expecting.kind === 'frame'
    done(complete ? null : new Error('The compressed file ends part-way through a frame'))
  }

  /** Takes in as much of what is pending as it can, leaving any part that is too short to read. */
  private walk(): void {
    for (;;) {
      const next = this.step(this.expecting)
      if (!next) return
      this.expecting = next
    }
  }

  /** What to expect after reading `expecting` from what is pending; null if more is needed. */
  private step(expecting: Expecting): Expecting | null {
    switch (expecting.kind) {
      case 'frame':
        return this.frameStart()
      case 'skip': {
        const taken = Math.min(expecting.remaining, this.pending.length)
        if (taken === 0) return null
        this.consume(taken)
        const remaining = expecting.remaining - taken
        return remaining > 0 ? { kind: 'skip', remaining } : { kind: 'frame' }
      }
      case 'block-header': {
        if (this.pending.length < BLOCK_HEADER_SIZE) return null
        const header = this.pending.readUIntLE(0, BLOCK_HEADER_SIZE)
        const last = (header & 1) === 1
        const type = (header >> 1) & 3
        if (type === BLOCK_TYPE_RESERVED) throw new Error('The compressed file is damaged')
        const size = type === BLOCK_TYPE_RLE ? 1 : header >> 3
        this.push(this.consume(BLOCK_HEADER_SIZE))
        const after: Expecting = !last
          ? { kind: 'block-header', checksum: expecting.checksum }
          : expecting.checksum
            ? { kind: 'copy', remaining: CHECKSUM_SIZE, then: { kind: 'frame' } }
            : { kind: 'frame' }
        return size > 0 ? { kind: 'copy', remaining: size, then: after } : after
      }
      case 'copy': {
        const taken = Math.min(expecting.remaining, this.pending.length)
        if (taken === 0) return null
        this.push(this.consume(taken))
        const remaining = expecting.remaining - taken
        return remaining > 0 ? { ...expecting, remaining } : expecting.then
      }
    }
  }

  private frameStart(): Expecting | null {
    if (this.pending.length < 8) return null
    const magic = this.pending.readUInt32LE(0)
    if ((magic & SKIPPABLE_MASK) >>> 0 === SKIPPABLE_MAGIC) {
      const size = this.pending.readUInt32LE(4)
      this.consume(8)
      return size > 0 ? { kind: 'skip', remaining: size } : { kind: 'frame' }
    }
    if (magic !== DATA_FRAME_MAGIC) throw new Error('This is not a zstd file')

    const descriptor = this.pending.readUInt8(4)
    const headerSize = frameHeaderSize(descriptor)
    if (this.pending.length < headerSize) return null
    this.push(this.consume(headerSize))
    return { kind: 'block-header', checksum: (descriptor & 0b100) !== 0 }
  }

  private consume(count: number): Buffer {
    const taken = this.pending.subarray(0, count)
    this.pending = this.pending.subarray(count)
    return taken
  }
}

/** The size of a data frame's header, magic number included, from its descriptor byte. */
function frameHeaderSize(descriptor: number): number {
  const contentSizeFlag = descriptor >> 6
  const singleSegment = (descriptor & 0b10_0000) !== 0
  const dictionaryFlag = descriptor & 0b11
  const windowSize = singleSegment ? 0 : 1
  const dictionarySize = [0, 1, 2, 4][dictionaryFlag] ?? 0
  const contentSize = [singleSegment ? 1 : 0, 2, 4, 8][contentSizeFlag] ?? 0
  return 4 + 1 + windowSize + dictionarySize + contentSize
}
