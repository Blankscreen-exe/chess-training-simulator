// The coach: Claude, connected from the player's own Claude Code through the app's MCP server.
// These are the types the main process and the page share about it.
import type { LineStep, Position, ShownPosition } from './chess'

export const COACH_SERVER_NAME = 'chess-coach'
export const DEFAULT_COACH_PORT = 8765
/** Where the MCP server answers, under its port. */
export const COACH_PATH = '/mcp'

/** The address Claude Code connects to. */
export function coachUrl(port: number): string {
  return `http://127.0.0.1:${port}${COACH_PATH}`
}

/**
 * The command that adds the coach to Claude Code for every folder: user scope, as Claude Code's
 * own default adds a server for the folder it is run in only.
 */
export function addCoachCommand(port: number): string {
  return `claude mcp add --transport http --scope user ${COACH_SERVER_NAME} ${coachUrl(port)}`
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

/**
 * How closely the coach follows the game:
 * - `guided`: shows the options before each of the player's moves, and says how each went.
 * - `casual`: describes the options before each move, and never judges the move made.
 * - `blunder_watch`: speaks up only when the player makes a mistake.
 * - `silent`: says nothing about the game unless asked.
 */
export const COACHING_MODES = ['guided', 'casual', 'blunder_watch', 'silent'] as const
export type CoachingMode = (typeof COACHING_MODES)[number]

export const COACHING_MODE_NAMES: Record<CoachingMode, string> = {
  guided: 'Guided',
  casual: 'Casual',
  blunder_watch: 'Blunder watch',
  silent: 'Silent',
}

/** How much chess the player knows, so the coach can pitch its explanations. */
export const PLAYER_LEVELS = ['beginner', 'casual', 'club', 'advanced'] as const
export type PlayerLevel = (typeof PLAYER_LEVELS)[number]

export const PLAYER_LEVEL_NAMES: Record<PlayerLevel, string> = {
  beginner: 'Beginner',
  casual: 'Casual player',
  club: 'Club player',
  advanced: 'Advanced',
}

export interface CoachSettings {
  mode: CoachingMode
  playerLevel: PlayerLevel
}

export const DEFAULT_COACH_SETTINGS: CoachSettings = { mode: 'guided', playerLevel: 'casual' }

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

/** A move the coach suggests looking at, drawn on the board as a numbered arrow. */
export interface Candidate {
  uci: string
  san: string
  note?: string
}

/** The moves the coach is pointing at, in a position. */
export interface Candidates {
  fen: string
  moves: Candidate[]
}

export interface CoachState {
  status: CoachStatus
  /** Why the server is unavailable, when it is. */
  problem?: string
  port: number
  settings: CoachSettings
  messages: ChatMessage[]
  /** The moves the coach is pointing at, until the game moves on or it points at others. */
  candidates: Candidates | null
}

/** Something the coach asks the board to do, once. */
export type BoardCommand =
  /** Plays a line out, then returns to where the board was. */
  | {
      type: 'preview'
      title: string
      start: ShownPosition
      steps: LineStep[]
      /** What to say about each move, shown as it is played; may be shorter than `steps`. */
      captions: string[]
    }
  /** Opens the analysis board on a position. */
  | { type: 'open-analysis'; start: Position }
  /** Shows the game being played, as when the coach has just started one. */
  | { type: 'show-game' }
