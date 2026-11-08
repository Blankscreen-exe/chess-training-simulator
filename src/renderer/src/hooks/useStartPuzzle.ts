import { useState } from 'react'
import type { PuzzleStart } from '@shared/training'
import { api } from '../lib/api'

/** Starting a puzzle, showing it once it is on the board, and why it could not start if it could not. */
export function useStartPuzzle(onShow: () => void) {
  const [problem, setProblem] = useState<string | null>(null)
  const start = async (choice: PuzzleStart) => {
    const result = await api.puzzle.start(choice)
    setProblem(result.ok ? null : result.error)
    if (result.ok) onShow()
  }
  return { start, problem }
}
