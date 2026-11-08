// The real server, on a free port, called by the MCP SDK's own client as Claude Code calls it,
// with the real game service, coach session and analysis (Stockfish, in this process).
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { BoardCommand } from '@shared/coach'
import { coachUrl } from '@shared/coach'
import { Engine } from '../engine/engine'
import { inProcessTransport } from '../engine/in-process-transport'
import type { Opponent } from '../games/opponent'
import { GameService } from '../games/service'
import { GameStore } from '../games/store'
import { LibraryService } from '../library/service'
import { testLibrary } from '../library/test-support'
import { PracticeStore } from '../profile/practice'
import { ProfileService } from '../profile/service'
import { WeaknessStore } from '../profile/weaknesses'
import { AttemptStore } from '../puzzles/attempts'
import { PuzzleService } from '../puzzles/service'
import { ReviewService } from '../reviews/service'
import { ReviewStore } from '../reviews/store'
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
let library: LibraryService
let puzzles: PuzzleService
let profile: ProfileService
let commands: BoardCommand[] = []
const folder = mkdtempSync(join(tmpdir(), 'coach-server-'))

beforeAll(async () => {
  hub = testHub({ settings: { mode: 'silent', playerLevel: 'casual' } })
  const analyst = new CoachAnalyst(() => engine)
  const session = new CoachSession(hub, analyst, () => undefined)
  const opponent = new CoachOpponent(hub, analyst, instantOpponent)
  const db = openDatabase(':memory:')
  const libraryPath = join(folder, 'library.db')
  testLibrary(libraryPath).close()
  library = new LibraryService({
    path: libraryPath,
    fetch: () => Promise.reject(new Error('No downloads in tests')),
  })
  const attempts = new AttemptStore(db)
  const practice = new PracticeStore(db)
  const gameStore = new GameStore(db)
  const reviewStore = new ReviewStore(db)
  profile = new ProfileService({
    attempts,
    games: gameStore,
    reviews: reviewStore,
    weaknesses: new WeaknessStore(db),
    practice,
    level: () => hub.currentSettings.playerLevel,
  })
  puzzles = new PuzzleService({
    library,
    attempts,
    practice,
    ratings: () => ({ min: 1700, max: 1900 }),
    weakSpots: () => profile.weakSpots(),
    replyDelayMs: 0,
  })
  puzzles.onChange((state) => session.puzzleChanged(state, puzzles.answer() ?? []))
  games = new GameService({
    store: gameStore,
    opponents: { engine: instantOpponent, coach: opponent },
    minReplyDelayMs: 0,
    log: () => undefined,
  })
  const reviews = new ReviewService({
    store: reviewStore,
    games,
    library,
    analyst,
    practice,
    log: () => undefined,
  })
  games.onChange((state) => session.gameChanged(state))
  hub.onBoardCommand((command) => commands.push(command))
  server = await startCoachServer({
    port: 0,
    version: '0.0.0-test',
    context: { hub, session, analyst, opponent, games, library, puzzles, reviews, profile },
    log: () => undefined,
  })
  client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(coachUrl(server.port))))
})

