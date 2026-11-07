// The game itself: how it stands, starting and leaving games, the coach's moves when it is the
// opponent, and how closely it coaches.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { OPPONENTS, SIDE_CHOICES } from '@shared/chess'
import { COACHING_MODES } from '@shared/coach'
import { DEFAULT_ENGINE_LEVEL, ENGINE_LEVEL_IDS } from '@shared/engine-levels'
import { puzzleSnapshotOf, snapshotOf } from '../snapshot'
import { answer, refuse, registrarFor, reply, type CoachContext } from './support'

export function registerGameTools(server: McpServer, context: CoachContext): void {
  const { hub, games, opponent, library, puzzles } = context
  const register = registrarFor(server, hub)

  register(
    'get_game_state',
    {
      description:
        "The game being played (whose move it is, the moves so far, the position as FEN, how it stands, its opening), any puzzle on the board, whether the puzzle and openings library is installed, and the coaching settings (mode, the player's level). Use it for every fact about the game.",
      annotations: { readOnlyHint: true },
    },
    () => {
      const game = games.current()
      const { mode, playerLevel } = hub.currentSettings
      const puzzle = puzzles.current()
      return reply({
        coaching: { mode, player_level: playerLevel },
        game: game ? snapshotOf(game, library.openingOf(game)) : null,
        puzzle: puzzle ? puzzleSnapshotOf(puzzle, puzzles.answer() ?? []) : null,
        library_installed: library.installed !== null,
      })
    },
  )

  register(
    'new_game',
    {
      description:
        'Start a new game, when the player asks for one. Any game under way is left unfinished. The engine level and the opponent default to those of the last game.',
      inputSchema: {
        player_color: z.enum(SIDE_CHOICES).default('white'),
        engine_level: z.literal(ENGINE_LEVEL_IDS).optional(),
        opponent: z
          .enum(OPPONENTS)
          .optional()
          .describe("'coach' to choose the opponent's moves yourself, from the engine's best"),
        fen: z
          .string()
          .optional()
          .describe('A position to start from; the standard one if left out'),
      },
    },
    ({ player_color, engine_level, opponent: kind, fen }) => {
      const last = games.current()
      const started = games.newGame({
        playerColor: player_color,
        engineLevel: engine_level ?? last?.engineLevel ?? DEFAULT_ENGINE_LEVEL,
        opponent: kind ?? last?.opponent ?? 'engine',
        ...(fen !== undefined ? { fen } : {}),
      })
      if (!started.ok) return refuse(started.error)
      hub.command({ type: 'show-game' })
      return reply(snapshotOf(started.state, library.openingOf(started.state)))
    },
  )

  register(
    'end_game',
    {
      description:
        'Leave the game under way unfinished, when the player has had enough of it. It stays in their history.',
    },
    () => answer(games.abandon()),
  )

  register(
    'make_move',
    {
      description:
        "Play the opponent's move, when you are the opponent and an opponent_to_move event has offered you moves. Choose one of those moves; nothing else is accepted.",
      inputSchema: { move: z.string().min(2).max(10).describe('In standard notation, as offered') },
    },
    ({ move }) => answer(opponent.choose(move)),
  )

  register(
    'set_mode',
    {
      description:
        "Change how closely you coach, when the player asks: 'guided' shows options before each move and judges each one; 'casual' describes options and never judges; 'blunder_watch' speaks up only on mistakes; 'silent' says nothing about the game unless asked.",
      inputSchema: { mode: z.enum(COACHING_MODES) },
    },
    ({ mode }) => {
      const settings = hub.updateSettings({ mode }, 'coach')
      return reply({ mode: settings.mode })
    },
  )
}
