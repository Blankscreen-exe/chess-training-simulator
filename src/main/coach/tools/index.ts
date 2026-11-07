// Every tool Claude Code can call. Each answers in JSON text, and each call tells the hub that
// Claude Code is still there.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerBoardTools } from './board'
import { registerConversationTools } from './conversation'
import { registerGameTools } from './game'
import type { CoachContext } from './support'
import { registerTrainingTools } from './training'

export type { CoachContext }

export function registerCoachTools(server: McpServer, context: CoachContext): void {
  registerConversationTools(server, context)
  registerGameTools(server, context)
  registerBoardTools(server, context)
  registerTrainingTools(server, context)
}
