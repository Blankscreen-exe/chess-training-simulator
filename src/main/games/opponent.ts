// Who chooses the moves played against the player. GameService asks an Opponent; it does not care
// whether Stockfish (src/main/engine/opponent.ts) or the coach (src/main/coach/opponent.ts)
// answers.
import type { EngineLevelId } from '@shared/engine-levels'

/** A position where it is the opponent's move. */
export interface OpponentTurn {
  gameId: number
  fen: string
  level: EngineLevelId
}

export interface Opponent {
  /**
   * The move to play, in UCI, or null if there is none. `signal` aborts when the move is no
   * longer wanted, as when the player resigns or starts another game.
   */
  chooseMove(turn: OpponentTurn, signal: AbortSignal): Promise<string | null>
  /** A new game has started: anything learned about the last one can be forgotten. */
  newGame?(): void
}
