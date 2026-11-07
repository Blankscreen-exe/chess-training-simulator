import { moveAt } from '@shared/notation'

export interface SheetMove {
  san: string
  /** Its place in the game, counting from 1: the position after it is shown by going to it. */
  ply: number
}

export interface SheetRow {
  number: number
  white?: SheetMove
  black?: SheetMove
}

/**
 * Moves laid out as on a score sheet: one numbered row per move number, White's move then
 * Black's. A game set up with Black to move starts with White's half of its first row empty.
 */
export function scoreSheet(initialFen: string, moves: readonly { san: string }[]): SheetRow[] {
  const rows: SheetRow[] = []
  moves.forEach((move, index) => {
    const ply = index + 1
    const { number, color } = moveAt(initialFen, ply)
    let row = rows.at(-1)
    if (!row || row.number !== number) {
      row = { number }
      rows.push(row)
    }
    row[color] = { san: move.san, ply }
  })
  return rows
}
