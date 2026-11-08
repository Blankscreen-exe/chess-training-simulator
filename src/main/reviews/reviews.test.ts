import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { START_FEN, type GameStatus } from '@shared/chess'
import { gameState, playedMoves } from '@test-support/fixtures'
import { gamePhase } from '../chess/phase'
import { CoachAnalyst, type PositionAnalyst } from '../coach/analyst'
import { Engine } from '../engine/engine'
import { inProcessTransport } from '../engine/in-process-transport'
import type { StoredGame } from '../games/game'
import type { Opponent } from '../games/opponent'
import { GameService } from '../games/service'
import { GameStore } from '../games/store'
import { PracticeStore } from '../profile/practice'
import { openDatabase } from '../storage/database'
import { describeReview } from './review'
import { endedGame, ReviewService } from './service'
import { ReviewStore, type ReviewedMove } from './store'

/** White misses a mate in one with 4. d3, after Black's 3… Nf6 allowed it. */
const MISSED_MATE = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'd3']
const NOW = new Date('2026-11-08T12:00:00Z')

const engine = new Engine(inProcessTransport())
afterAll(() => engine.close())

/** Never moves: the games here are stored whole. */
const idle: Opponent = { chooseMove: () => Promise.resolve(null) }

let gameStore: GameStore
let reviewStore: ReviewStore
let practice: PracticeStore
let games: GameService
beforeEach(() => {
  const db = openDatabase(':memory:')
  gameStore = new GameStore(db)
  reviewStore = new ReviewStore(db)
  practice = new PracticeStore(db)
  games = new GameService({ store: gameStore, opponents: { engine: idle, coach: idle } })
})

/** Stores a game of `san` moves, played as White, that has ended unless told otherwise. */
function storeGame(san: readonly string[], status: GameStatus = 'resigned'): number {
  return saveGame(gameStore.create(newGame), san, status)
}

const newGame = {
  playerColor: 'white',
  engineLevel: 3,
  opponent: 'engine',
  initialFen: START_FEN,
  startedAt: NOW.toISOString(),
} as const

/** Saves `game` with `san` moves and `status`; returns its id. */
function saveGame(game: StoredGame, san: readonly string[], status: GameStatus): number {
  const ending: Pick<StoredGame, 'result' | 'termination'> =
    status === 'in_progress'
      ? { result: '*' }
      : status === 'abandoned'
        ? { result: '*', termination: 'abandoned' }
        : { result: '0-1', termination: 'resignation' }
  gameStore.save({ ...game, moves: playedMoves(san).map((move) => move.uci), status, ...ending })
  return game.id
}

/** The real analyst, counting the moves it is asked to judge. */
function countingAnalyst() {
  const analyst = new CoachAnalyst(() => engine)
  const counted = { assessed: 0 }
  const counting: PositionAnalyst = {
    analyse: (...args) => analyst.analyse(...args),
    assess: (...args) => {
      counted.assessed++
      return analyst.assess(...args)
    },
  }
  return { counted, analyst: counting }
}

function reviewService(analyst: PositionAnalyst = countingAnalyst().analyst) {
  return new ReviewService({
    store: reviewStore,
    games,
    library: { openingOf: () => null },
    analyst,
    practice,
    now: () => NOW,
  })
}

const judged = (
  ply: number,
  quality: ReviewedMove['assessment']['quality'],
  chancesLost = 0,
): ReviewedMove => ({
  ply,
  byPlayer: ply % 2 === 1,
  phase: 'opening',
  assessment: { quality, chances_lost: chancesLost, centipawns_lost: 0, best_move: 'Qxf7#' },
})

