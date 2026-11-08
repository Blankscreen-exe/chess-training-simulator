// What every tool shares: what it can reach, and how it answers.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { GameState, Result } from '@shared/chess'
import type { CoachAnalyst } from '../analyst'
import type { CoachHub } from '../hub'
import type { CoachOpponent } from '../opponent'
import type { CoachSession } from '../session'
import type { GameService } from '../../games/service'
import type { LibraryService } from '../../library/service'
import type { ProfileService } from '../../profile/service'
import type { PuzzleService } from '../../puzzles/service'
import type { ReviewService } from '../../reviews/service'

/** What the tools act on. */
export interface CoachContext {
  hub: CoachHub
  session: CoachSession
  analyst: CoachAnalyst
  opponent: CoachOpponent
  games: Pick<GameService, 'current' | 'newGame' | 'abandon' | 'list'>
  library: Pick<LibraryService, 'installed' | 'openingOf'>
  puzzles: Pick<PuzzleService, 'current' | 'answer' | 'find' | 'start'>
  reviews: Pick<ReviewService, 'review'>
  profile: Pick<ProfileService, 'profile' | 'logWeakness'>
}

/** An answer, as JSON text. */
export function reply(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

/** A refusal, with the reason Claude should act on. */
export function refuse(reason: string): CallToolResult {
  return { content: [{ type: 'text', text: reason }], isError: true }
}

/** The answer to something that may be refused. */
export function answer<T extends object>(result: Result<T>): CallToolResult {
  if (!result.ok) return refuse(result.error)
  const { ok, ...value } = result
  return reply(value)
}

/**
 * The server's registerTool, noting on every call that Claude Code is still there. The casts
 * only pass the callback through unchanged; its types are the SDK's own.
 */
export function registrarFor(server: McpServer, hub: CoachHub): McpServer['registerTool'] {
  const register = (name: string, config: object, callback: (...args: unknown[]) => unknown) =>
    server.registerTool(name, config, ((...args: unknown[]) => {
      hub.touch()
      return callback(...args)
    }) as never)
  return register as McpServer['registerTool']
}

/** The position a tool works on: the one given, or else the game's. */
export function positionOrGame(
  fen: string | undefined,
  game: GameState | null,
): Result<{ fen: string }> {
  if (fen !== undefined) return { ok: true, fen }
  if (game) return { ok: true, fen: game.position.fen }
  return { ok: false, error: 'No game is under way: give the position as a FEN.' }
}
