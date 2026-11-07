// What the engine thinks of a position, as the app shows it. Each new request ends the one before
// it, so the panel always shows the position on the board, not one the player has left.
import type { Analysis, AnalysisRequest, Color, Result, Score } from '@shared/chess'
import { MAX_ANALYSIS_LINES } from '@shared/chess'
import { splitFen } from '@shared/notation'
import { normalizeFen, sanLine } from '../chess/rules'
import type { Engine, SearchLimits } from '../engine/engine'
import type { UciScore } from '../engine/uci'

/** How long, and how deep, one analysis goes. */
const ANALYSIS_LIMITS: SearchLimits = { movetimeMs: 1500, depth: 20 }

export class AnalysisService {
  /** Numbers each request, so only the newest one's answer is used. */
  private latest = 0

  constructor(private readonly engine: () => Engine) {}

  /** The engine's best lines; `analysis` is null when a newer request took its place. */
  async analyse(request: AnalysisRequest): Promise<Result<{ analysis: Analysis | null }>> {
    const normalized = normalizeFen(request.fen)
    if (!normalized.ok) return normalized
    const { fen } = normalized
    const lines = Math.min(Math.max(1, Math.trunc(request.lines)), MAX_ANALYSIS_LINES)

    const id = ++this.latest
    const engine = this.engine()
    engine.stop()
    const found = await engine.analyse(fen, {
      lines,
      limits: ANALYSIS_LIMITS,
      stillWanted: () => id === this.latest,
    })
    if (!found || id !== this.latest) return { ok: true, analysis: null }

    const { turn } = splitFen(fen)
    return {
      ok: true,
      analysis: {
        fen,
        depth: found.depth,
        lines: found.lines.map((line) => ({
          rank: line.multipv,
          depth: line.depth,
          score: fromWhite(line.score, turn),
          uci: line.pv,
          san: sanLine(fen, line.pv),
        })),
      },
    }
  }
}

/** A score from the side to move, turned to White's side. */
export function fromWhite(score: UciScore, turn: Color): Score {
  const value = turn === 'white' ? score.value : -score.value
  // Avoid -0, which would show as "−0.00".
  return { type: score.type, value: value === 0 ? 0 : value }
}
