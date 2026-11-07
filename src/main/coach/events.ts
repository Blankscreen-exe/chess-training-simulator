// What Claude hears about through wait_for_event: the player's messages, and what happens in the
// game. Game events are worked out by comparing one state of the game with the next.
import type { GameState, GameSummary } from '@shared/chess'
import { engineLevelName } from '@shared/engine-levels'
import { numberedMove } from '@shared/notation'

export type CoachEvent =
  | { type: 'player_message'; text: string }
  | {
      type: 'game_started'
      game_id: number
      player_color: GameState['playerColor']
      engine_level: string
      /** Moves already played when the game was first seen, as in one carried on after a restart. */
      moves_played: number
      fen: string
    }
  | { type: 'move'; by: 'player' | 'engine'; move: string; fen_after: string }
  | {
      type: 'game_ended'
      result: GameSummary['result']
      termination: GameSummary['termination'] | null
    }

/**
 * The events between two states of the game, oldest first. A game seen for the first time is
 * announced with how far it has got, not move by move.
 */
export function gameEvents(previous: GameState | null, next: GameState | null): CoachEvent[] {
  if (!next) return []
  const sameGame = previous?.id === next.id
  const events: CoachEvent[] = []

  if (!sameGame) {
    events.push({
      type: 'game_started',
      game_id: next.id,
      player_color: next.playerColor,
      engine_level: engineLevelName(next.engineLevel),
      moves_played: next.moves.length,
      fen: next.position.fen,
    })
  } else {
    const seen = previous.moves.length
    next.moves.slice(seen).forEach((move, index) => {
      events.push({
        type: 'move',
        by: move.color === next.playerColor ? 'player' : 'engine',
        move: numberedMove(next.initialFen, seen + index + 1, move.san),
        fen_after: move.fenAfter,
      })
    })
    if (previous.status === 'in_progress' && next.status !== 'in_progress') {
      events.push({
        type: 'game_ended',
        result: next.result,
        termination: next.termination ?? null,
      })
    }
  }
  return events
}
