// The engine's view of positions, for the coach: what it shows before a move, what it judges after
// one, and what it chooses from as the opponent. It has its own engine, so it never waits on the
// analysis panel or the opponent, and remembers recent positions, as the same position is often
// asked about twice (shown before the player's move, judged after it).
import { Chess } from 'chess.js'
import type { Analysis, Color } from '@shared/chess'
import { assessMove, centipawnsFor, toAnalysis, type MoveAssessment } from '../analysis/evaluation'
import type { Engine, SearchLimits } from '../engine/engine'

/** Quick enough to keep up with the game, deep enough for a coach. */
const COACH_LIMITS: SearchLimits = { movetimeMs: 800, depth: 16 }
/** How many positions are remembered. */
const REMEMBERED = 64
/** What the side to move scores when it has been checkmated, and in stalemate. */
const CHECKMATED = -10_000
const STALEMATE = 0

/** What the coach needs of the engine; the session and the opponent ask no more of it. */
export type PositionAnalyst = Pick<CoachAnalyst, 'analyse' | 'assess'>

export class CoachAnalyst {
  private readonly cache = new Map<string, Analysis>()

  constructor(private readonly engine: () => Engine) {}

  /** The engine's best `lines` lines in a position. */
  async analyse(fen: string, lines: number): Promise<Analysis> {
    const known = this.cache.get(fen)
    if (known && known.lines.length >= Math.min(lines, legalMoveCount(fen))) return known
    const found = await this.engine().analyse(fen, { lines, limits: COACH_LIMITS })
    const analysis = toAnalysis(fen, found ?? { depth: 0, lines: [] })
    this.remember(fen, analysis)
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
  ): Promise<MoveAssessment | null> {
    const [beforeAnalysis, afterAnalysis] = [
      await this.analyse(before, 1),
      await this.analyse(after, 1),
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

  private remember(fen: string, analysis: Analysis): void {
    this.cache.delete(fen)
    this.cache.set(fen, analysis)
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
