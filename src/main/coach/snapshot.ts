// The game as Claude reads it: short, in the notation chess players use, and with nothing it
// would have to work out for itself. Claude is told never to judge positions on its own, so
// this says whose move it is, what was played, and how the game stands, and no more.
import type { GameState } from '@shared/chess'
import { engineLevelName } from '@shared/engine-levels'
import { numberedLine } from '@shared/notation'

export interface GameSnapshot {
  game_id: number
  status: GameState['status']
  result: GameState['result']
  termination: GameState['termination'] | null
  player_color: GameState['playerColor']
  engine_level: string
  side_to_move: GameState['position']['turn']
  in_check: boolean
  fen: string
  moves: string
  move_count: number
  engine_thinking: boolean
}

export function snapshotOf(game: GameState): GameSnapshot {
  return {
    game_id: game.id,
    status: game.status,
    result: game.result,
    termination: game.termination ?? null,
    player_color: game.playerColor,
    engine_level: engineLevelName(game.engineLevel),
    side_to_move: game.position.turn,
    in_check: game.position.check,
    fen: game.position.fen,
    moves: numberedLine(
      game.initialFen,
      game.moves.map((move) => move.san),
    ),
    move_count: game.moves.length,
    engine_thinking: game.engineThinking,
  }
}
