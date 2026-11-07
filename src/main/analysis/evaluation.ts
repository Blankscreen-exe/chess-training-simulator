// Turning what the engine says into what the app shows and the coach reads: scores from White's
// side, lines in standard notation, and how good a move was.
import type { Analysis, Color, Score } from '@shared/chess'
import { splitFen } from '@shared/notation'
import { sanLine } from '../chess/rules'
import type { EngineAnalysis } from '../engine/engine'
import type { UciScore } from '../engine/uci'

/** A score from the side to move, turned to White's side. */
export function fromWhite(score: UciScore, turn: Color): Score {
  const value = turn === 'white' ? score.value : -score.value
  // Avoid -0, which would show as "−0.00".
  return { type: score.type, value: value === 0 ? 0 : value }
}

/** The engine's lines for `fen`, as the app shows them. */
export function toAnalysis(fen: string, found: EngineAnalysis): Analysis {
  const { turn } = splitFen(fen)
  return {
    fen,
    depth: found.depth,
    lines: found.lines.map((line) => ({
      rank: line.multipv,
      depth: line.depth,
      score: fromWhite(line.score, turn),
      uci: line.pv,
      san: sanLine(fen, line.pv),
    })),
  }
}

/** Centipawns a forced mate counts as, less one per move it takes, so a quicker mate is better. */
const MATE_CENTIPAWNS = 10_000

/** A score (from White's side) as centipawns from `color`'s side. */
export function centipawnsFor(score: Score, color: Color): number {
  const forWhite =
    score.type === 'cp'
      ? score.value
      : Math.sign(score.value) * (MATE_CENTIPAWNS - Math.abs(score.value))
  const value = color === 'white' ? forWhite : -forWhite
  return value === 0 ? 0 : value
}

/** The chance of winning, from 0 to 100, for a lead in centipawns: the curve Lichess uses. */
export function winningChances(centipawns: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1)
}

export const MOVE_QUALITIES = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'] as const
export type MoveQuality = (typeof MOVE_QUALITIES)[number]

/** How many points of winning chances a move may give away before it counts as each. */
const QUALITY_THRESHOLDS: readonly [MoveQuality, number][] = [
  ['blunder', 30],
  ['mistake', 20],
  ['inaccuracy', 10],
]

export interface MoveAssessment {
  quality: MoveQuality
  /** Points of winning chances given away, from 0 to 100. */
  chances_lost: number
  /** Centipawns given away, from the player's side. */
  centipawns_lost: number
  /** The engine's choice, in standard notation. */
  best_move: string
}

/**
 * How good a move was, by how much of its player's winning chances it gave away compared with
 * the engine's best move. Moves are in UCI; scores are from the player's side, in centipawns:
 * `best` before the move, `after` once it was made.
 */
export function assessMove(move: {
  played: string
  best: { uci: string; san: string; centipawns: number }
  after: number
}): MoveAssessment {
  const lost = Math.max(0, winningChances(move.best.centipawns) - winningChances(move.after))
  const quality: MoveQuality =
    move.played === move.best.uci
      ? 'best'
      : (QUALITY_THRESHOLDS.find(([, threshold]) => lost >= threshold)?.[0] ?? 'good')
  return {
    quality,
    chances_lost: Math.round(lost),
    centipawns_lost: Math.max(0, Math.round(move.best.centipawns - move.after)),
    best_move: move.best.san,
  }
}

/** A score in words, for the coach: "+0.35, White is better", "mate in 3 for Black". */
export function describeScore(score: Score): string {
  if (score.type === 'mate') {
    if (score.value === 0) return 'checkmate'
    return `mate in ${Math.abs(score.value)} for ${score.value > 0 ? 'White' : 'Black'}`
  }
  const pawns = (score.value / 100).toFixed(2)
  if (Math.abs(score.value) < 25) return `${score.value >= 0 ? '+' : ''}${pawns}, about level`
  return `${score.value > 0 ? '+' : ''}${pawns}, ${score.value > 0 ? 'White' : 'Black'} is better`
}
