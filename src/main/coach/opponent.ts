// The coach as the opponent: it chooses each move from the engine's best few, to make the game
// more human or to set up something worth learning. It can only choose from those moves, so it
// never plays chess on its own judgment. If it is not listening, or takes too long, the engine's
// best move is played instead, so the game never stalls.
import { Chess } from 'chess.js'
import type { AnalysisLine, Result } from '@shared/chess'
import { toUci } from '@shared/notation'
import { tryMoveText } from '../chess/rules'
import type { Opponent, OpponentTurn } from '../games/opponent'
import type { PositionAnalyst } from './analyst'
import { candidateMoves } from './events'
import type { CoachHub } from './hub'
import { CANDIDATE_COUNT } from './session'

/** How long the coach has to choose before the engine's best move is played for it. */
export const CHOOSE_WITHIN_MS = 60_000

interface Pending {
  fen: string
  lines: AnalysisLine[]
  finish: (uci: string | null) => void
}

export class CoachOpponent implements Opponent {
  private pending: Pending | null = null

  constructor(
    private readonly hub: CoachHub,
    private readonly analyst: PositionAnalyst,
    /** Who plays when the coach is not there. */
    private readonly fallback: Opponent,
    private readonly chooseWithinMs = CHOOSE_WITHIN_MS,
  ) {}

  async chooseMove(turn: OpponentTurn, signal: AbortSignal): Promise<string | null> {
    if (!this.hub.connected) return this.fallback.chooseMove(turn, signal)
    const { lines } = await this.analyst.analyse(turn.fen, CANDIDATE_COUNT)
    const best = lines[0]?.uci[0]
    if (signal.aborted || !best) return best ?? null

    return new Promise((resolve) => {
      const finish = (uci: string | null) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        if (this.pending?.finish === finish) this.pending = null
        resolve(uci)
      }
      const onAbort = () => finish(null)
      const timer = setTimeout(() => finish(best), this.chooseWithinMs)
      signal.addEventListener('abort', onAbort)
      this.pending = { fen: turn.fen, lines, finish }
      this.hub.deliver([
        {
          type: 'opponent_to_move',
          fen: turn.fen,
          candidates: candidateMoves(lines),
        },
      ])
    })
  }

  /** The coach's choice, from the moves it was offered; refused if it is not one of them. */
  choose(text: string): Result<{ move: string }> {
    const pending = this.pending
    if (!pending) return { ok: false, error: 'It is not your move as the opponent' }
    const move = tryMoveText(new Chess(pending.fen), text)
    const offered = pending.lines.flatMap((line) => line.san[0] ?? [])
    if (!move || !pending.lines.some((line) => line.uci[0] === toUci(move))) {
      return { ok: false, error: `Choose one of the moves offered: ${offered.join(', ')}` }
    }
    pending.finish(toUci(move))
    return { ok: true, move: move.san }
  }
}
