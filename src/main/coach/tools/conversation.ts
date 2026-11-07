// Listening to the player, and talking to them.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { MAX_CHAT_LENGTH } from '@shared/coach'
import { answer, registrarFor, reply, type CoachContext } from './support'

export function registerConversationTools(server: McpServer, { hub }: CoachContext): void {
  // wait_for_event notes contact itself, before and after its long wait.
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

  registrarFor(server, hub)(
    'say',
    {
      description:
        "Write in the app's chat panel, beside the board, where the player reads you. Keep it to a few sentences.",
      inputSchema: { text: z.string().min(1).max(MAX_CHAT_LENGTH) },
    },
    ({ text }) => answer(hub.say(text)),
  )
}
