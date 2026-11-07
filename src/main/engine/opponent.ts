import type { Opponent } from '../games/opponent'
import type { Engine } from './engine'
import { playSettings } from './levels'

/** Stockfish playing at the game's level. `engine` is asked for again after it fails. */
export function engineOpponent(
  engine: () => Engine,
  log: (message: string, error?: unknown) => void,
): Opponent {
  return {
    chooseMove(turn, signal) {
      const current = engine()
      signal.addEventListener('abort', () => current.stop(), { once: true })
      return current.bestMove(turn.fen, playSettings(turn.level))
    },
    newGame() {
      engine()
        .newGame()
        .catch((error: unknown) => log('The engine could not start a new game', error))
    },
  }
}