describe('gamePhase', () => {
  it('calls the first moves the opening, then the middlegame, and few pieces the endgame', () => {
    expect(gamePhase('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('opening')
    expect(
      gamePhase('r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 11'),
    ).toBe('middlegame')
    expect(gamePhase('3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 3')).toBe('endgame')
  })
})

describe('endedGame', () => {
  const underWay = gameState({ id: 4 })
  it('names a game once it is over, or left under way for another', () => {
    expect(endedGame(underWay, { ...underWay, status: 'resigned' })).toBe(4)
    expect(endedGame(underWay, gameState({ id: 5 }))).toBe(4)
    expect(endedGame(underWay, underWay)).toBeNull()
    expect(endedGame(null, underWay)).toBeNull()
    expect(endedGame({ ...underWay, status: 'finished' }, gameState({ id: 5 }))).toBeNull()
  })
})

describe('ReviewStore', () => {
  it('keeps a review in place of the one before, and lists the games without one', () => {
    const reviewed = storeGame(['e4', 'e5'])
    const notYet = storeGame(['d4'])
    storeGame(['c4'], 'in_progress')
    expect(reviewStore.get(reviewed)).toBeNull()
    reviewStore.save(reviewed, [judged(1, 'good')], NOW.toISOString())
    reviewStore.save(reviewed, [judged(1, 'best'), judged(2, 'good')], NOW.toISOString())
    expect(reviewStore.get(reviewed)).toEqual([judged(1, 'best'), judged(2, 'good')])
    expect(reviewStore.unreviewed(10)).toEqual([notYet])
  })

  it("counts the player's slips in the latest reviewed games, by phase", () => {
    const older = storeGame(['e4'])
    const newer = storeGame(['e4'])
    reviewStore.save(older, [judged(1, 'blunder')], NOW.toISOString())
    reviewStore.save(
      newer,
      [
        judged(1, 'mistake'),
        judged(2, 'blunder'),
        { ...judged(3, 'inaccuracy'), phase: 'endgame' },
      ],
      NOW.toISOString(),
    )
    const { games: counted, byPhase } = reviewStore.mistakes(1)
    expect(counted).toBe(1)
    expect(byPhase.opening).toEqual({ moves: 1, inaccuracies: 0, mistakes: 1, blunders: 0 })
    expect(byPhase.endgame).toEqual({ moves: 1, inaccuracies: 1, mistakes: 0, blunders: 0 })
    expect(reviewStore.mistakes(5).byPhase.opening.blunders).toBe(1)
  })
})

describe('describeReview', () => {
  it("marks each move, and lists the player's slips and the opponent's worst, in order", () => {
    const id = storeGame(MISSED_MATE)
    const found = games.record(id)
    if (!found.ok) throw new Error(found.error)
    const review = describeReview(
      found.game,
      [judged(3, 'inaccuracy', 12), judged(6, 'blunder', 45), judged(7, 'blunder', 48)],
      { eco: 'C20', name: "King's Pawn Game", moves: ['e4', 'e5'] },
    )
    expect(review).toMatchObject({
      game_id: id,
      opening: "C20 King's Pawn Game",
      annotated_moves: '1. e4 e5 2. Qh5?! Nc6 3. Bc4 Nf6?? 4. d3??',
      player_moves: { best: 0, good: 0, inaccuracy: 1, mistake: 0, blunder: 1 },
    })
    expect(review.turning_points.map((point) => [point.move, point.by])).toEqual([
      ['2. Qh5', 'player'],
      ['3… Nf6', 'opponent'],
      ['4. d3', 'player'],
    ])
    expect(review.turning_points[2]?.fen_before).toBe(found.game.moves[5]?.fenAfter)
  })
})

describe('ReviewService', { timeout: 60_000 }, () => {
  it('reviews a game once, keeps it, and takes its clearest mistake to practise', async () => {
    const { counted, analyst } = countingAnalyst()
    const service = reviewService(analyst)
    const reviewed: number[] = []
    service.onReviewed((id) => reviewed.push(id))
    const id = storeGame(MISSED_MATE)

    // Asked for twice at once, it is made once.
    const [first, second] = await Promise.all([service.review(id), service.review(id)])
    expect(counted.assessed).toBe(MISSED_MATE.length)
    if (!first.ok || !second.ok) throw new Error('not reviewed')
    expect(second.review).toEqual(first.review)
    expect(first.review.annotated_moves).toMatch(/4\. d3\?\?$/)
    expect(reviewed).toEqual([id])

    expect(practice.next(new Date(NOW.getTime() + 2 * 86_400_000))).toMatchObject({
      key: `game:${id}:7`,
      origin: { from: 'game', gameId: id, played: '4. d3' },
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
      moves: ['g8f6', 'h5f7'],
      rating: null,
      themes: ['opening'],
    })

    // Kept, so asking again needs no engine.
    expect(await service.review(id)).toEqual(first)
    expect(counted.assessed).toBe(MISSED_MATE.length)
  })

  it('reviews a game under way as far as it has got, without keeping it', async () => {
    const service = reviewService()
    const id = storeGame(['e4', 'e5'], 'in_progress')
    expect(await service.review(id)).toMatchObject({ ok: true })
    expect(reviewStore.get(id)).toBeNull()
    expect(await service.review(storeGame([]))).toEqual({
      ok: false,
      error: 'That game has no moves to review',
    })
  })

  it('reviews each game as it ends, and those that ended without a review', async () => {
    const service = reviewService()
    const unreviewed = storeGame(['d4', 'd5'])
    const playing = storeGame(['e4', 'e5'], 'in_progress')
    service.gameChanged(gameState({ id: playing }))
    service.catchUp()
    const stored = gameStore.get(playing)
    if (!stored) throw new Error('not stored')
    saveGame(stored, ['e4', 'e5'], 'abandoned')
    service.gameChanged(gameState({ id: playing, status: 'abandoned' }))
    await service.idle()
    expect(reviewStore.get(unreviewed)).toHaveLength(2)
    expect(reviewStore.get(playing)).toHaveLength(2)
    expect(reviewStore.unreviewed(10)).toEqual([])
  })
})
