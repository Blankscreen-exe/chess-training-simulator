// The game as Claude reads it: short, in the notation chess players use, and with nothing it
// would have to work out for itself. Claude is told never to judge positions on its own, so
// this says whose move it is, what was played, and how the game stands, and no more.
import type { GameState } from '@shared/chess'
import { engineLevelName } from '@shared/engine-levels'
import { numberedLine, numberedMove } from '@shared/notation'
import { themeName, type Opening, type PuzzleState } from '@shared/training'

export interface GameSnapshot {
  game_id: number
  status: GameState['status']
  result: GameState['result']
  termination: GameState['termination'] | null
  player_color: GameState['playerColor']
  engine_level: string
  opponent: GameState['opponent']
  /** The named opening the game is in, if the library knows it. */
  opening: string | null
  side_to_move: GameState['position']['turn']
  in_check: boolean
  fen: string
  moves: string
  move_count: number
  opponent_thinking: boolean
}

export function snapshotOf(game: GameState, opening: Opening | null): GameSnapshot {
  return {
    game_id: game.id,
    status: game.status,
    result: game.result,
    termination: game.termination ?? null,
    player_color: game.playerColor,
    engine_level: engineLevelName(game.engineLevel),
    opponent: game.opponent,
    opening: opening ? `${opening.eco} ${opening.name}` : null,
    side_to_move: game.position.turn,
    in_check: game.position.check,
    fen: game.position.fen,
    moves: numberedLine(
      game.initialFen,
      game.moves.map((move) => move.san),
    ),
    move_count: game.moves.length,
    opponent_thinking: game.opponentThinking,
  }
}

/** A puzzle as Claude reads it, answer included so it can give hints; the player never sees this. */
export interface PuzzleSnapshot {
  puzzle_id: string
  rating: number
  themes: string[]
  title: string | null
  player_color: PuzzleState['playerColor']
  status: PuzzleState['status']
  /** The opponent's move that sets the puzzle. */
  opponent_move: string
  /** The whole answer from there, the opponent's replies included. Do not give it away. */
  answer: string
  fen: string
  moves_found: number
  moves_to_find: number
  mistakes: number
  hints: number
}

export function puzzleSnapshotOf(puzzle: PuzzleState, answer: readonly string[]): PuzzleSnapshot {
  const [setting] = puzzle.moves
  return {
    puzzle_id: puzzle.id,
    rating: puzzle.rating,
    themes: puzzle.themes.map(themeName),
    title: puzzle.title,
    player_color: puzzle.playerColor,
    status: puzzle.status,
    opponent_move: setting ? numberedMove(puzzle.initialFen, 1, setting.san) : '',
    answer: setting ? numberedLine(setting.fenAfter, answer) : '',
    fen: puzzle.position.fen,
    moves_found: puzzle.found,
    moves_to_find: puzzle.solutionLength,
    mistakes: puzzle.mistakes,
    hints: puzzle.hints,
  }
}
