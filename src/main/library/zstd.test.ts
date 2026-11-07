import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { constants, createZstdDecompress, zstdCompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ZstdDataFrames } from './zstd'

function skippable(payload: Buffer, magic = 0x184d2a50): Buffer {
  const header = Buffer.alloc(8)
  header.writeUInt32LE(magic, 0)
  header.writeUInt32LE(payload.length, 4)
  return Buffer.concat([header, payload])
}

function compressed(text: string, checksum = false): Buffer {
  return zstdCompressSync(Buffer.from(text), {
    params: { [constants.ZSTD_c_checksumFlag]: checksum ? 1 : 0 },
  })
}

/** Runs `file` through the frame walker and zstd, fed in pieces of `pieceSize` bytes. */
async function decompress(file: Buffer, pieceSize = file.length): Promise<string> {
  const pieces: Buffer[] = []
  for (let at = 0; at < file.length; at += pieceSize) pieces.push(file.subarray(at, at + pieceSize))
  const out: Buffer[] = []
  await pipeline(Readable.from(pieces), new ZstdDataFrames(), createZstdDecompress(), async (s) => {
    for await (const chunk of s) out.push(chunk as Buffer)
  })
  return Buffer.concat(out).toString()
}

describe('ZstdDataFrames', () => {
  // Long enough to need several blocks, repetitive enough to have RLE and compressed ones.
  const text = Array.from({ length: 4000 }, (_, i) => `row ${i},${'x'.repeat(i % 50)}`).join('\n')

  it('drops skippable frames before, between and after frames of data', async () => {
    const file = Buffer.concat([
      skippable(Buffer.from([4, 0, 0, 0])),
      compressed(text),
      skippable(Buffer.alloc(0), 0x184d2a5f),
      compressed('and more', true),
      skippable(Buffer.from('trailing')),
    ])
    expect(await decompress(file)).toBe(`${text}and more`)
  })

  it('reads frames however the file is cut into pieces', async () => {
    const file = Buffer.concat([skippable(Buffer.from('meta')), compressed(text, true)])
    for (const size of [1, 2, 3, 7, 64]) expect(await decompress(file, size)).toBe(text)
  })

  it('refuses a file that is not zstd', async () => {
    await expect(decompress(Buffer.from('PuzzleId,FEN,Moves\n'))).rejects.toThrow('not a zstd')
  })

  it('refuses a file cut off part-way through a frame', async () => {
    const whole = compressed(text)
    await expect(decompress(whole.subarray(0, whole.length - 5))).rejects.toThrow('ends part-way')
  })
})
