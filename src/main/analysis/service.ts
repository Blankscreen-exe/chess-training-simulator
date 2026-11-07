// What the engine thinks of a position, for the analysis panel. Each new request ends the one
// before it, so the panel always shows the position on the board, not one the player has left.
import type { Analysis, AnalysisRequest, Result } from '@shared/chess'
import { MAX_ANALYSIS_LINES } from '@shared/chess'
import { normalizeFen } from '../chess/rules'
import type { Engine, SearchLimits } from '../engine/engine'
import { toAnalysis } from './evaluation'

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
    return { ok: true, analysis: toAnalysis(fen, found) }
  }
}
