import type { CoachStatus } from '@shared/coach'

/** How each status looks, and what the player should know while it lasts. */
export const COACH_STATUS: Record<CoachStatus, { label: string; dot: string; note?: string }> = {
  connected: { label: 'Connected', dot: 'bg-emerald-400' },
  offline: {
    label: 'Offline',
    dot: 'bg-stone-500',
    note: 'Claude Code is not connected. Messages you send will wait for it.',
  },
  paused: {
    label: 'Paused',
    dot: 'bg-amber-400',
    note: 'The coach paused after a quiet spell. Say "continue" in Claude Code to bring it back.',
  },
  unavailable: { label: 'Unavailable', dot: 'bg-red-500' },
}
