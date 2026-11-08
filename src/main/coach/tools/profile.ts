// The player's profile: what the app knows of how they play, and the weaknesses the coach notes.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { PUZZLE_THEMES } from '@shared/training'
import { profileSnapshotOf } from '../snapshot'
import { registrarFor, reply, type CoachContext } from './support'

export function registerProfileTools(server: McpServer, context: CoachContext): void {
  const { hub, profile } = context
  const register = registrarFor(server, hub)

  register(
    'get_player_profile',
    {
      description:
        "What the app knows of the player: their level, their puzzle rating and the themes they find hardest and easiest, how their games end and where in them they go wrong (from the engine's reviews), the weaknesses noted so far, the themes to aim puzzles at, and how many of their missed positions are due for practice.",
      annotations: { readOnlyHint: true },
    },
    () =>
      reply({
        player_level: hub.currentSettings.playerLevel,
        ...profileSnapshotOf(profile.profile(), new Date()),
      }),
  )

  register(
    'log_weakness',
    {
      description:
        "Note a pattern in the player's mistakes, once you have seen it more than once (in a review, a game or puzzles), so later training can aim at it. Use the name of one already in get_player_profile when it is the same pattern: it is counted again rather than added.",
      inputSchema: {
        pattern: z
          .string()
          .trim()
          .min(3)
          .max(60)
          .describe('A short name for the pattern, as "Leaves pieces undefended"'),
        theme: z
          .enum(PUZZLE_THEMES)
          .optional()
          .describe('The puzzle theme that trains it, if one does, as "hangingPiece"'),
        note: z
          .string()
          .max(200)
          .optional()
          .describe('This time\'s example, as "14. Nf3 left the bishop on g5 to be taken"'),
      },
    },
    ({ pattern, theme, note }) => {
      const weakness = profile.logWeakness({ pattern, theme: theme ?? null, note: note ?? null })
      return reply({ pattern: weakness.pattern, times_noted: weakness.seen })
    },
  )
}
