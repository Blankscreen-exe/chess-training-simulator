// How the player's profile is put into words.
import { RATED_AFTER, type PracticeRecord, type PuzzleRecord } from '@shared/profile'
import { count, dayName } from './words'

/** What is waiting to be practised. */
export function describePractice({ due, waiting, learned, nextDue }: PracticeRecord): string {
  if (due + waiting + learned === 0) {
    return 'Puzzles you miss, and the worst mistakes in your games, come back here to practise, spaced out over days.'
  }
  const now =
    due > 0
      ? `${count(due, 'position')} to practise now.`
      : `Nothing to practise now.${nextDue ? ` The next comes back on ${dayName(nextDue)}.` : ''}`
  const later =
    due > 0 && waiting > 0 ? ` ${waiting} more ${waiting === 1 ? 'comes' : 'come'} back later.` : ''
  const done = learned > 0 ? ` ${learned} learned.` : ''
  return now + later + done
}

/** The player's puzzle rating, or how far they are from having one. */
export function describeRating({ rating, tries }: PuzzleRecord): string {
  if (rating !== null) return `Puzzle rating ${rating}`
  return `Not rated yet: ${count(RATED_AFTER - tries, 'more puzzle')} to go.`
}

/** How often the player solves puzzles first time. */
export function describeSolved({ tries, solved }: PuzzleRecord): string | null {
  if (tries === 0) return null
  return `Solved first time: ${solved} of ${tries} (${Math.round((solved / tries) * 100)}%).`
}

/** How often the coach has noted a weakness: "once", "twice", "5 times". */
export function timesNoted(seen: number): string {
  if (seen === 1) return 'once'
  return seen === 2 ? 'twice' : `${seen} times`
}
