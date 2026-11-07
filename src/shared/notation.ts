// Reading and writing chess notation: squares, UCI moves and the fields of a FEN. None of this
// knows the rules; chess.js in the main process does that.
import type { Color, MoveInput, PromotionPiece } from './chess'
import { PROMOTION_PIECES } from './chess'

export const SQUARE_PATTERN = /^[a-h][1-8]$/
export const UCI_MOVE_PATTERN = new RegExp(
  `^([a-h][1-8])([a-h][1-8])([${PROMOTION_PIECES.join('')}])?$`,
)

/** Reads a move in UCI notation, or returns null if it is not one. */
export function parseUci(uci: string): MoveInput | null {
  const match = UCI_MOVE_PATTERN.exec(uci)
  if (!match?.[1] || !match[2]) return null
  const move: MoveInput = { from: match[1], to: match[2] }
  if (match[3]) move.promotion = match[3] as PromotionPiece
  return move
}

export function toUci(move: { from: string; to: string; promotion?: string | undefined }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

/** The two squares of a UCI move, as the board highlights them. */
export function uciSquares(uci: string): [from: string, to: string] {
  return [uci.slice(0, 2), uci.slice(2, 4)]
}

/** The six fields of a FEN. */
export interface FenFields {
  placement: string
  turn: Color
  /** 'KQkq', a subset of it, or '' for none. */
  castling: string
  enPassant: string
  halfmoves: number
  fullmoves: number
}

/** Splits a FEN into its fields, filling in any that are missing. It does not check them. */
export function splitFen(fen: string): FenFields {
  const [placement = '8/8/8/8/8/8/8/8', turn = 'w', castling = '-', enPassant = '-', half, full] =
    fen.trim().split(/\s+/)
  return {
    placement,
    turn: turn === 'b' ? 'black' : 'white',
    castling: castling === '-' ? '' : castling,
    enPassant,
    halfmoves: Number(half) || 0,
    fullmoves: Number(full) || 1,
  }
}

export function joinFen(fields: FenFields): string {
  return [
    fields.placement,
    fields.turn === 'white' ? 'w' : 'b',
    fields.castling || '-',
    fields.enPassant,
    fields.halfmoves,
    fields.fullmoves,
  ].join(' ')
}

/** Where a line of moves from `fen` begins: its move number, and whether Black moves first. */
export function lineStart(fen: string): { number: number; blackFirst: boolean } {
  const { turn, fullmoves } = splitFen(fen)
  return { number: fullmoves, blackFirst: turn === 'black' }
}

/** The `ply`th move after `fen`, counting from 1: its move number, and which side makes it. */
export function moveAt(fen: string, ply: number): { number: number; color: Color } {
  const { number, blackFirst } = lineStart(fen)
  const half = ply - 1 + (blackFirst ? 1 : 0)
  return { number: number + Math.floor(half / 2), color: half % 2 === 0 ? 'white' : 'black' }
}

/** The `ply`th move after `fen` with its number: "12. Nf3" for White, "12… Nc6" for Black. */
export function numberedMove(fen: string, ply: number, san: string): string {
  const { number, color } = moveAt(fen, ply)
  return `${number}${color === 'white' ? '.' : '…'} ${san}`
}

/** A line with move numbers, as chess players write it: "12. Nf3 Nc6 13. d4", "12… Nc6 13. d4". */
export function numberedLine(fen: string, san: readonly string[]): string {
  return san
    .map((move, index) =>
      index === 0 || moveAt(fen, index + 1).color === 'white'
        ? numberedMove(fen, index + 1, move)
        : move,
    )
    .join(' ')
}
