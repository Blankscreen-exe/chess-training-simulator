// The rules of chess, by way of chess.js. Everything else in the main process asks here whether a
// position or a move is legal, and what follows from it.
import { Chess, validateFen, type Move, type Square } from 'chess.js'
import type {
  Color,
  GameResult,
  LineStep,
  MoveInput,
  PlayedMove,
  Position,
  Result,
  Termination,
} from '@shared/chess'
import { joinFen, parseUci, splitFen, toUci } from '@shared/notation'

export function colorOf(turn: 'w' | 'b'): Color {
  return turn === 'w' ? 'white' : 'black'
}

/** The position chess.js is in, with the moves that can be made in it. */
export function describePosition(chess: Chess, lastMove?: Move): Position {
  const dests: Record<string, string[]> = {}
  const promotions = new Set<string>()
  for (const move of chess.moves({ verbose: true })) {
    ;(dests[move.from] ??= []).push(move.to)
    if (move.isPromotion()) promotions.add(`${move.from}${move.to}`)
  }
  for (const targets of Object.values(dests)) targets.sort()

  const position: Position = {
    fen: chess.fen(),
    turn: colorOf(chess.turn()),
    check: chess.inCheck(),
    dests,
    promotions: [...promotions].sort(),
  }
  if (lastMove) position.lastMove = [lastMove.from, lastMove.to]
  return position
}

