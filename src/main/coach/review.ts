// The engine's judgement of every move in a line: a whole game, for a review once it is over, or
// a line the coach wants to show, to check it holds up before the player sees it.
import { Chess } from 'chess.js'
import type { Color, GameRecord } from '@shared/chess'
import { numberedLine, numberedMove } from '@shared/notation'
import type { Opening } from '@shared/training'
import type { SearchLimits } from '../engine/engine'
import { describeScore, type MoveAssessment, type MoveQuality } from '../analysis/evaluation'
import { REVIEW_LIMITS, type PositionAnalyst } from './analyst'

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
export function annotatedLine(start: string, moves: readonly AssessedMove[]): string {
  return numberedLine(
    start,
    moves.map((move) => move.san + (move.assessment ? QUALITY_MARKS[move.assessment.quality] : '')),
  )
}

/** The most turning points a review lists. */
const MAX_TURNING_POINTS = 8

export interface GameReview {
  game_id: number
  opening: string | null
  player_color: Color
  result: GameRecord['result']
  termination: GameRecord['termination'] | null
  /** Every move, marked ?! for an inaccuracy, ? for a mistake and ?? for a blunder. */
  annotated_moves: string
  /** How many of the player's moves were of each quality. */
  player_moves: Record<MoveQuality, number>
  /** Where the game turned: the player's slips, and the opponent's that the player could use. */
  turning_points: {
    move: string
    by: 'player' | 'opponent'
    quality: MoveQuality
    chances_lost: number
    best_move: string
    fen_before: string
  }[]
}

/** The engine's review of a game, from the player's side. */
export async function reviewGame(
  game: GameRecord,
  analyst: PositionAnalyst,
  opening: Opening | null,
): Promise<GameReview> {
  const moves = await assessLine(game.initialFen, game.moves, analyst, REVIEW_LIMITS)
  const playerMoves: Record<MoveQuality, number> = {
    best: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  }
  const turningPoints: (GameReview['turning_points'][number] & { ply: number })[] = []

  for (const [index, move] of moves.entries()) {
    const assessment = move.assessment
    if (!assessment) continue
    const byPlayer = move.color === game.playerColor
    if (byPlayer) playerMoves[assessment.quality]++
    const counts = byPlayer
      ? assessment.quality !== 'best' && assessment.quality !== 'good'
      : assessment.quality === 'mistake' || assessment.quality === 'blunder'
    if (!counts) continue
    turningPoints.push({
      ply: index + 1,
      move: numberedMove(game.initialFen, index + 1, move.san),
      by: byPlayer ? 'player' : 'opponent',
      quality: assessment.quality,
      chances_lost: assessment.chances_lost,
      best_move: assessment.best_move,
      fen_before: move.fenBefore,
    })
  }

  return {
    game_id: game.id,
    opening: opening ? `${opening.eco} ${opening.name}` : null,
    player_color: game.playerColor,
    result: game.result,
    termination: game.termination ?? null,
    annotated_moves: annotatedLine(game.initialFen, moves),
    player_moves: playerMoves,
    // The worst of them, in the order they happened.
    turning_points: turningPoints
      .sort((a, b) => b.chances_lost - a.chances_lost)
      .slice(0, MAX_TURNING_POINTS)
      .sort((a, b) => a.ply - b.ply)
      .map(({ ply: _ply, ...point }) => point),
  }
}
