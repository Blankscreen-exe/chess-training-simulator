// Reading Lichess's openings (https://github.com/lichess-org/chess-openings, CC0): tab-separated
// files of ECO code, name and moves. Each line is played through, so the library keeps the moves
// in the app's notation and the position reached, by which a game's opening is recognised
// however its moves came about.
import { Chess } from 'chess.js'
import type { Opening } from '@shared/training'

export interface LibraryOpening extends Opening {
  /** The position reached, as `positionKey` gives it. */
  position: string
}

const HEADER = ['eco', 'name', 'pgn']

/**
 * A position without its move counters (the first four fields of its FEN), so that the same
 * position reached in a different number of moves is recognised as the same.
 */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

/** The openings in one of the files; throws if it is not laid out as expected. */
export function readOpenings(tsv: string): LibraryOpening[] {
  const [header = '', ...rows] = tsv.split('\n')
  if (header.trim().split('\t').join() !== HEADER.join())
    throw new Error('The openings file is not laid out as expected')

  return rows.flatMap((row) => {
    const [eco, name, pgn] = row.trim().split('\t')
    if (!eco || !name || !pgn) return []
    const chess = new Chess()
    try {
      chess.loadPgn(pgn)
    } catch {
      return []
    }
    return [{ eco, name, moves: chess.history(), position: positionKey(chess.fen()) }]
  })
}
