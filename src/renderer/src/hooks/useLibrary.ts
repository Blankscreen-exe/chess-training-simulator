import type { LibraryState } from '@shared/training'
import { api } from '../lib/api'
import { useMainState } from './useMainState'

/** The puzzle and openings library, and any install under way; undefined until first told. */
export function useLibrary(): LibraryState | undefined {
  return useMainState('library:state', api.library.get)
}