/** A move as it is recorded in a game. */
export function toPlayedMove(move: Move): PlayedMove {
  return {
    uci: toUci(move),
    san: move.san,
    color: colorOf(move.color),
    // Standard notation ends a checking move with + or #.
    check: /[+#]$/.test(move.san),
    fenAfter: move.after,
  }
}

/**
 * Checks a position typed or set up by someone, and returns it in standard form. On top of what
 * chess.js checks, the side that is not to move must not be in check, and castling rights are
 * dropped where the king or rook is not on its starting square.
 */
export function normalizeFen(fen: string): Result<{ fen: string }> {
  const trimmed = fen.trim().replace(/\s+/g, ' ')
  const checked = validateFen(trimmed)
  if (!checked.ok) {
    return { ok: false, error: (checked.error ?? 'Invalid FEN').replace(/^Invalid FEN: /, '') }
  }

  const fields = splitFen(trimmed)
  const chess = new Chess(
    joinFen({ ...fields, castling: possibleCastling(fields.placement, fields.castling) }),
  )

  // With the other side to move, could it capture the king? Then the position cannot happen.
  const otherSideToMove = joinFen({
    ...splitFen(chess.fen()),
    turn: fields.turn === 'white' ? 'black' : 'white',
    enPassant: '-',
  })
  if (new Chess(otherSideToMove, { skipValidation: true }).inCheck()) {
    const inCheck = fields.turn === 'white' ? 'Black' : 'White'
    return { ok: false, error: `${inCheck} is in check but it is not their move` }
  }
  return { ok: true, fen: chess.fen() }
}

/** The castling rights the pieces allow, of those asked for. */
function possibleCastling(placement: string, rights: string): string {
  const board = new Chess(`${placement} w - - 0 1`, { skipValidation: true })
  const has = (square: Square, type: string, color: 'w' | 'b'): boolean => {
    const piece = board.get(square)
    return piece?.type === type && piece.color === color
  }
  const allowed: Record<string, boolean> = {
    K: has('e1', 'k', 'w') && has('h1', 'r', 'w'),
    Q: has('e1', 'k', 'w') && has('a1', 'r', 'w'),
    k: has('e8', 'k', 'b') && has('h8', 'r', 'b'),
    q: has('e8', 'k', 'b') && has('a8', 'r', 'b'),
  }
  return [...rights].filter((right) => allowed[right]).join('')
}

/** The position from a FEN, checked, with the moves that can be made in it. */
export function describeFen(fen: string): Result<{ position: Position }> {
  const normalized = normalizeFen(fen)
  if (!normalized.ok) return normalized
  return { ok: true, position: describePosition(new Chess(normalized.fen)) }
}

/** Plays a move on chess.js, returning the move or null if it is not legal there. */
export function tryMove(chess: Chess, move: MoveInput): Move | null {
  try {
    return chess.move({
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    })
  } catch {
    return null
  }
}

/**
 * Plays a move written in UCI ('g1f3', as the board and engine write them) or in standard
 * notation ('Nf3', as people and Claude do), returning it, or null if it is neither or not legal.
 */
export function tryMoveText(chess: Chess, text: string): Move | null {
  const trimmed = text.trim()
  const uci = parseUci(trimmed)
  if (uci) return tryMove(chess, uci)
  try {
    return chess.move(trimmed, { strict: false })
  } catch {
    return null
  }
}

/**
 * Plays a line of moves (in UCI or standard notation) on chess.js, in order, stopping at the
 * first that is not legal. The moves played are returned, and the one that stopped it, if any.
 * `afterEach` sees each move with chess.js in the position it leads to.
 */
export function replay(
  chess: Chess,
  moves: readonly string[],
  afterEach?: (move: Move) => void,
): { played: Move[]; refused?: { index: number; move: string } } {
  const played: Move[] = []
  for (const [index, text] of moves.entries()) {
    const done = tryMoveText(chess, text)
    if (!done) return { played, refused: { index, move: text } }
    played.push(done)
    afterEach?.(done)
  }
  return { played }
}

/** The position after a move, or why the move cannot be played. */
export function playMove(
  fen: string,
  move: MoveInput,
): Result<{ san: string; position: Position }> {
  const normalized = normalizeFen(fen)
  if (!normalized.ok) return normalized
  const chess = new Chess(normalized.fen)
  const played = tryMove(chess, move)
  if (!played) return { ok: false, error: `${toUci(move)} is not a legal move here` }
  return { ok: true, san: played.san, position: describePosition(chess, played) }
}

/** Every position along a line of moves (UCI or standard notation), or the first that cannot be played. */
export function resolveLine(fen: string, moves: readonly string[]): Result<{ steps: LineStep[] }> {
  const normalized = normalizeFen(fen)
  if (!normalized.ok) return normalized
  const chess = new Chess(normalized.fen)
  const steps: LineStep[] = []
  const { refused } = replay(chess, moves, (move) =>
    steps.push({ uci: toUci(move), san: move.san, position: describePosition(chess, move) }),
  )
  if (refused) {
    return {
      ok: false,
      error: `Move ${refused.index + 1}, ${refused.move}, is not a legal move there`,
    }
  }
  return { ok: true, steps }
}

/**
 * A line of UCI moves in standard notation, as far as it is legal from `fen`. Meant for lines
 * from the engine, which are always legal; anything after an illegal move is left out.
 */
export function sanLine(fen: string, moves: readonly string[]): string[] {
  return replay(new Chess(fen), moves).played.map((move) => move.san)
}

/** The position before the `ply`th move (from 1) of moves played from `start`, if there is one. */
export function fenBefore(
  start: string,
  moves: readonly Pick<PlayedMove, 'fenAfter'>[],
  ply: number,
): string | undefined {
  return ply === 1 ? start : moves[ply - 2]?.fenAfter
}

/** How the game has ended by the rules, or null while it goes on. */
export function outcome(chess: Chess): { result: GameResult; termination: Termination } | null {
  if (chess.isCheckmate()) {
    return { result: chess.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' }
  }
  const draw = (termination: Termination) => ({ result: '1/2-1/2' as const, termination })
  if (chess.isStalemate()) return draw('stalemate')
  if (chess.isInsufficientMaterial()) return draw('insufficient_material')
  if (chess.isThreefoldRepetition()) return draw('threefold_repetition')
  if (chess.isDrawByFiftyMoves()) return draw('fifty_moves')
  return null
}

/** The result when one side gives up. */
export function resultOfResigning(color: Color): GameResult {
  return color === 'white' ? '0-1' : '1-0'
}
