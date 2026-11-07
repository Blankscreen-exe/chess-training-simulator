import { useEffect, type Dispatch } from 'react'
import { api } from '../lib/api'
import { actionFor, type BoardAction } from '../state/boardView'

/** Carries out what the coach asks of the board: previews, positions to look at, the game. */
export function useCoachCommands(dispatch: Dispatch<BoardAction>): void {
  useEffect(() => api.on('coach:board', (command) => dispatch(actionFor(command))), [dispatch])
}
