// A game's review: the engine's judgement of every move, and where the game turned, from the
// player's side.
import type { Color, GameRecord } from '@shared/chess'
import { numberedMove } from '@shared/notation'
import type { Opening } from '@shared/training'
import type { MoveQuality } from '../analysis/evaluation'
import { gamePhase } from '../chess/phase'
import { fenBefore } from '../chess/rules'
import { REVIEW_LIMITS, type PositionAnalyst } from '../coach/analyst'
import { annotatedLine, assessLine } from '../coach/lines'
import type { ReviewedMove } from './store'

/** Every move of a game, judged against the engine's best in its position. */
export async function assessGame(
  game: GameRecord,
  analyst: PositionAnalyst,
): Promise<ReviewedMove[]> {
  const assessed = await assessLine(game.initialFen, game.moves, analyst, REVIEW_LIMITS)
  return assessed.flatMap((move, index) =>
    move.assessment
      ? [
          {
            ply: index + 1,
            byPlayer: move.color === game.playerColor,
            phase: gamePhase(move.fenBefore),
            assessment: move.assessment,
          },
        ]
      : [],
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

/** Whether a move is one the review points out: any slip of the player's, the opponent's worst. */
function isTurningPoint({ byPlayer, assessment: { quality } }: ReviewedMove): boolean {
  return byPlayer
    ? quality !== 'best' && quality !== 'good'
    : quality === 'mistake' || quality === 'blunder'
}

/** The review of a game, from its moves as the engine judged them. */
export function describeReview(
  game: GameRecord,
  moves: readonly ReviewedMove[],
  opening: Opening | null,
): GameReview {
  const byPly = new Map(moves.map((move) => [move.ply, move]))
  const playerMoves: Record<MoveQuality, number> = {
    best: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  }
  for (const move of moves) if (move.byPlayer) playerMoves[move.assessment.quality]++

  const turningPoints = moves
    .filter(isTurningPoint)
    // The worst of them, in the order they happened.
    .sort((a, b) => b.assessment.chances_lost - a.assessment.chances_lost)
    .slice(0, MAX_TURNING_POINTS)
    .sort((a, b) => a.ply - b.ply)
    .flatMap((move) => {
      const played = game.moves[move.ply - 1]
      const before = fenBefore(game.initialFen, game.moves, move.ply)
      if (!played || !before) return []
      return [
        {
          move: numberedMove(game.initialFen, move.ply, played.san),
          by: move.byPlayer ? ('player' as const) : ('opponent' as const),
          quality: move.assessment.quality,
          chances_lost: move.assessment.chances_lost,
          best_move: move.assessment.best_move,
          fen_before: before,
        },
      ]
    })

  return {
    game_id: game.id,
    opening: opening ? `${opening.eco} ${opening.name}` : null,
    player_color: game.playerColor,
    result: game.result,
    termination: game.termination ?? null,
    annotated_moves: annotatedLine(
      game.initialFen,
      game.moves.map((move, index) => ({
        san: move.san,
        assessment: byPly.get(index + 1)?.assessment ?? null,
      })),
    ),
    player_moves: playerMoves,
    turning_points: turningPoints,
  }
}
