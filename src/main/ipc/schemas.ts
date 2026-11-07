// What each channel's arguments must look like. They come from the page, so they are checked
// before any handler sees them, whatever the types say. Each schema is typed by the contract, so
// the compiler refuses one that would let through, or turn away, what the types say it should.
import { z } from 'zod'
import { MAX_ANALYSIS_LINES, OPPONENTS, PROMOTION_PIECES, SIDE_CHOICES } from '@shared/chess'
import { COACHING_MODES, MAX_CHAT_LENGTH, PLAYER_LEVELS } from '@shared/coach'
import { ENGINE_LEVEL_IDS } from '@shared/engine-levels'
import type { IpcArgs, IpcChannel } from '@shared/ipc'
import { SQUARE_PATTERN, UCI_MOVE_PATTERN } from '@shared/notation'
import { PUZZLE_PIECES } from '@shared/training'

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
/** A Lichess puzzle theme's name, as "mateIn2". */
const theme = z.string().regex(/^[a-zA-Z0-9]{1,40}$/)
const rating = z.number().int().min(0).max(4000)
/** More positions than any game has, fewer than would strain the main process. */
const MAX_GAME_POSITIONS = 1000

export const ARGUMENTS: { [C in IpcChannel]: z.ZodType<IpcArgs<C>> } = {
  'app:get-info': none,
  'game:get': none,
  'game:new': z.tuple([
    z.strictObject({
      playerColor: z.enum(SIDE_CHOICES),
      engineLevel: z.literal(ENGINE_LEVEL_IDS),
      opponent: z.enum(OPPONENTS),
      fen: fen.exactOptional(),
    }),
  ]),
  'game:move': z.tuple([moveInput]),
  'game:resign': none,
  'game:abandon': none,
  'game:retry-opponent': none,
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
  'coach:set-settings': z.tuple([
    z.strictObject({
      mode: z.enum(COACHING_MODES).exactOptional(),
      playerLevel: z.enum(PLAYER_LEVELS).exactOptional(),
    }),
  ]),
  'library:get': none,
  'library:install': none,
  'library:cancel': none,
  'opening:of': z.tuple([z.array(fen).max(MAX_GAME_POSITIONS)]),
  'puzzle:get': none,
  'puzzle:start': z.tuple([
    z.strictObject({
      theme: theme.exactOptional(),
      piece: z.enum(PUZZLE_PIECES).exactOptional(),
      rating: z.strictObject({ min: rating, max: rating }).exactOptional(),
    }),
  ]),
  'puzzle:move': z.tuple([moveInput]),
  'puzzle:hint': none,
  'puzzle:reveal': none,
  'puzzle:close': none,
}
