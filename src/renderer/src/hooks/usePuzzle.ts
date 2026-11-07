import type { PuzzleState } from '@shared/training'
import { api } from '../lib/api'
import { useMainState } from './useMainState'

/** The puzzle on the board, as the main process last told it; null when there is none. */
export function usePuzzle(): PuzzleState | null {
  return useMainState('puzzle:state', api.puzzle.get) ?? null
}
