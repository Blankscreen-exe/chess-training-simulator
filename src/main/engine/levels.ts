// How each strength the player can choose is set up on Stockfish. A level's rating comes from the
// shared table (src/shared/engine-levels.ts), so it is written once, and this table must have an
// entry for every level there, which the compiler checks.
//
// Stockfish's UCI_Elo goes no lower than 1320, so the levels without a rating use its Skill Level
// with a shallow search instead.
import { engineLevel, type EngineLevelId } from '@shared/engine-levels'

export interface PlaySettings {
  /** UCI_Elo, with UCI_LimitStrength on; without it, Skill Level alone decides. */
  elo?: number
  /** Skill Level, 0 to 20. */
  skill: number
  /** The deepest the search may go. */
  depth?: number
  /** How long the engine thinks, in milliseconds. */
  movetimeMs: number
}

const SEARCH = {
  1: { skill: 0, depth: 1, movetimeMs: 50 },
  2: { skill: 3, depth: 3, movetimeMs: 100 },
  3: { skill: 6, depth: 5, movetimeMs: 200 },
  4: { skill: 20, movetimeMs: 300 },
  5: { skill: 20, movetimeMs: 400 },
  6: { skill: 20, movetimeMs: 500 },
  7: { skill: 20, movetimeMs: 700 },
  8: { skill: 20, movetimeMs: 1000 },
} as const satisfies Record<EngineLevelId, Omit<PlaySettings, 'elo'>>

export function playSettings(level: EngineLevelId): PlaySettings {
  const { elo } = engineLevel(level)
  return { ...SEARCH[level], ...(elo !== undefined ? { elo } : {}) }
}
