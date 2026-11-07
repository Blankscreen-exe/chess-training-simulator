// Helpers for the coach's tests.
import type { CoachSettings } from '@shared/coach'
import { DEFAULT_COACH_SETTINGS } from '@shared/coach'
import { CoachHub, type CoachTimings, type SettingsKeeper } from './hub'

/** Settings kept in memory, remembering what was saved. */
export function memoryKeeper(initial: CoachSettings = DEFAULT_COACH_SETTINGS) {
  const saved: CoachSettings[] = []
  const keeper: SettingsKeeper = { load: () => initial, save: (settings) => saved.push(settings) }
  return { keeper, saved }
}

/** Short enough that reading an empty queue in a test returns at once. */
export const QUICK_TIMINGS: CoachTimings = {
  waitMs: 10,
  connectedWithinMs: 60_000,
  idleMs: 600_000,
}

/** A hub with settings in memory and quick timings, connected unless told otherwise. */
export function testHub(
  options: { settings?: CoachSettings; timings?: CoachTimings; connected?: boolean } = {},
): CoachHub {
  const hub = new CoachHub({
    port: 0,
    settings: memoryKeeper(options.settings).keeper,
    timings: options.timings ?? QUICK_TIMINGS,
  })
  if (options.connected ?? true) hub.touch()
  return hub
}
