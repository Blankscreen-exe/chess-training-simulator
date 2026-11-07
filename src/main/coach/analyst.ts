// The engine's view of positions, for the coach: what it shows before a move, what it judges after
// one, and what it chooses from as the opponent. It has its own engine, so it never waits on the
// analysis panel or the opponent, and remembers recent positions, as the same position is often
// asked about twice (shown before the player's move, judged after it).
import { Chess } from 'chess.js'
import type { Analysis, Color } from '@shared/chess'
import { assessMove, centipawnsFor, toAnalysis, type MoveAssessment } from '../analysis/evaluation'
import type { Engine, SearchLimits } from '../engine/engine'

/** Quick enough to keep up with the game, deep enough for a coach. */
export const COACH_LIMITS: SearchLimits = { movetimeMs: 800, depth: 16 }
/** For going over many positions at once, as a review of a whole game does. */
export const REVIEW_LIMITS: SearchLimits = { movetimeMs: 300, depth: 14 }
/** How many positions are remembered. */
const REMEMBERED = 64
/** What the side to move scores when it has been checkmated, and in stalemate. */
const CHECKMATED = -10_000
const STALEMATE = 0

/** What the coach needs of the engine; the session and the opponent ask no more of it. */
export type PositionAnalyst = Pick<CoachAnalyst, 'analyse' | 'assess'>

export class CoachAnalyst {
  /** Each position's latest analysis, and how long the engine had for it. */
  private readonly cache = new Map<string, { analysis: Analysis; movetimeMs: number }>()

  constructor(private readonly engine: () => Engine) {}

  /**
   * The engine's best `lines` lines in a position. One remembered is used again if it has as
   * many lines, and the engine had at least as long for it.
   */
  async analyse(fen: string, lines: number, limits = COACH_LIMITS): Promise<Analysis> {
    const known = this.cache.get(fen)
    if (
      known &&
      known.movetimeMs >= limits.movetimeMs &&
      known.analysis.lines.length >= Math.min(lines, legalMoveCount(fen))
    )
      return known.analysis
    const found = await this.engine().analyse(fen, { lines, limits })
    const analysis = toAnalysis(fen, found ?? { depth: 0, lines: [] })
    this.remember(fen, { analysis, movetimeMs: limits.movetimeMs })
    return analysis
  }

  /**
   * How good `player`'s move from `before` to `after` was, compared with the engine's best move;
   * null if there was nothing to compare with (no legal moves before).
   */
  async assess(
    before: string,
    move: string,
    after: string,
    player: Color,
    limits = COACH_LIMITS,
  ): Promise<MoveAssessment | null> {
    const [beforeAnalysis, afterAnalysis] = [
      await this.analyse(before, 1, limits),
      await this.analyse(after, 1, limits),
    ]
    const best = beforeAnalysis.lines[0]
    const bestMove = best?.uci[0]
    if (!best || !bestMove) return null
    const reply = afterAnalysis.lines[0]
    return assessMove({
      played: move,
      best: {
        uci: bestMove,
        san: best.san[0] ?? bestMove,
        centipawns: centipawnsFor(best.score, player),
      },
      after: reply ? centipawnsFor(reply.score, player) : -endScore(after),
    })
  }

  private remember(fen: string, entry: { analysis: Analysis; movetimeMs: number }): void {
    this.cache.delete(fen)
    this.cache.set(fen, entry)
    if (this.cache.size > REMEMBERED) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
  }
}

function legalMoveCount(fen: string): number {
  return new Chess(fen).moves().length
}

/** The score, for the side to move, of a position with no legal moves. */
function endScore(fen: string): number {
  return new Chess(fen).isCheckmate() ? CHECKMATED : STALEMATE
}