afterAll(async () => {
  await client.close()
  await server.close()
  engine.close()
  library.close()
  rmSync(folder, { recursive: true, force: true })
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
      'check_line',
      'end_game',
      'find_openings',
      'find_puzzles',
      'get_game_state',
      'get_player_profile',
      'log_weakness',
      'make_move',
      'new_game',
      'play_preview',
      'review_game',
      'say',
      'set_mode',
      'set_position',
      'show_candidates',
      'start_puzzle',
      'wait_for_event',
    ])
  })

  it('says there is no game, and gives the coaching settings, before one starts', async () => {
    expect(await call('get_game_state')).toEqual({
      coaching: { mode: 'silent', player_level: 'casual' },
      game: null,
      puzzle: null,
      library_installed: true,
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

describe('training from the library', () => {
  /** Waits for events until one of `type` comes, and returns it. */
  async function nextEvent(type: string): Promise<Record<string, unknown>> {
    for (;;) {
      const { events } = (await call('wait_for_event')) as { events: Record<string, unknown>[] }
      const found = events.find((event) => event['type'] === type)
      if (found) return found
    }
  }

  it('finds puzzles to show, with answers play_preview takes as they are', async () => {
    const found = (await call('find_puzzles', { piece: 'rook', count: 5 })) as {
      puzzles: { puzzle_id: string; fen: string; answer: string[] }[]
    }
    expect(found.puzzles.map((p) => p.puzzle_id)).toEqual(['00008'])
    const [example] = found.puzzles
    expect(example?.answer).toEqual(['Rxe7', 'Qb1+', 'Nc1', 'Qxc1+', 'Qxc1'])
    const preview = { fen: example?.fen, title: 'A rook trick', moves: example?.answer }
    expect(await call('play_preview', preview)).toHaveProperty('playing')
    expect(await call('find_puzzles', { theme: 'zugzwang' })).toEqual({
      refused: 'No puzzle in the library fits that. Try another theme or piece.',
    })
  })

  it('puts a puzzle on the board, and tells the coach how the player gets on', async () => {
    const started = await call('start_puzzle', { puzzle_id: '0000H', title: 'Mates, 1 of 3' })
    expect(started).toMatchObject({
      puzzle_id: '0000H',
      title: 'Mates, 1 of 3',
      player_color: 'black',
      opponent_move: '15. Qxh5',
      answer: '15… Qg2#',
      moves_to_find: 1,
      themes: ['Checkmate', 'Mate in 1', 'Middlegame', 'One move'],
    })
    expect((await nextEvent('puzzle_started'))['puzzle']).toMatchObject({ puzzle_id: '0000H' })
    puzzles.move({ from: 'd5', to: 'd4' })
    expect(await nextEvent('puzzle_move')).toMatchObject({ move: 'Qxd4', right: false })
    puzzles.move({ from: 'd5', to: 'g2' })
    expect(await nextEvent('puzzle_ended')).toEqual({
      type: 'puzzle_ended',
      result: 'solved',
      mistakes: 1,
      hints: 0,
    })
    expect(await call('get_game_state')).toMatchObject({ puzzle: { status: 'solved' } })
  })

  it('finds openings by name and by first moves', async () => {
    const byName = (await call('find_openings', { name: 'sicilian' })) as {
      start_fen: string
      openings: { name: string; line: string; moves: string[] }[]
    }
    expect(byName.openings.map((o) => o.name)).toEqual([
      'Sicilian Defense',
      'Sicilian Defense: Najdorf Variation',
    ])
    expect(byName.openings[0]).toMatchObject({ line: '1. e4 c5', moves: ['e4', 'c5'] })
    // Shown from the standard start, whatever the game's position.
    const preview = { fen: byName.start_fen, title: 'Najdorf', moves: byName.openings[1]?.moves }
    expect(await call('play_preview', preview)).toEqual({
      playing: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
    })
    // Moves may be written in UCI; they are matched in standard notation.
    const byMoves = (await call('find_openings', { moves: ['e2e4', 'e7e5'] })) as {
      openings: { name: string }[]
    }
    expect(byMoves.openings.map((o) => o.name)).toEqual(['Italian Game'])
  })

  it('judges each move of a line, and says where it ends', { timeout: 30_000 }, async () => {
    const checked = (await call('check_line', {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moves: ['f3', 'e5', 'g4', 'Qh4#'],
    })) as { line: string; moves: { quality: string; by: string }[]; end_evaluation: string }
    expect(checked.moves.map((m) => m.by)).toEqual(['white', 'black', 'white', 'black'])
    expect(checked.moves[2]?.quality).toBe('blunder')
    expect(checked.line).toMatch(/2\. g4\?\? Qh4#$/)
    expect(checked.end_evaluation).toBe('checkmate')
  })

  it("reviews a game, from the player's side", { timeout: 30_000 }, async () => {
    await call('new_game', { player_color: 'white', opponent: 'engine' })
    games.move({ from: 'e2', to: 'e4' })
    await settle()
    games.move({ from: 'd1', to: 'h5' })
    await settle()
    const review = (await call('review_game')) as {
      annotated_moves: string
      player_moves: Record<string, number>
    }
    expect(review.annotated_moves).toMatch(/^1\. e4 /)
    expect(Object.values(review.player_moves).reduce((a, b) => a + b)).toBe(2)
    expect(await call('review_game', { game_id: 999 })).toHaveProperty('refused')
  })
})

describe("the player's profile", () => {
  it('says what the app knows of the player, from their level up', async () => {
    expect(await call('get_player_profile')).toMatchObject({
      player_level: 'casual',
      puzzles: { rating: null, weakest_themes: [] },
      weaknesses: [],
      weak_spots: [],
      practice: { due_now: 0 },
    })
  })

  it('notes a weakness, counts it again under the same name, and aims puzzles at it', async () => {
    const note = { pattern: 'Misses rook tricks', theme: 'middlegame', note: '12. Re7 missed' }
    expect(await call('log_weakness', note)).toEqual({
      pattern: 'Misses rook tricks',
      times_noted: 1,
    })
    expect(await call('log_weakness', { pattern: 'misses rook tricks' })).toEqual({
      pattern: 'Misses rook tricks',
      times_noted: 2,
    })
    expect(await call('get_player_profile')).toMatchObject({
      weaknesses: [{ pattern: 'Misses rook tricks', theme: 'middlegame', times_noted: 2 }],
      weak_spots: ['middlegame'],
    })
    const found = (await call('find_puzzles', { for_weaknesses: true, piece: 'rook' })) as {
      puzzles: { puzzle_id: string }[]
    }
    expect(found.puzzles.map((p) => p.puzzle_id)).toEqual(['00008'])
    expect(await call('log_weakness', { pattern: 'x' })).toHaveProperty('refused')
  })

  it('keeps the puzzle the player missed to practise, when it comes back', async () => {
    // The mate in one they got wrong first, above.
    const { practice } = (await call('get_player_profile')) as {
      practice: { due_now: number; coming_back_later: number; next_due: string }
    }
    expect(practice).toMatchObject({ due_now: 0, coming_back_later: 1 })
    expect(practice.next_due).toMatch(/^in \d+ hours$/)
    expect(await call('start_puzzle', { practice: true })).toHaveProperty(
      'refused',
      `Nothing is due for practice now: the next comes back ${practice.next_due}`,
    )
  })
})
