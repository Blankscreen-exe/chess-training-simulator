import type { GameSummary } from '@shared/chess'
import { engineLevelName } from '@shared/engine-levels'

/** Who the player is up against: "Stockfish, Level 3" or "your coach". */
export function opponentName(game: Pick<GameSummary, 'opponent' | 'engineLevel'>): string {
  return game.opponent === 'coach'
    ? 'your coach'
    : `Stockfish, ${engineLevelName(game.engineLevel)}`
}
