// What the player chose last time, kept in the page's local storage. Anything stored that no
// longer fits (an old version, a hand edit) falls back to the defaults.
import type { SideChoice } from '@shared/chess'
import { SIDE_CHOICES } from '@shared/chess'
import { DEFAULT_ENGINE_LEVEL, isEngineLevel, type EngineLevelId } from '@shared/engine-levels'

export interface NewGameChoices {
  playerColor: SideChoice
  engineLevel: EngineLevelId
}

const KEY = 'new-game'
const DEFAULTS: NewGameChoices = { playerColor: 'white', engineLevel: DEFAULT_ENGINE_LEVEL }

function isSideChoice(value: unknown): value is SideChoice {
  return (SIDE_CHOICES as readonly unknown[]).includes(value)
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
  const { playerColor, engineLevel } = (saved ?? {}) as Record<string, unknown>
  return {
    playerColor: isSideChoice(playerColor) ? playerColor : DEFAULTS.playerColor,
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
