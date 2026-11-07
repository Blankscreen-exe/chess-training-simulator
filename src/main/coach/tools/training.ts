// Training from the library: puzzles (to solve, or as examples for a lesson), openings, checking a
// line the coach wants to show, and reviewing a game once it is over.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { otherColor, START_FEN } from '@shared/chess'
import { numberedLine, numberedMove } from '@shared/notation'
import { PUZZLE_PIECES, PUZZLE_THEMES, themeName, type PuzzleRequest } from '@shared/training'
import { describeFen, resolveLine } from '../../chess/rules'
import { NO_LIBRARY } from '../../puzzles/service'
import { Puzzle } from '../../puzzles/puzzle'
import { COACH_LIMITS } from '../analyst'
import { annotatedLine, assessLine, evaluationOf, reviewGame } from '../review'
import { puzzleSnapshotOf } from '../snapshot'
import { positionOrGame, refuse, registrarFor, reply, type CoachContext } from './support'

const MAX_PUZZLES = 10
const MAX_OPENINGS = 20
/** The most moves check_line judges, as each takes the engine most of a second. */
const MAX_CHECKED_MOVES = 12

const puzzleFilters = {
  theme: z.enum(PUZZLE_THEMES).optional(),
  piece: z
    .enum(PUZZLE_PIECES)
    .optional()
    .describe('The piece that makes the first winning move, for a lesson about one piece'),
  rating: z
    .object({ min: z.number().int().min(400).max(3200), max: z.number().int().min(400).max(3200) })
    .optional()
    .describe("The range of puzzle ratings; the player's level sets it if left out"),
}

function requestOf(filters: {
  theme?: string | undefined
  piece?: PuzzleRequest['piece'] | undefined
  rating?: PuzzleRequest['rating'] | undefined
}): PuzzleRequest {
  return {
    ...(filters.theme ? { theme: filters.theme } : {}),
    ...(filters.piece ? { piece: filters.piece } : {}),
    ...(filters.rating ? { rating: filters.rating } : {}),
  }
}

