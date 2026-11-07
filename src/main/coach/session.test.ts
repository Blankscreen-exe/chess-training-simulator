import { describe, expect, it } from 'vitest'
import type { Analysis } from '@shared/chess'
import type { CoachingMode } from '@shared/coach'
import { gameState, playedMoves } from '@test-support/fixtures'
import type { MoveAssessment, MoveQuality } from '../analysis/evaluation'
import type { PositionAnalyst } from './analyst'
import type { CoachEvent } from './events'
import type { CoachHub } from './hub'
import { CoachSession } from './session'
import { testHub } from './test-support'

/** An analyst with fixed answers: every position offers e4 and d4; every move gets `quality`. */
function fakeAnalyst(quality: MoveQuality = 'good'): PositionAnalyst {
  return {
    analyse: (fen): Promise<Analysis> =>
      Promise.resolve({
        fen,
        depth: 12,
        lines: [
          { rank: 1, depth: 12, score: { type: 'cp', value: 30 }, uci: ['e2e4'], san: ['e4'] },
          { rank: 2, depth: 12, score: { type: 'cp', value: 20 }, uci: ['d2d4'], san: ['d4'] },
        ],
      }),
    assess: (): Promise<MoveAssessment> =>
      Promise.resolve({ quality, chances_lost: 0, centipawns_lost: 0, best_move: 'e4' }),
  }
}

/** Everything the coach has been told, once the session has finished analysing. */
async function heard(hub: CoachHub, session: CoachSession): Promise<CoachEvent[]> {
  await session.idle()
  const result = await hub.waitForEvents()
  return 'events' in result ? result.events : []
}

const [e4, c5] = playedMoves(['e4', 'c5'])
const start = gameState()
const afterE4 = gameState({ moves: [e4!] })
const afterC5 = gameState({ moves: [e4!, c5!] })

/** A session in `mode`, having seen a game start and its first two moves, made at a human pace. */
async function playOpening(mode: CoachingMode, quality: MoveQuality = 'good') {
  const hub = testHub({ settings: { mode, playerLevel: 'casual' } })
  const session = new CoachSession(hub, fakeAnalyst(quality), () => undefined)
  for (const state of [start, afterE4, afterC5]) {
    session.gameChanged(state)
    await session.idle()
  }
  return { hub, session, events: await heard(hub, session) }
}

const types = (events: CoachEvent[]) => events.map((event) => event.type)

describe('CoachSession', () => {
  it('in guided mode, offers options before each move and judges each one', async () => {
    const { events } = await playOpening('guided')
    expect(types(events)).toEqual(['game_started', 'your_turn', 'move', 'move', 'your_turn'])
    expect(events[1]).toEqual({
      type: 'your_turn',
      fen: start.position.fen,
      candidates: [
        { move: 'e4', evaluation: '+0.30, White is better' },
        { move: 'd4', evaluation: '+0.20, about level' },
      ],
    })
    expect(events[2]).toMatchObject({ by: 'player', assessment: { quality: 'good' } })
    expect(events[3]).not.toHaveProperty('assessment')
  })

  it('in casual mode, offers options but never judges', async () => {
    const { events } = await playOpening('casual')
    expect(types(events)).toEqual(['game_started', 'your_turn', 'move', 'move', 'your_turn'])
    expect(events[2]).not.toHaveProperty('assessment')
  })

  it('in blunder watch, says nothing of good moves', async () => {
    const { events } = await playOpening('blunder_watch')
    expect(types(events)).toEqual(['game_started'])
  })

  it('in blunder watch, speaks up on a mistake', async () => {
    const { events } = await playOpening('blunder_watch', 'blunder')
    expect(types(events)).toEqual(['game_started', 'move'])
    expect(events[1]).toMatchObject({ by: 'player', assessment: { quality: 'blunder' } })
  })

  it('in silent mode, only says when games start and end', async () => {
    const { hub, session, events } = await playOpening('silent')
    expect(types(events)).toEqual(['game_started'])
    session.gameChanged(gameState({ moves: [e4!, c5!], status: 'resigned', result: '0-1' }))
    expect(types(await heard(hub, session))).toEqual(['game_ended'])
  })

  it('offers options for a position once, however often the game is announced', async () => {
    const hub = testHub()
    const session = new CoachSession(hub, fakeAnalyst(), () => undefined)
    session.gameChanged(start)
    session.gameChanged({ ...start, opponentThinking: false })
    expect(types(await heard(hub, session))).toEqual(['game_started', 'your_turn'])
  })

  it('drops options for a position the player has already moved from', async () => {
    const hub = testHub()
    const session = new CoachSession(hub, fakeAnalyst(), () => undefined)
    // The move comes before the engine has finished with the starting position.
    session.gameChanged(start)
    session.gameChanged(afterE4)
    expect(types(await heard(hub, session))).toEqual(['game_started', 'move'])
  })

  it('tells no one anything while Claude is not listening', async () => {
    const hub = testHub({ connected: false })
    const session = new CoachSession(hub, fakeAnalyst(), () => undefined)
    for (const state of [start, afterE4]) session.gameChanged(state)
    hub.touch()
    expect(await heard(hub, session)).toEqual([])
  })

  it('takes down the arrows when the game moves on', () => {
    const hub = testHub()
    const session = new CoachSession(hub, fakeAnalyst(), () => undefined)
    session.gameChanged(start)
    hub.setCandidates({ fen: start.position.fen, moves: [{ uci: 'e2e4', san: 'e4' }] })
    session.gameChanged(afterE4)
    expect(hub.state().candidates).toBeNull()
  })
})
