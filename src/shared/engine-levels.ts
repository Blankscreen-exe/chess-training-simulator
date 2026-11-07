// The strengths the engine can play at. The main process turns each into Stockfish settings
// (src/main/engine/levels.ts), keyed by the same ids, so a level cannot exist on one side only.

export const ENGINE_LEVEL_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const
export type EngineLevelId = (typeof ENGINE_LEVEL_IDS)[number]

export interface EngineLevel {
  id: EngineLevelId
  /** Who this level suits. */
  summary?: string
  /** Its rough rating, where Stockfish can be set to one. */
  elo?: number
}

/** Weakest first. */
export const ENGINE_LEVELS: readonly EngineLevel[] = [
  { id: 1, summary: 'Just learning how the pieces move' },
  { id: 2, summary: 'Knows the rules, still drops pieces' },
  { id: 3, summary: 'Casual player' },
  { id: 4, summary: 'Club beginner', elo: 1350 },
  { id: 5, elo: 1600 },
  { id: 6, elo: 1900 },
  { id: 7, elo: 2300 },
  { id: 8, summary: 'Full strength' },
]

export const DEFAULT_ENGINE_LEVEL: EngineLevelId = 3

export function isEngineLevel(value: number): value is EngineLevelId {
  return (ENGINE_LEVEL_IDS as readonly number[]).includes(value)
}

export function engineLevel(id: EngineLevelId): EngineLevel {
  const level = ENGINE_LEVELS.find((known) => known.id === id)
  if (!level) throw new Error(`There is no engine level ${id}`)
  return level
}

export function engineLevelName(id: EngineLevelId): string {
  return `Level ${id}`
}

/** "Club beginner, about 1350", "About 1600" or "Casual player". */
export function engineLevelDescription(id: EngineLevelId): string {
  const { summary, elo } = engineLevel(id)
  if (summary && elo) return `${summary}, about ${elo}`
  if (elo) return `About ${elo}`
  return summary ?? ''
}