export function registerTrainingTools(server: McpServer, context: CoachContext): void {
  const { hub, games, analyst, library, puzzles } = context
  const register = registrarFor(server, hub)

  register(
    'find_puzzles',
    {
      description:
        "Puzzles from the library, by theme, piece and rating, without putting them on the board: as examples for a lesson. Each comes with the position once the opponent's setting move is played, and the answer from there, which play_preview takes as it is.",
      inputSchema: {
        ...puzzleFilters,
        count: z.number().int().min(1).max(MAX_PUZZLES).default(3),
      },
      annotations: { readOnlyHint: true },
    },
    ({ count, ...filters }) => {
      const found = puzzles.find(requestOf(filters), count)
      if (!found.ok) return refuse(found.error)
      return reply({
        puzzles: found.puzzles.flatMap((source) => {
          const started = Puzzle.start(source)
          if (!started.ok) return []
          const { puzzle } = started
          const state = puzzle.state()
          return [
            {
              puzzle_id: source.id,
              rating: source.rating,
              themes: source.themes.map(themeName),
              piece: source.piece,
              player_color: puzzle.playerColor,
              fen: state.position.fen,
              answer: puzzle.answer,
            },
          ]
        }),
      })
    },
  )

  register(
    'start_puzzle',
    {
      description:
        'Put a puzzle on the board for the player to solve: a given one, or one chosen by theme, piece and rating. The app checks their moves and plays the replies; you hear how they get on through puzzle events. The answer is in the result, for hints: never give it away unless they ask.',
      inputSchema: {
        puzzle_id: z.string().max(10).optional().describe('A puzzle from find_puzzles'),
        ...puzzleFilters,
        title: z
          .string()
          .max(80)
          .optional()
          .describe('Shown with the puzzle, as "Bishop tricks, 2 of 3"'),
      },
    },
    ({ puzzle_id, title, ...filters }) => {
      const started = puzzles.start(
        puzzle_id ? { id: puzzle_id } : requestOf(filters),
        title ?? null,
      )
      if (!started.ok) return refuse(started.error)
      return reply(puzzleSnapshotOf(started.state, puzzles.answer() ?? []))
    },
  )

  register(
    'find_openings',
    {
      description:
        'Named openings from the library, by part of the name, ECO code, or first moves, the main lines first. Each comes with its moves from the standard start; to show one, call play_preview with start_fen as its fen and the moves as they are.',
      inputSchema: {
        name: z.string().min(2).max(80).optional().describe('Part of the name, as "Italian"'),
        eco: z
          .string()
          .regex(/^[A-Ea-e]\d{0,2}$/)
          .optional()
          .describe('An ECO code or the start of one, as "C50" or "C5"'),
        moves: z
          .array(z.string().min(2).max(10))
          .max(20)
          .optional()
          .describe('The first moves, in standard notation, for the openings that start so'),
        limit: z.number().int().min(1).max(MAX_OPENINGS).default(8),
      },
      annotations: { readOnlyHint: true },
    },
    ({ name, eco, moves, limit }) => {
      const store = library.installed
      if (!store) return refuse(NO_LIBRARY)
      let line: string[] | undefined
      if (moves) {
        const resolved = resolveLine(START_FEN, moves)
        if (!resolved.ok) return refuse(resolved.error)
        line = resolved.steps.map((step) => step.san)
      }
      const openings = store.findOpenings(
        {
          ...(name ? { name } : {}),
          ...(eco ? { eco } : {}),
          ...(line ? { moves: line } : {}),
        },
        limit,
      )
      return reply({
        start_fen: START_FEN,
        openings: openings.map((opening) => ({
          eco: opening.eco,
          name: opening.name,
          line: numberedLine(START_FEN, opening.moves),
          moves: opening.moves,
        })),
      })
    },
  )

  register(
    'check_line',
    {
      description:
        "The engine's verdict on each move of a line you want to show (a trick, a trap, a plan): its quality, from best to blunder, and the engine's choice instead. Use it before presenting any line you made up, and show it only if the moves of the side it is meant to help are best or good.",
      inputSchema: {
        fen: z
          .string()
          .optional()
          .describe("Where the line starts, as FEN; the game's current position if left out"),
        moves: z.array(z.string().min(2).max(10)).min(1).max(MAX_CHECKED_MOVES),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ fen: given, moves }) => {
      const target = positionOrGame(given, games.current())
      if (!target.ok) return refuse(target.error)
      const position = describeFen(target.fen)
      if (!position.ok) return refuse(position.error)
      const start = position.position.fen
      const resolved = resolveLine(start, moves)
      if (!resolved.ok) return refuse(resolved.error)
      const assessed = await assessLine(
        start,
        resolved.steps.map((step) => ({
          uci: step.uci,
          san: step.san,
          // The side that made the move is the one not to move after it.
          color: otherColor(step.position.turn),
          fenAfter: step.position.fen,
        })),
        analyst,
        COACH_LIMITS,
      )
      const end = assessed.at(-1)?.fenAfter ?? start
      return reply({
        start_evaluation: await evaluationOf(start, analyst, COACH_LIMITS),
        line: annotatedLine(start, assessed),
        moves: assessed.map((move, index) => ({
          move: numberedMove(start, index + 1, move.san),
          by: move.color,
          quality: move.assessment?.quality ?? null,
          engine_choice: move.assessment?.best_move ?? null,
        })),
        end_evaluation: await evaluationOf(end, analyst, COACH_LIMITS),
      })
    },
  )

  register(
    'review_game',
    {
      description:
        "The engine's review of a game: every move marked (?! inaccuracy, ? mistake, ?? blunder), how many of the player's moves were of each quality, and the turning points with the better move. A game by id from the player's history, or else the current or latest one. It takes around 20 seconds; tell the player you are looking at the game first.",
      inputSchema: { game_id: z.number().int().positive().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ game_id }) => {
      const id = game_id ?? games.current()?.id ?? games.list(1)[0]?.id
      if (id === undefined) return refuse('There are no games to review yet')
      const found = games.record(id)
      if (!found.ok) return refuse(found.error)
      if (found.game.moves.length === 0) return refuse('That game has no moves to review')
      return reply(await reviewGame(found.game, analyst, library.openingOf(found.game)))
    },
  )
}
