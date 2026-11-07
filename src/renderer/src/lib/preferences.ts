// What the player chose last time, kept in the page's local storage. Anything stored that no
// longer fits (an old version, a hand edit) falls back to the defaults.
import type { OpponentKind, SideChoice } from '@shared/chess'
import { OPPONENTS, SIDE_CHOICES } from '@shared/chess'
import { DEFAULT_ENGINE_LEVEL, isEngineLevel, type EngineLevelId } from '@shared/engine-levels'
import { PUZZLE_PIECES, PUZZLE_THEMES, type PuzzlePiece, type PuzzleTheme } from '@shared/training'

type Reader = Pick<Storage, 'getItem'>
type Writer = Pick<Storage, 'setItem'>

/** Whether `value` is one of `options`, as a type guard. */
function isOneOf<T>(options: readonly T[], value: unknown): value is T {
  return (options as readonly unknown[]).includes(value)
}

/** The fields saved under `key`, for `read` to check one by one; none if nothing usable is. */
function loadFields<T>(
  key: string,
  storage: Reader,
  read: (saved: Record<string, unknown>) => T,
): T {
  let saved: unknown
  try {
    saved = JSON.parse(storage.getItem(key) ?? 'null')
  } catch {
    saved = null
  }
  return read(typeof saved === 'object' && saved !== null ? (saved as Record<string, unknown>) : {})
}

export interface NewGameChoices {
  playerColor: SideChoice
  engineLevel: EngineLevelId
  opponent: OpponentKind
}

const NEW_GAME_KEY = 'new-game'
const NEW_GAME_DEFAULTS: NewGameChoices = {
  playerColor: 'white',
  engineLevel: DEFAULT_ENGINE_LEVEL,
  opponent: 'engine',
}

export function loadNewGameChoices(storage: Reader = localStorage): NewGameChoices {
  return loadFields(NEW_GAME_KEY, storage, ({ playerColor, engineLevel, opponent }) => ({
    playerColor: isOneOf(SIDE_CHOICES, playerColor) ? playerColor : NEW_GAME_DEFAULTS.playerColor,
    opponent: isOneOf(OPPONENTS, opponent) ? opponent : NEW_GAME_DEFAULTS.opponent,
    engineLevel:
      typeof engineLevel === 'number' && isEngineLevel(engineLevel)
        ? engineLevel
        : NEW_GAME_DEFAULTS.engineLevel,
  }))
}

export function saveNewGameChoices(choices: NewGameChoices, storage: Writer = localStorage): void {
  storage.setItem(NEW_GAME_KEY, JSON.stringify(choices))
}

/** The kind of puzzle the player last asked for; null means any. */
export interface PuzzleChoices {
  theme: PuzzleTheme | null
  piece: PuzzlePiece | null
}

const PUZZLE_KEY = 'puzzle'

export function loadPuzzleChoices(storage: Reader = localStorage): PuzzleChoices {
  return loadFields(PUZZLE_KEY, storage, ({ theme, piece }) => ({
    theme: isOneOf(PUZZLE_THEMES, theme) ? theme : null,
    piece: isOneOf(PUZZLE_PIECES, piece) ? piece : null,
  }))
}

export function savePuzzleChoices(choices: PuzzleChoices, storage: Writer = localStorage): void {
  storage.setItem(PUZZLE_KEY, JSON.stringify(choices))
}
