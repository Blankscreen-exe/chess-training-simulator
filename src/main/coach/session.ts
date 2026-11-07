// What the coach hears about the game, by coaching mode. It follows every change to the game, and
// passes on to Claude the events the mode calls for, with the engine's view added where the mode
// needs it. Events go out in the order things happened, even when some take a moment to analyse.
import type { GameState } from '@shared/chess'
import type { CoachingMode } from '@shared/coach'
import type { PositionAnalyst } from './analyst'
import { candidateMoves, gameEvents, type CandidateMove, type MoveEvent } from './events'
import type { CoachHub } from './hub'

/** How many options the coach is shown before the player's move. */
export const CANDIDATE_COUNT = 3

interface ModeRules {
  /** Whether the opponent's moves are passed on. */
  opponentMoves: boolean
  /** Whether the player's moves are passed on, and whether judged. */
  playerMoves: 'plain' | 'assessed' | 'mistakes_only' | 'none'
  /** Whether the engine's options are shown before each of the player's moves. */
  candidates: boolean
}

export const MODE_RULES: Record<CoachingMode, ModeRules> = {
  guided: { opponentMoves: true, playerMoves: 'assessed', candidates: true },
  casual: { opponentMoves: true, playerMoves: 'plain', candidates: true },
  blunder_watch: { opponentMoves: false, playerMoves: 'mistakes_only', candidates: false },
  silent: { opponentMoves: false, playerMoves: 'none', candidates: false },
}

export class CoachSession {
  private last: GameState | null = null
  /** The position whose options were last offered, so they are offered once. */
  private offeredFen: string | null = null
  private work: Promise<void> = Promise.resolve()

  constructor(
    private readonly hub: CoachHub,
    private readonly analyst: PositionAnalyst,
    private readonly log: (message: string, error?: unknown) => void = (message, error) =>
      console.error(message, error),
  ) {}

  /** Resolves once everything already asked for has been sent; for tests. */
  idle(): Promise<void> {
    return this.work
  }

  gameChanged(next: GameState | null): void {
    const previous = this.last
    this.last = next
    if (previous?.position.fen !== next?.position.fen) this.hub.setCandidates(null)

    const events = gameEvents(previous, next)
    if (events.some((event) => event.type !== 'move' || event.by === 'player')) {
      this.hub.noteActivity()
    }
    if (!next || !this.hub.connected) return

    const rules = MODE_RULES[this.hub.currentSettings.mode]
    for (const event of events) {
      if (event.type === 'move' && event.by === 'player') {
        this.passPlayerMove(event, next, rules)
      } else if (event.type !== 'move' || rules.opponentMoves) {
        this.later(() => this.hub.deliver([event]))
      }
    }
    if (rules.candidates) this.offerCandidates(next)
  }

  private passPlayerMove(event: MoveEvent, game: GameState, rules: ModeRules): void {
    if (rules.playerMoves === 'none') return
    if (rules.playerMoves === 'plain') {
      this.later(() => this.hub.deliver([event]))
      return
    }
    const before = event.ply === 1 ? game.initialFen : game.moves[event.ply - 2]?.fenAfter
    const played = game.moves[event.ply - 1]
    if (!before || !played) return
    this.later(async () => {
      const assessment = await this.analyst.assess(
        before,
        played.uci,
        event.fen_after,
        game.playerColor,
      )
      if (!assessment) return
      const mistake = assessment.quality === 'mistake' || assessment.quality === 'blunder'
      if (rules.playerMoves === 'assessed' || mistake) {
        this.hub.deliver([{ ...event, assessment }])
      }
    })
  }

  /** Shows the engine's options once it is the player's move, in a position not yet offered. */
  private offerCandidates(game: GameState): void {
    const fen = game.position.fen
    const playersTurn = game.status === 'in_progress' && game.position.turn === game.playerColor
    if (!playersTurn || this.offeredFen === fen) return
    this.offeredFen = fen
    this.later(async () => {
      const candidates = await this.candidatesFor(fen)
      // The player may have moved while the engine thought; options for an old position would
      // only confuse.
      if (this.last?.position.fen !== fen || candidates.length === 0) return
      this.hub.deliver([{ type: 'your_turn', fen, candidates }])
    })
  }

  /** The engine's best moves in a position, as the coach reads them. */
  async candidatesFor(fen: string): Promise<CandidateMove[]> {
    const analysis = await this.analyst.analyse(fen, CANDIDATE_COUNT)
    return candidateMoves(analysis.lines)
  }

  /** Runs `task` after everything asked for before it, so events keep their order. */
  private later(task: () => void | Promise<void>): void {
    this.work = this.work.then(task).catch((error: unknown) => {
      this.log('The coach could not analyse the game', error)
    })
  }
}
