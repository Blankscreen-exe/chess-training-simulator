// The engine's judgement of every move in a line: a whole game, for its review, or a line the
// coach wants to show, to check it holds up before the player sees it.
import { Chess } from 'chess.js'
import type { Color } from '@shared/chess'
import { numberedLine } from '@shared/notation'
import type { SearchLimits } from '../engine/engine'
import { describeScore, type MoveAssessment, type MoveQuality } from '../analysis/evaluation'
import type { PositionAnalyst } from './analyst'

/** A move of a line, as the game and the board both have them. */
export interface LineMove {
  uci: string
  san: string
  color: Color
  fenAfter: string
}

export interface AssessedMove extends LineMove {
  fenBefore: string
  /** Null if there was nothing to compare it with. */
  assessment: MoveAssessment | null
}

/** Each move of a line from `start`, judged against the engine's best in its position. */
export async function assessLine(
  start: string,
  moves: readonly LineMove[],
  analyst: PositionAnalyst,
  limits: SearchLimits,
): Promise<AssessedMove[]> {
  const assessed: AssessedMove[] = []
  let before = start
  for (const move of moves) {
    const assessment = await analyst.assess(before, move.uci, move.fenAfter, move.color, limits)
    assessed.push({ ...move, fenBefore: before, assessment })
    before = move.fenAfter
  }
  return assessed
}

/** How a position stands, in words: the engine's score, or how the game ended there. */
export async function evaluationOf(
  fen: string,
  analyst: PositionAnalyst,
  limits: SearchLimits,
): Promise<string> {
  const best = (await analyst.analyse(fen, 1, limits)).lines[0]
  if (best) return describeScore(best.score)
  const chess = new Chess(fen)
  return chess.isCheckmate() ? 'checkmate' : 'a draw'
}

/** The marks chess players put after a move to judge it. */
const QUALITY_MARKS: Record<MoveQuality, string> = {
  best: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
}

/** A line written out with each move's mark: "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6??". */
export function annotatedLine(
  start: string,
  moves: readonly Pick<AssessedMove, 'san' | 'assessment'>[],
): string {
  return numberedLine(
    start,
    moves.map((move) => move.san + (move.assessment ? QUALITY_MARKS[move.assessment.quality] : '')),
  )
}
