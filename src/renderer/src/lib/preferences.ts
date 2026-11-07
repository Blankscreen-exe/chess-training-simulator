// What the player chose last time, kept in the page's local storage. Anything stored that no
// longer fits (an old version, a hand edit) falls back to the defaults.
import type { OpponentKind, SideChoice } from '@shared/chess'
import { OPPONENTS, SIDE_CHOICES } from '@shared/chess'
import { DEFAULT_ENGINE_LEVEL, isEngineLevel, type EngineLevelId } from '@shared/engine-levels'

export interface NewGameChoices {
  playerColor: SideChoice
  engineLevel: EngineLevelId
  opponent: OpponentKind
}

const KEY = 'new-game'
const DEFAULTS: NewGameChoices = {
  playerColor: 'white',
  engineLevel: DEFAULT_ENGINE_LEVEL,
  opponent: 'engine',
}

/** Whether `value` is one of `options`, as a type guard. */
function isOneOf<T>(options: readonly T[], value: unknown): value is T {
  return (options as readonly unknown[]).includes(value)
}

export function loadNewGameChoices(
  storage: Pick<Storage, 'getItem'> = localStorage,
): NewGameChoices {
  let saved: unknown
  try {
    saved = JSON.parse(storage.getItem(KEY) ?? 'null')
  } catch {
    return DEFAULTS
  }
  const { playerColor, engineLevel, opponent } = (saved ?? {}) as Record<string, unknown>
  return {
    playerColor: isOneOf(SIDE_CHOICES, playerColor) ? playerColor : DEFAULTS.playerColor,
    opponent: isOneOf(OPPONENTS, opponent) ? opponent : DEFAULTS.opponent,
    engineLevel:
      typeof engineLevel === 'number' && isEngineLevel(engineLevel)
        ? engineLevel
        : DEFAULTS.engineLevel,
  }
}

export function saveNewGameChoices(
  choices: NewGameChoices,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(KEY, JSON.stringify(choices))
}
