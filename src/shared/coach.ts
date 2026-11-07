// The coach: Claude, connected from the player's own Claude Code through the app's MCP server.
// These are the types the main process and the page share about it.

export const COACH_SERVER_NAME = 'chess-coach'
export const DEFAULT_COACH_PORT = 8765
/** Where the MCP server answers, under its port. */
export const COACH_PATH = '/mcp'

/** The address Claude Code connects to. */
export function coachUrl(port: number): string {
  return `http://127.0.0.1:${port}${COACH_PATH}`
}

/** The command that adds the coach to Claude Code for every folder. */
export function addCoachCommand(port: number): string {
  return `claude mcp add --transport http ${COACH_SERVER_NAME} ${coachUrl(port)}`
}

/**
 * - `unavailable`: the app could not start its server (usually: the port is taken).
 * - `offline`: Claude Code has not been in touch recently.
 * - `connected`: Claude Code is listening.
 * - `paused`: Claude stopped listening after a long quiet spell; telling it to carry on, in
 *   Claude Code, brings it back.
 */
export const COACH_STATUSES = ['unavailable', 'offline', 'connected', 'paused'] as const
export type CoachStatus = (typeof COACH_STATUSES)[number]

export const CHAT_AUTHORS = ['player', 'coach'] as const
export type ChatAuthor = (typeof CHAT_AUTHORS)[number]

export interface ChatMessage {
  id: number
  from: ChatAuthor
  text: string
  /** When it was written, as an ISO date. */
  at: string
}

/** The longest message either side may write. */
export const MAX_CHAT_LENGTH = 4000

export interface CoachState {
  status: CoachStatus
  /** Why the server is unavailable, when it is. */
  problem?: string
  port: number
  messages: ChatMessage[]
}
