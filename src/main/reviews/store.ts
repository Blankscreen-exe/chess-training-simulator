// The engine's reviews of games, move by move, kept in the player's database: so a game is
// reviewed once, and the player's mistakes can be counted across games.
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { GAME_PHASES, type GamePhase, type MistakeRecord, type PhaseRecord } from '@shared/profile'
import { MOVE_QUALITIES, type MoveAssessment, type MoveQuality } from '../analysis/evaluation'
import { inTransaction } from '../storage/database'

/** A move of a game, as the engine judged it. */
export interface ReviewedMove {
  /** Its place in the game, counting each side's moves, from 1. */
  ply: number
  byPlayer: boolean
  phase: GamePhase
  assessment: MoveAssessment
}

const MoveRow = z
  .object({
    ply: z.number().int(),
    by_player: z.number().int(),
    phase: z.enum(GAME_PHASES),
    quality: z.enum(MOVE_QUALITIES),
    chances_lost: z.number().int(),
    centipawns_lost: z.number().int(),
    best_move: z.string(),
  })
  .transform((row): ReviewedMove => ({
    ply: row.ply,
    byPlayer: row.by_player === 1,
    phase: row.phase,
    assessment: {
      quality: row.quality,
      chances_lost: row.chances_lost,
      centipawns_lost: row.centipawns_lost,
      best_move: row.best_move,
    },
  }))

const CountRow = z.object({
  phase: z.enum(GAME_PHASES),
  quality: z.enum(MOVE_QUALITIES),
  moves: z.number().int(),
})

/** Where each kind of slip is counted. */
const COUNTED: Partial<Record<MoveQuality, Exclude<keyof PhaseRecord, 'moves'>>> = {
  inaccuracy: 'inaccuracies',
  mistake: 'mistakes',
  blunder: 'blunders',
}

function noMoves(): PhaseRecord {
  return { moves: 0, inaccuracies: 0, mistakes: 0, blunders: 0 }
}

export class ReviewStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Keeps a game's review, in place of any before it. */
  save(gameId: number, moves: readonly ReviewedMove[], reviewedAt: string): void {
    inTransaction(this.db, () => {
      this.db.prepare('DELETE FROM move_reviews WHERE game_id = ?').run(gameId)
      const insert = this.db.prepare(
        `INSERT INTO move_reviews
           (game_id, ply, by_player, phase, quality, chances_lost, centipawns_lost, best_move)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const move of moves) {
        const { assessment } = move
        insert.run(
          gameId,
          move.ply,
          move.byPlayer ? 1 : 0,
          move.phase,
          assessment.quality,
          assessment.chances_lost,
          assessment.centipawns_lost,
          assessment.best_move,
        )
      }
      this.db
        .prepare(
          `INSERT INTO game_reviews (game_id, reviewed_at) VALUES (?, ?)
           ON CONFLICT (game_id) DO UPDATE SET reviewed_at = excluded.reviewed_at`,
        )
        .run(gameId, reviewedAt)
    })
  }

  /** A game's review, in the order of its moves; null if it has none. */
  get(gameId: number): ReviewedMove[] | null {
    const reviewed = this.db.prepare('SELECT 1 FROM game_reviews WHERE game_id = ?').get(gameId)
    if (!reviewed) return null
    return this.db
      .prepare('SELECT * FROM move_reviews WHERE game_id = ? ORDER BY ply')
      .all(gameId)
      .map((row) => MoveRow.parse(row))
  }

  /** Games that are over and have moves but no review, the latest first. */
  unreviewed(limit: number): number[] {
    return this.db
      .prepare(
        `SELECT id FROM games
         WHERE status != 'in_progress' AND moves != ''
           AND id NOT IN (SELECT game_id FROM game_reviews)
         ORDER BY id DESC LIMIT ?`,
      )
      .all(limit)
      .map((row) => z.object({ id: z.number().int() }).parse(row).id)
  }

  /** The player's moves in the latest `games` reviewed games, by phase, and how many went wrong. */
  mistakes(games: number): MistakeRecord {
    const latest = 'SELECT game_id FROM game_reviews ORDER BY game_id DESC LIMIT ?'
    const { count } = z
      .object({ count: z.number().int() })
      .parse(this.db.prepare(`SELECT COUNT(*) AS count FROM (${latest})`).get(games))
    const byPhase: Record<GamePhase, PhaseRecord> = {
      opening: noMoves(),
      middlegame: noMoves(),
      endgame: noMoves(),
    }
    const rows = this.db
      .prepare(
        `SELECT phase, quality, COUNT(*) AS moves FROM move_reviews
         WHERE by_player = 1 AND game_id IN (${latest})
         GROUP BY phase, quality`,
      )
      .all(games)
    for (const row of rows) {
      const { phase, quality, moves } = CountRow.parse(row)
      const record = byPhase[phase]
      record.moves += moves
      const counted = COUNTED[quality]
      if (counted) record[counted] += moves
    }
    return { games: count, byPhase }
  }
}
