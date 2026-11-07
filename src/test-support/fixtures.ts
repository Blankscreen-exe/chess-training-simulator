// Building blocks for tests, so each test states only what matters to it. Moves are played with
// chess.js rather than written out, so every position here is a real one.
import { Chess } from 'chess.js'
import type { GameState, PlayedMove, Position } from '@shared/chess'
import { START_FEN } from '@shared/chess'

/** The moves `san`, played from `fen`, as a game records them. */
export function playedMoves(san: readonly string[], fen = START_FEN): PlayedMove[] {
  const chess = new Chess(fen)
  return san.map((text) => {
    const move = chess.move(text)
    return {
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      san: move.san,
      color: move.color === 'w' ? 'white' : 'black',
      check: chess.inCheck(),
      fenAfter: move.after,
    }
  })
}

/** A position with everything a board needs; no moves are offered unless given. */
export function position(fen = START_FEN, overrides: Partial<Position> = {}): Position {
  return {
    fen,
    turn: fen.split(' ')[1] === 'b' ? 'black' : 'white',
    check: false,
    dests: {},
    promotions: [],
    ...overrides,
  }
}

/** A game under way, at the position after `moves`. */
export function gameState(overrides: Partial<GameState> = {}): GameState {
  const initialFen = overrides.initialFen ?? START_FEN
  const moves = overrides.moves ?? []
  return {
    id: 1,
    playerColor: 'white',
    engineLevel: 3,
    opponent: 'engine',
    startedAt: '2026-11-07T12:00:00.000Z',
    status: 'in_progress',
    result: '*',
    initialFen,
    moves,
    position: position(moves.at(-1)?.fenAfter ?? initialFen),
    opponentThinking: false,
    opponentFailed: false,
    ...overrides,
  }
}
