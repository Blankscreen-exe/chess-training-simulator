// Reading what a UCI engine says. Only the parts the app uses are read.

/** A score as the engine gives it: from the side to move. */
export type UciScore = { type: 'cp' | 'mate'; value: number }

/** One `info` line about a line of play the engine is searching. */
export interface UciInfo {
  depth: number
  multipv: number
  score: UciScore
  /** Whether the score is only a bound, which engines send while still searching. */
  bound: boolean
  pv: string[]
}

/**
 * Reads an `info` line that carries a scored line of play. Others, such as `info string` or
 * `info currmove`, give null.
 */
export function parseInfo(line: string): UciInfo | null {
  if (!line.startsWith('info ') || line.startsWith('info string')) {
    return null
  }
  const tokens = line.split(' ')
  let depth: number | undefined
  let multipv = 1
  let score: UciScore | undefined
  let bound = false
  let pv: string[] = []

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]
    switch (token) {
      case 'depth':
        depth = Number(tokens[++i])
        break
      case 'multipv':
        multipv = Number(tokens[++i])
        break
      case 'score': {
        const type = tokens[++i]
        const value = Number(tokens[++i])
        if ((type === 'cp' || type === 'mate') && Number.isFinite(value)) {
          score = { type, value }
        }
        if (tokens[i + 1] === 'lowerbound' || tokens[i + 1] === 'upperbound') {
          bound = true
          i++
        }
        break
      }
      case 'pv':
        pv = tokens.slice(i + 1).filter(Boolean)
        i = tokens.length
        break
    }
  }

  if (depth === undefined || !Number.isFinite(depth) || !score || pv.length === 0) {
    return null
  }
  return { depth, multipv, score, bound, pv }
}

/**
 * Reads a `bestmove` line: the move, or null when the engine has none to play (`(none)`, as in a
 * position that is already mate or stalemate). Returns undefined for any other line.
 */
export function parseBestMove(line: string): string | null | undefined {
  if (!line.startsWith('bestmove')) {
    return undefined
  }
  const move = line.split(' ')[1]
  return !move || move === '(none)' || move === '0000' ? null : move
}
