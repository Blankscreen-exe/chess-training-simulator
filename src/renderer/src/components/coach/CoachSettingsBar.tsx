import type { CoachSettings } from '@shared/coach'
import {
  COACHING_MODE_NAMES,
  COACHING_MODES,
  PLAYER_LEVEL_NAMES,
  PLAYER_LEVELS,
} from '@shared/coach'
import { api } from '../../lib/api'

const MODE_HINTS: Record<CoachSettings['mode'], string> = {
  guided: 'Shows your options before each move, and says how each went',
  casual: 'Describes your options, and never judges your moves',
  blunder_watch: 'Speaks up only when you make a mistake',
  silent: 'Says nothing about the game unless you ask',
}

/** How closely the coach follows the game, and how much chess the player knows. */
export function CoachSettingsBar({ settings }: { settings: CoachSettings }) {
  const change = (update: Partial<CoachSettings>) => void api.coach.setSettings(update)

  return (
    <div className="grid grid-cols-2 gap-2 border-b border-stone-800 px-4 py-2.5 text-xs text-stone-400">
      <label className="space-y-1" title={MODE_HINTS[settings.mode]}>
        <span>Coaching</span>
        <select
          className="w-full rounded bg-stone-800 px-2 py-1 text-sm text-stone-200"
          value={settings.mode}
          onChange={(event) => change({ mode: event.target.value as CoachSettings['mode'] })}
        >
          {COACHING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {COACHING_MODE_NAMES[mode]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span>Your level</span>
        <select
          className="w-full rounded bg-stone-800 px-2 py-1 text-sm text-stone-200"
          value={settings.playerLevel}
          onChange={(event) =>
            change({ playerLevel: event.target.value as CoachSettings['playerLevel'] })
          }
        >
          {PLAYER_LEVELS.map((level) => (
            <option key={level} value={level}>
              {PLAYER_LEVEL_NAMES[level]}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
