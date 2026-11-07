// Turning the app's plain strings into chessground's types. chessground names squares with a
// narrower string type; the main process only ever sends real squares.
import type { DrawShape } from '@lichess-org/chessground/draw'
import type { Dests, Key } from '@lichess-org/chessground/types'
import type { AnalysisLine } from '@shared/chess'
import { uciSquares } from '@shared/notation'

export function toKey(square: string): Key {
  return square as Key
}

export function toDests(dests: Record<string, string[]>): Dests {
  return new Map(Object.entries(dests).map(([from, to]) => [toKey(from), to.map(toKey)]))
}

/** An arrow for the first move of each engine line: the best one green, the others thinner. */
export function lineArrows(lines: readonly AnalysisLine[]): DrawShape[] {
  return lines.flatMap((line) => {
    const first = line.uci[0]
    if (!first) return []
    const [from, to] = uciSquares(first)
    const best = line.rank === 1
    return [
      {
        orig: toKey(from),
        dest: toKey(to),
        brush: best ? 'green' : 'blue',
        ...(best ? {} : { modifiers: { lineWidth: 6 } }),
      },
    ]
  })
}
