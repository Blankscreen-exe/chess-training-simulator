// Which part of the game a position is in, to count the player's mistakes by it. A simpler form of
// how Lichess divides games: the endgame once few pieces are left, the opening for the first
// moves before that, and the middlegame in between.
import type { GamePhase } from '@shared/profile'
import { splitFen } from '@shared/notation'

/** The endgame starts once the queens, rooks, bishops and knights left, both sides', are this few. */
const ENDGAME_PIECES = 6
/** The opening lasts this many moves at most, numbered as chess players number them. */
const OPENING_MOVES = 10

export function gamePhase(fen: string): GamePhase {
  const { placement, fullmoves } = splitFen(fen)
  const pieces = placement.replace(/[^nbrqNBRQ]/g, '').length
  if (pieces <= ENDGAME_PIECES) return 'endgame'
  return fullmoves <= OPENING_MOVES ? 'opening' : 'middlegame'
}
