import type { PlayerProfile } from '@shared/profile'
import { api } from '../lib/api'
import { useMainState } from './useMainState'

/** What the app knows of how the player does; undefined until first told. */
export function useProfile(): PlayerProfile | undefined {
  return useMainState('profile:state', api.profile.get)
}
