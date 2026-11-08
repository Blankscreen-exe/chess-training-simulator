// Positions from the player's own games to practise: where they made a mistake and one move was
// clearly best, so the position has a fair answer. Each is set up as a puzzle is: the opponent's
// move before it, then the best move to find.
import type { Color, GameRecord } from '@shared/chess'
import { numberedMove } from '@shared/notation'
import { centipawnsFor, winningChances } from '../analysis/evaluation'
import { fenBefore } from '../chess/rules'
import { REVIEW_LIMITS, type PositionAnalyst } from '../coach/analyst'
import type { NewPracticePosition } from '../profile/practice'
import type { ReviewedMove } from './store'

/** The most positions taken from one game: its worst mistakes. */
const MAX_PER_GAME = 3
/** How many points of winning chances the best move must keep over the next best. */
const CLEAR_BY = 15

/** The positions of a game's worst mistakes that have one clear answer, the worst first. */
export async function practiceFrom(
  game: GameRecord,
  moves: readonly ReviewedMove[],
  analyst: PositionAnalyst,
): Promise<NewPracticePosition[]> {
  const slips = moves
    .filter(
      (move) =>
        move.byPlayer &&
        // The opponent's move before it sets the position up.
        move.ply >= 2 &&
        (move.assessment.quality === 'mistake' || move.assessment.quality === 'blunder'),
    )
    .sort((a, b) => b.assessment.chances_lost - a.assessment.chances_lost)

  const found: NewPracticePosition[] = []
  for (const slip of slips) {
    if (found.length === MAX_PER_GAME) break
    const start = fenBefore(game.initialFen, game.moves, slip.ply - 1)
    const before = fenBefore(game.initialFen, game.moves, slip.ply)
    const setting = game.moves[slip.ply - 2]
    const played = game.moves[slip.ply - 1]
    if (!start || !before || !setting || !played) continue
    const answer = await clearBest(before, game.playerColor, analyst)
    if (!answer) continue
    found.push({
      key: `game:${game.id}:${slip.ply}`,
      origin: {
        from: 'game',
        gameId: game.id,
        played: numberedMove(game.initialFen, slip.ply, played.san),
      },
      fen: start,
      moves: [setting.uci, answer],
      rating: null,
      themes: [slip.phase],
    })
  }
  return found
}

/** The engine's best move for `player`, if it is clearly better than any other; else null. */
async function clearBest(
  fen: string,
  player: Color,
  analyst: PositionAnalyst,
): Promise<string | null> {
  const [best, next] = (await analyst.analyse(fen, 2, REVIEW_LIMITS)).lines
  const move = best?.uci[0]
  // With one legal move there is nothing to find.
  if (!best || !next || !move) return null
  const chances = (score: typeof best.score) => winningChances(centipawnsFor(score, player))
  return chances(best.score) - chances(next.score) >= CLEAR_BY ? move : null
}
