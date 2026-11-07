import type { CoachState } from '@shared/coach'
import { api } from '../lib/api'
import { useMainState } from './useMainState'

/** The coach's connection and the chat, as the main process last told them. */
export function useCoach(): CoachState | undefined {
  return useMainState('coach:state', api.coach.get)
}
