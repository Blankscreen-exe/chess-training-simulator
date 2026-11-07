// The real server, on a free port, called by the MCP SDK's own client as Claude Code calls it,
// with the real game service, coach session and analysis (Stockfish, in this process).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Chess } from 'chess.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { BoardCommand } from '@shared/coach'
import { coachUrl } from '@shared/coach'
import { Engine } from '../engine/engine'
import { inProcessTransport } from '../engine/in-process-transport'
import type { Opponent } from '../games/opponent'
import { GameService } from '../games/service'
import { GameStore } from '../games/store'
import { openDatabase } from '../storage/database'
import { CoachAnalyst } from './analyst'
import type { CoachHub } from './hub'
import { COACH_INSTRUCTIONS } from './instructions'
import { CoachOpponent } from './opponent'
import { startCoachServer, type CoachServer } from './server'
import { CoachSession } from './session'
import { testHub } from './test-support'

/** Plays the first legal move at once, so tests do not wait on the engine to move. */
const instantOpponent: Opponent = {
  chooseMove: ({ fen }) => {
    const [move] = new Chess(fen).moves({ verbose: true })
    return Promise.resolve(move ? `${move.from}${move.to}${move.promotion ?? ''}` : null)
  },
}

const engine = new Engine(inProcessTransport())
let server: CoachServer
let hub: CoachHub
let games: GameService
let client: Client
let commands: BoardCommand[] = []

beforeAll(async () => {
  hub = testHub({ settings: { mode: 'silent', playerLevel: 'casual' } })
  const analyst = new CoachAnalyst(() => engine)
  const session = new CoachSession(hub, analyst, () => undefined)
  const opponent = new CoachOpponent(hub, analyst, instantOpponent)
  games = new GameService({
    store: new GameStore(openDatabase(':memory:')),
    opponents: { engine: instantOpponent, coach: opponent },
    minReplyDelayMs: 0,
    log: () => undefined,
  })
  games.onChange((state) => session.gameChanged(state))
  hub.onBoardCommand((command) => commands.push(command))
  server = await startCoachServer({
    port: 0,
    version: '0.0.0-test',
    context: { hub, session, analyst, opponent, games },
    log: () => undefined,
  })
  client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(coachUrl(server.port))))
})

afterAll(async () => {
  await client.close()
  await server.close()
  engine.close()
})

beforeEach(() => {
  commands = []
})

