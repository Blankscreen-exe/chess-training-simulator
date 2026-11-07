// The tools Claude Code can call. Each answers in JSON text; each call also tells the hub that
// Claude Code is still there.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { GameState } from '@shared/chess'
import { MAX_CHAT_LENGTH } from '@shared/coach'
import type { CoachHub } from './hub'
import { snapshotOf } from './snapshot'

export interface CoachToolDependencies {
  hub: CoachHub
  /** The game being played, if any. */
  currentGame: () => GameState | null
}

function reply(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

function refuse(reason: string): CallToolResult {
  return { content: [{ type: 'text', text: reason }], isError: true }
}

export function registerCoachTools(server: McpServer, { hub, currentGame }: CoachToolDependencies) {
  server.registerTool(
    'wait_for_event',
    {
      description:
        'Wait for the player to write or the game to change. Returns those events at once, or an empty list after about 40 seconds; then call it again. If it says to stop, stop.',
      annotations: { readOnlyHint: true },
    },
    async (extra) => {
      const result = await hub.waitForEvents(extra.signal)
      if ('paused' in result) {
        return reply({
          stop: true,
          reason:
            'Nothing has happened for a while. Stop calling wait_for_event, and tell the player that you are pausing and they can say "continue" in Claude Code to bring you back.',
        })
      }
      return reply(
        result.events.length > 0
          ? { events: result.events }
          : { events: [], note: 'Nothing happened. Call wait_for_event again.' },
      )
    },
  )

  server.registerTool(
    'say',
    {
      description:
        "Write in the app's chat panel, beside the board, where the player reads you. Keep it to a few sentences.",
      inputSchema: { text: z.string().min(1).max(MAX_CHAT_LENGTH) },
    },
    ({ text }) => {
      hub.touch()
      const said = hub.say(text)
      return said.ok ? reply({ ok: true }) : refuse(said.error)
    },
  )

  server.registerTool(
    'get_game_state',
    {
      description:
        'The game being played: whose move it is, the moves so far, the position as FEN, and how it stands. Use it for every fact about the game.',
      annotations: { readOnlyHint: true },
    },
    () => {
      hub.touch()
      const game = currentGame()
      return reply(game ? snapshotOf(game) : { game: null, note: 'No game is under way.' })
    },
  )
}
