// What Claude hears about through wait_for_event. Field names are in snake case, as Claude reads
// them in JSON. Which of these it hears depends on the coaching mode (session.ts).
import type { AnalysisLine, Color, GameState, GameSummary } from '@shared/chess'
import type { CoachingMode } from '@shared/coach'
import type { PuzzleResult, PuzzleState } from '@shared/training'
import { engineLevelName } from '@shared/engine-levels'
import { numberedMove } from '@shared/notation'
import { describeScore, type MoveAssessment } from '../analysis/evaluation'
import type { PuzzleSnapshot } from './snapshot'

/** A move worth considering, with the engine's view of where it leads. */
export interface CandidateMove {
  move: string
  evaluation: string
}

/** The first move of each engine line, as the coach reads them. */
export function candidateMoves(lines: readonly AnalysisLine[]): CandidateMove[] {
  return lines.flatMap((line) =>
    line.san[0] ? [{ move: line.san[0], evaluation: describeScore(line.score) }] : [],
  )
}

export type CoachEvent =
  | { type: 'player_message'; text: string }
  | {
      type: 'game_started'
      game_id: number
      player_color: Color
      engine_level: string
      opponent: GameState['opponent']
      /** Moves already played when the game was first seen, as in one carried on after a restart. */
      moves_played: number
      fen: string
    }
  | {
      type: 'move'
      by: 'player' | 'opponent'
      /** Its place in the game, counting each side's moves, from 1. */
      ply: number
      move: string
      fen_after: string
      /** How good the player's move was, in the modes that judge moves. */
      assessment?: MoveAssessment
    }
  | {
      type: 'game_ended'
      result: GameSummary['result']
      termination: GameSummary['termination'] | null
    }
  /** It is the player's move; the engine's best options, for the modes that show them. */
  | { type: 'your_turn'; fen: string; candidates: CandidateMove[] }
  /** The coach is the opponent, and must choose one of these with make_move. */
  | { type: 'opponent_to_move'; fen: string; candidates: CandidateMove[] }
  /** The player changed the coaching mode in the app. */
  | { type: 'mode_changed'; mode: CoachingMode }
  /** A puzzle is on the board, chosen by the player or by you. */
  | { type: 'puzzle_started'; puzzle: PuzzleSnapshot }
  /** The player tried a move in the puzzle; a wrong one is not played, and they try again. */
  | {
      type: 'puzzle_move'
      move: string
      right: boolean
      moves_found: number
      moves_to_find: number
    }
  | { type: 'puzzle_ended'; result: PuzzleResult; mistakes: number; hints: number }

export type MoveEvent = Extract<CoachEvent, { type: 'move' }>

/**
 * The events between two states of the game, oldest first. A game seen for the first time is
 * announced with how far it has got, not move by move.
 */
export function gameEvents(previous: GameState | null, next: GameState | null): CoachEvent[] {
  if (!next) return []
  if (previous?.id !== next.id) {
    return [
      {
        type: 'game_started',
        game_id: next.id,
        player_color: next.playerColor,
        engine_level: engineLevelName(next.engineLevel),
        opponent: next.opponent,
        moves_played: next.moves.length,
        fen: next.position.fen,
      },
    ]
  }

  const seen = previous.moves.length
  const events: CoachEvent[] = next.moves.slice(seen).map((move, index) => ({
    type: 'move',
    by: move.color === next.playerColor ? 'player' : 'opponent',
    ply: seen + index + 1,
    move: numberedMove(next.initialFen, seen + index + 1, move.san),
    fen_after: move.fenAfter,
  }))
  if (previous.status === 'in_progress' && next.status !== 'in_progress') {
    events.push({ type: 'game_ended', result: next.result, termination: next.termination ?? null })
  }
  return events
}

/**
 * The events between two states of the puzzle on the board, oldest first. `snapshot` describes a
 * puzzle as it starts.
 */
export function puzzleEvents(
  previous: PuzzleState | null,
  next: PuzzleState | null,
  snapshot: (puzzle: PuzzleState) => PuzzleSnapshot,
): CoachEvent[] {
  const ended = (puzzle: PuzzleState, result: PuzzleResult): CoachEvent => ({
    type: 'puzzle_ended',
    result,
    mistakes: puzzle.mistakes,
    hints: puzzle.hints,
  })
  if (previous?.id !== next?.id) {
    return [
      ...(previous?.status === 'solving' ? [ended(previous, 'left')] : []),
      ...(next ? [{ type: 'puzzle_started', puzzle: snapshot(next) } as const] : []),
    ]
  }
  if (!previous || !next) return []

  const events: CoachEvent[] = []
  const tried = (move: string, right: boolean): CoachEvent => ({
    type: 'puzzle_move',
    move,
    right,
    moves_found: next.found,
    moves_to_find: next.solutionLength,
  })
  if (next.mistakes > previous.mistakes && next.wrongMove) events.push(tried(next.wrongMove, false))
  if (next.found > previous.found) {
    const found = next.moves.findLast((move) => move.color === next.playerColor)
    if (found) events.push(tried(found.san, true))
  }
  if (previous.status === 'solving' && next.status !== 'solving')
    events.push(ended(next, next.status))
  return events
}