/** Calls a tool: its answer as JSON, or what it refused with. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as { text: string }[])[0]?.text ?? ''
  return result.isError ? { refused: text } : (JSON.parse(text) as Record<string, unknown>)
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('the coach server', () => {
  it('introduces itself with the coaching rules and every tool', async () => {
    expect(client.getInstructions()).toBe(COACH_INSTRUCTIONS)
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'analyze_position',
      'end_game',
      'get_game_state',
      'make_move',
      'new_game',
      'play_preview',
      'say',
      'set_mode',
      'set_position',
      'show_candidates',
      'wait_for_event',
    ])
  })

  it('says there is no game, and gives the coaching settings, before one starts', async () => {
    expect(await call('get_game_state')).toEqual({
      coaching: { mode: 'silent', player_level: 'casual' },
      game: null,
    })
  })

  it('starts a game when asked, and shows it', async () => {
    expect(await call('new_game', { player_color: 'white', engine_level: 2 })).toMatchObject({
      player_color: 'white',
      engine_level: 'Level 2',
      opponent: 'engine',
      side_to_move: 'white',
    })
    expect(commands).toEqual([{ type: 'show-game' }])
  })

  it("analyses the game's position, in words and numbered lines", async () => {
    const analysis = await call('analyze_position', { lines: 2 })
    expect(analysis).toMatchObject({ side_to_move: 'white' })
    const lines = analysis['lines'] as { evaluation: string; line: string; moves: string[] }[]
    expect(lines).toHaveLength(2)
    expect(lines[0]?.line).toMatch(/^1\. /)
    expect(lines[0]?.line).toContain(lines[0]?.moves[0])
    expect(lines[0]?.evaluation).toMatch(/level|better/)
    // Each line's moves go straight into play_preview.
    expect(await call('play_preview', { title: 'line', moves: lines[0]?.moves })).toHaveProperty(
      'playing',
    )
  })

  it('draws candidate moves written in standard notation, and refuses illegal ones', async () => {
    expect(
      await call('show_candidates', { moves: [{ move: 'e4', note: 'centre' }, { move: 'Nf3' }] }),
    ).toEqual({ shown: ['e4', 'Nf3'] })
    expect(hub.state().candidates?.moves).toEqual([
      { uci: 'e2e4', san: 'e4', note: 'centre' },
      { uci: 'g1f3', san: 'Nf3' },
    ])
    expect(await call('show_candidates', { moves: [{ move: 'Ke2' }] })).toEqual({
      refused: 'Ke2 is not a legal move in that position',
    })
    await call('show_candidates', { moves: [] })
    expect(hub.state().candidates).toBeNull()
  })

  it('plays a line out on the board, with captions, and refuses an illegal one', async () => {
    expect(
      await call('play_preview', {
        title: 'Italian',
        moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
        captions: ['Take the centre'],
      }),
    ).toEqual({ playing: '1. e4 e5 2. Nf3 Nc6 3. Bc4' })
    expect(commands[0]).toMatchObject({
      type: 'preview',
      title: 'Italian',
      captions: ['Take the centre'],
    })
    expect(await call('play_preview', { title: 'x', moves: ['e4', 'e4'] })).toEqual({
      refused: 'Move 2, e4, is not a legal move there',
    })
  })

  it('opens the analysis board on a position, and refuses an impossible one', async () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    expect(await call('set_position', { fen })).toEqual({ fen, side_to_move: 'white' })
    expect(commands[0]).toMatchObject({ type: 'open-analysis', start: { fen } })
    expect(await call('set_position', { fen: '8/8/8/8/8/8/8/8 w - - 0 1' })).toEqual({
      refused: 'missing white king',
    })
  })

  it('changes the coaching mode', async () => {
    expect(await call('set_mode', { mode: 'casual' })).toEqual({ mode: 'casual' })
    expect(hub.currentSettings.mode).toBe('casual')
    await call('set_mode', { mode: 'silent' })
  })

  it("refuses make_move unless it is the coach's move as the opponent", async () => {
    expect(await call('make_move', { move: 'e5' })).toEqual({
      refused: 'It is not your move as the opponent',
    })
  })

  it('lets the coach play the opponent, only with the moves it is offered', async () => {
    await call('new_game', { player_color: 'black', opponent: 'coach' })
    // The coach is White, so moves first: it is offered the engine's best moves.
    let offer: { candidates: { move: string }[] } | undefined
    while (!offer) {
      const { events } = (await call('wait_for_event')) as { events: { type: string }[] }
      offer = events.find((event) => event.type === 'opponent_to_move') as typeof offer
    }
    const offered = offer.candidates.map((candidate) => candidate.move)
    expect(offered.length).toBeGreaterThan(0)

    const notOffered = ['a3', 'h3', 'a4', 'h4'].find((move) => !offered.includes(move))
    const refusal = await call('make_move', { move: notOffered })
    expect(refusal['refused']).toMatch(/^Choose one of the moves offered/)
    expect(await call('make_move', { move: offered[0] })).toEqual({ move: offered[0] })
    await settle()
    expect(games.current()?.moves.map((move) => move.san)).toEqual([offered[0]])
  })

  it('leaves the game unfinished when asked', async () => {
    expect(await call('end_game')).toMatchObject({ state: { status: 'abandoned' } })
  })

  it('delivers what the player writes, and writes back in the chat', async () => {
    hub.playerMessage('Which opening suits me?')
    // Events from earlier tests (the game just ended) may come first. That a waiting call is
    // woken at once is the hub's own test.
    const heard: unknown[] = []
    while (!heard.some((event) => (event as { type: string }).type === 'player_message')) {
      heard.push(...((await call('wait_for_event'))['events'] as unknown[]))
    }
    expect(heard).toContainEqual({ type: 'player_message', text: 'Which opening suits me?' })
    await call('say', { text: 'Let us look at your games first.' })
    expect(hub.state().messages.at(-1)).toMatchObject({ from: 'coach' })
  })

  it('refuses a message that is too long', async () => {
    const result = await client.callTool({ name: 'say', arguments: { text: 'x'.repeat(5000) } })
    expect(result.isError).toBe(true)
  })

  it('refuses requests from web pages', async () => {
    const response = await fetch(coachUrl(server.port), {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://example.com',
      },
    })
    expect(response.status).toBe(403)
  })
})
