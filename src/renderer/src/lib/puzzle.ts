// How a puzzle is described to the player.
import type { PuzzleState } from '@shared/training'
import { themeName } from '@shared/training'
import { count } from './words'

const SIDE = { white: 'White', black: 'Black' } as const

/** What the puzzle is: the coach's title for it, where a position to practise comes from, or its rating. */
export function puzzleName(puzzle: PuzzleState): string {
  if (puzzle.title) return puzzle.title
  if (puzzle.practice) {
    return puzzle.practice.from === 'game'
      ? 'Practice: a position from your game'
      : 'Practice: a puzzle you missed'
  }
  return puzzle.rating === null ? 'Puzzle' : `Puzzle rated ${puzzle.rating}`
}

/** A line saying what the puzzle is and how it stands, as the banner over the board shows it. */
export function puzzleHeading(puzzle: PuzzleState): string {
  const name = puzzleName(puzzle)
  switch (puzzle.status) {
    case 'solving':
      return `${name} — find the best move for ${SIDE[puzzle.playerColor]}`
    case 'solved':
      return `${name} — solved`
    case 'revealed':
      return `${name} — the answer`
  }
}

/** What the player is told about how they are doing. */
export function puzzleProgress(puzzle: PuzzleState): string {
  switch (puzzle.status) {
    case 'solving':
      if (puzzle.wrongMove) return `${puzzle.wrongMove} is not it. Try again.`
      if (puzzle.found > 0)
        return `Right! ${puzzle.found} of ${puzzle.solutionLength} moves found. Keep going.`
      return puzzle.solutionLength > 1
        ? `${SIDE[puzzle.playerColor]} to play and win: the answer is ${puzzle.solutionLength} moves long.`
        : `${SIDE[puzzle.playerColor]} to play and win, in one move.`
    case 'solved':
      return puzzle.mistakes === 0 && puzzle.hints === 0
        ? 'Solved, first time.'
        : `Solved, with ${count(puzzle.mistakes, 'wrong try', 'wrong tries')} and ${count(puzzle.hints, 'hint')}.`
    case 'revealed':
      return 'Here is the answer, played out.'
  }
}

/** For a position from the player's game, what they played there; null for any other puzzle. */
export function practiceNote(puzzle: PuzzleState): string | null {
  return puzzle.practice?.from === 'game'
    ? `In the game you played ${puzzle.practice.played} here.`
    : null
}

/** The puzzle's themes by name, which say what its idea is, so are shown only once it is over. */
export function puzzleThemes(puzzle: PuzzleState): string[] {
  return puzzle.status === 'solving' ? [] : puzzle.themes.map(themeName)
}
