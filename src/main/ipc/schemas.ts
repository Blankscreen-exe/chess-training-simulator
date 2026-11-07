// What each channel's arguments must look like. They come from the page, so they are checked
// before any handler sees them, whatever the types say. Each schema is typed by the contract, so
// the compiler refuses one that would let through, or turn away, what the types say it should.
import { z } from 'zod'
import { MAX_ANALYSIS_LINES, PROMOTION_PIECES, SIDE_CHOICES } from '@shared/chess'
import { MAX_CHAT_LENGTH } from '@shared/coach'
import { ENGINE_LEVEL_IDS } from '@shared/engine-levels'
import type { IpcArgs, IpcChannel } from '@shared/ipc'
import { SQUARE_PATTERN, UCI_MOVE_PATTERN } from '@shared/notation'

/** Long enough for any FEN, short enough to refuse anything absurd. */
const MAX_FEN_LENGTH = 120
/** More moves than a line worth showing, fewer than would strain the main process. */
const MAX_LINE_MOVES = 300

const square = z.string().regex(SQUARE_PATTERN)
const fen = z.string().min(1).max(MAX_FEN_LENGTH)
const moveInput = z.strictObject({
  from: square,
  to: square,
  promotion: z.enum(PROMOTION_PIECES).exactOptional(),
})
const none = z.tuple([])

export const ARGUMENTS: { [C in IpcChannel]: z.ZodType<IpcArgs<C>> } = {
  'app:get-info': none,
  'game:get': none,
  'game:new': z.tuple([
    z.strictObject({
      playerColor: z.enum(SIDE_CHOICES),
      engineLevel: z.literal(ENGINE_LEVEL_IDS),
      fen: fen.exactOptional(),
    }),
  ]),
  'game:move': z.tuple([moveInput]),
  'game:resign': none,
  'game:abandon': none,
  'game:retry-engine': none,
  'games:list': none,
  'games:get': z.tuple([z.number().int().positive()]),
  'position:describe': z.tuple([fen]),
  'position:play': z.tuple([fen, moveInput]),
  'line:resolve': z.tuple([fen, z.array(z.string().regex(UCI_MOVE_PATTERN)).max(MAX_LINE_MOVES)]),
  'analysis:run': z.tuple([
    z.strictObject({ fen, lines: z.number().int().min(1).max(MAX_ANALYSIS_LINES) }),
  ]),
  'coach:get': none,
  'coach:send': z.tuple([z.string().min(1).max(MAX_CHAT_LENGTH)]),
}
