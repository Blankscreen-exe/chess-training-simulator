import type { Analysis } from '@shared/chess'
import { api } from '../lib/api'
import { useQuery } from './useQuery'

export interface AnalysisSettings {
  /** Whether the engine's lines are shown. */
  enabled: boolean
  /** How many candidate lines to ask for. */
  lines: number
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = { enabled: false, lines: 3 }

/** Stepping quickly through moves asks the engine only about the one the player stops on. */
const SETTLE_MS = 150

/** The engine's lines for `fen`, or nothing while `fen` is null. */
export function useAnalysis(fen: string | null, lines: number) {
  const query = useQuery(
    `${fen}|${lines}`,
    fen === null
      ? null
      : async (): Promise<Analysis | null> => {
          const result = await api.analysis.run({ fen, lines })
          if (!result.ok) throw new Error(result.error)
          return result.analysis
        },
    { delayMs: SETTLE_MS },
  )
  return {
    analysis: query.data ?? null,
    // A null analysis means a newer request took this one's place: still being worked out.
    running: query.loading || query.data === null,
    error: query.error,
  }
}
