// How a game went, from the player's side.
import type { GameSummary, Termination } from '@shared/chess'

export type PlayerOutcome = 'won' | 'lost' | 'drawn' | 'unfinished' | 'in_progress'

type Ending = Pick<GameSummary, 'status' | 'result' | 'termination' | 'playerColor'>

export function playerOutcome({ status, result, playerColor }: Ending): PlayerOutcome {
  if (status === 'in_progress') return 'in_progress'
  if (status === 'abandoned' || result === '*') return 'unfinished'
  if (result === '1/2-1/2') return 'drawn'
  return (result === '1-0') === (playerColor === 'white') ? 'won' : 'lost'
}

const HOW: Record<Termination, string> = {
  checkmate: 'by checkmate',
  stalemate: 'by stalemate',
  insufficient_material: 'by insufficient material',
  threefold_repetition: 'by threefold repetition',
  fifty_moves: 'by the fifty-move rule',
  resignation: 'by resignation',
  abandoned: '',
}

/** "You won by checkmate", "You resigned", "Draw by stalemate", "Left unfinished". */
export function describeEnding(ending: Ending): string {
  const outcome = playerOutcome(ending)
  const how = ending.termination ? HOW[ending.termination] : ''
  switch (outcome) {
    case 'in_progress':
      return 'In progress'
    case 'unfinished':
      return 'Left unfinished'
    case 'drawn':
      return `Draw ${how}`.trim()
    case 'won':
      return ending.termination === 'resignation'
        ? 'Your opponent resigned'
        : `You won ${how}`.trim()
    case 'lost':
      return ending.termination === 'resignation' ? 'You resigned' : `You lost ${how}`.trim()
  }
}
