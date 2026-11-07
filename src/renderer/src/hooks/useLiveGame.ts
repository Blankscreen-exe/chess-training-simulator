import type { GameState } from '@shared/chess'
import { api } from '../lib/api'
import { useMainState } from './useMainState'

/** The game being played, as the main process last told it; null when there is none. */
export function useLiveGame(): GameState | null {
  return useMainState('game:state', api.game.get) ?? null
}
