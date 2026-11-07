// The engine's view, and showing things on the board: arrows for moves worth considering, lines
// played out, and positions set up to look at.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Chess } from 'chess.js'
import { z } from 'zod'
import { MAX_ANALYSIS_LINES, shownPart } from '@shared/chess'
import type { Candidate } from '@shared/coach'
import { numberedLine, splitFen, toUci } from '@shared/notation'
import { describeScore } from '../../analysis/evaluation'
import { describeFen, resolveLine, tryMoveText } from '../../chess/rules'
import { positionOrGame, refuse, registrarFor, reply, type CoachContext } from './support'

/** The most moves of each line written out for Claude. */
const LINE_MOVES = 8
const MAX_CANDIDATES = 5
const MAX_PREVIEW_MOVES = 40
const MAX_NOTE_LENGTH = 300

const fen = z
  .string()
  .optional()
  .describe("A position as FEN; the game's current position if left out")

export function registerBoardTools(server: McpServer, context: CoachContext): void {
  const { hub, games, analyst } = context
  const register = registrarFor(server, hub)

  register(
    'analyze_position',
    {
      description:
        "The engine's best lines in a position, with an evaluation of each, as numbered text and as a list of moves (which play_preview takes as they are). Base every claim about which move is good on this.",
      inputSchema: { fen, lines: z.number().int().min(1).max(MAX_ANALYSIS_LINES).default(3) },
      annotations: { readOnlyHint: true },
    },
    async ({ fen: given, lines }) => {
      const target = positionOrGame(given, games.current())
      if (!target.ok) return refuse(target.error)
      const position = describeFen(target.fen)
      if (!position.ok) return refuse(position.error)
      const analysis = await analyst.analyse(position.position.fen, lines)
      return reply({
        fen: analysis.fen,
        side_to_move: position.position.turn,
        lines: analysis.lines.map((line) => {
          const moves = line.san.slice(0, LINE_MOVES)
          return {
            evaluation: describeScore(line.score),
            line: numberedLine(analysis.fen, moves),
            moves,
          }
        }),
      })
    },
  )

  register(
    'show_candidates',
    {
      description:
        'Draw moves on the board as numbered arrows, with a short note on each, for the player to consider. An empty list clears them. They are cleared when the game moves on.',
      inputSchema: {
        fen,
        moves: z
          .array(
            z.object({
              move: z.string().min(2).max(10).describe('In standard notation'),
              note: z.string().max(MAX_NOTE_LENGTH).optional(),
            }),
          )
          .max(MAX_CANDIDATES),
      },
    },
    ({ fen: given, moves }) => {
      const target = positionOrGame(given, games.current())
      if (!target.ok) return refuse(target.error)
      const position = describeFen(target.fen)
      if (!position.ok) return refuse(position.error)
      const candidates: Candidate[] = []
      for (const { move, note } of moves) {
        const played = tryMoveText(new Chess(position.position.fen), move)
        if (!played) return refuse(`${move} is not a legal move in that position`)
        candidates.push({ uci: toUci(played), san: played.san, ...(note ? { note } : {}) })
      }
      hub.setCandidates(
        candidates.length > 0 ? { fen: position.position.fen, moves: candidates } : null,
      )
      return reply({ shown: candidates.map((candidate) => candidate.san) })
    },
  )

  register(
    'play_preview',
    {
      description:
        'Play a line of moves out on the board, one by one, with a caption for each if you like, then return the board to where it was. The game itself is not touched. Use it to show what would happen.',
      inputSchema: {
        fen,
        title: z.string().min(1).max(80),
        moves: z.array(z.string().min(2).max(10)).min(1).max(MAX_PREVIEW_MOVES),
        captions: z
          .array(z.string().max(MAX_NOTE_LENGTH))
          .max(MAX_PREVIEW_MOVES)
          .optional()
          .describe('What to say as each move is played, in order'),
      },
    },
    ({ fen: given, title, moves, captions }) => {
      const target = positionOrGame(given, games.current())
      if (!target.ok) return refuse(target.error)
      const start = describeFen(target.fen)
      if (!start.ok) return refuse(start.error)
      const line = resolveLine(start.position.fen, moves)
      if (!line.ok) return refuse(line.error)
      hub.command({
        type: 'preview',
        title,
        start: shownPart(start.position),
        steps: line.steps,
        captions: captions ?? [],
      })
      return reply({
        playing: numberedLine(
          start.position.fen,
          line.steps.map((step) => step.san),
        ),
      })
    },
  )

  register(
    'set_position',
    {
      description:
        'Open the analysis board on a position, such as one the player describes or an example. It does not touch the game. Moves can then be tried there, and analyze_position, show_candidates and play_preview used on it by passing its FEN.',
      inputSchema: { fen: z.string().min(1) },
    },
    ({ fen: given }) => {
      const position = describeFen(given)
      if (!position.ok) return refuse(position.error)
      hub.command({ type: 'open-analysis', start: position.position })
      return reply({
        fen: position.position.fen,
        side_to_move: splitFen(position.position.fen).turn,
      })
    },
  )
}
