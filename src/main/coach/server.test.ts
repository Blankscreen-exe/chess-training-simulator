// The real server, on a free port, called by the MCP SDK's own client, as Claude Code calls it.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { GameState } from '@shared/chess'
import { START_FEN } from '@shared/chess'
import { coachUrl } from '@shared/coach'
import { CoachHub } from './hub'
import { COACH_INSTRUCTIONS } from './instructions'
import { startCoachServer, type CoachServer } from './server'

const game: GameState = {
  id: 4,
  playerColor: 'black',
  engineLevel: 5,
  startedAt: '2026-11-07T12:00:00.000Z',
  status: 'in_progress',
  result: '*',
  initialFen: START_FEN,
  moves: [],
  position: { fen: START_FEN, turn: 'white', check: false, dests: {}, promotions: [] },
  engineThinking: true,
  engineFailed: false,
}

let server: CoachServer
let hub: CoachHub
let client: Client

beforeAll(async () => {
  hub = new CoachHub({ port: 0 })
  server = await startCoachServer({
    port: 0,
    version: '0.0.0-test',
    hub,
    currentGame: () => game,
    log: () => undefined,
  })
  client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(coachUrl(server.port))))
})

afterAll(async () => {
  await client.close()
  await server.close()
})

const text = (result: Awaited<ReturnType<Client['callTool']>>) =>
  JSON.parse((result.content as { text: string }[])[0]?.text ?? 'null') as unknown

describe('the coach server', () => {
  it('introduces itself with the coaching rules and its tools', async () => {
    expect(client.getInstructions()).toBe(COACH_INSTRUCTIONS)
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'get_game_state',
      'say',
      'wait_for_event',
    ])
  })

  it('gives the game as it stands', async () => {
    expect(text(await client.callTool({ name: 'get_game_state', arguments: {} }))).toMatchObject({
      game_id: 4,
      player_color: 'black',
      engine_level: 'Level 5',
      side_to_move: 'white',
      engine_thinking: true,
      moves: '',
    })
  })

  it('delivers what the player writes, and writes back in the chat', async () => {
    const waiting = client.callTool({ name: 'wait_for_event', arguments: {} })
    // Give the request time to arrive before the message does.
    await new Promise((resolve) => setTimeout(resolve, 100))
    hub.playerMessage('Which opening suits me?')
    expect(text(await waiting)).toEqual({
      events: [{ type: 'player_message', text: 'Which opening suits me?' }],
    })

    await client.callTool({ name: 'say', arguments: { text: 'Let us look at your games first.' } })
    expect(hub.state().messages.at(-1)).toMatchObject({ from: 'coach' })
    expect(hub.state().status).toBe('connected')
  })

  it('refuses a message that is too long', async () => {
    const result = await client.callTool({ name: 'say', arguments: { text: 'x'.repeat(5000) } })
    expect(result.isError).toBe(true)
  })

  it('refuses requests from web pages and from other host names', async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    const fromPage = await fetch(coachUrl(server.port), {
      method: 'POST',
      body,
      headers: { ...headers, Origin: 'https://example.com' },
    })
    expect(fromPage.status).toBe(403)
  })
})
