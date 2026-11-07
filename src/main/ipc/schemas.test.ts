import { describe, expect, it } from 'vitest'
import { START_FEN } from '@shared/chess'
import type { IpcChannel } from '@shared/ipc'
import { ARGUMENTS } from './schemas'

const accepts = (channel: IpcChannel, args: unknown[]) => ARGUMENTS[channel].safeParse(args).success

// That every channel has a schema, and is exposed to the page, the compiler checks
// (ARGUMENTS is keyed by IpcChannel; see UnexposedChannels in src/shared/ipc.ts).
describe('IPC argument schemas', () => {
  it('accept what the page sends', () => {
    expect(accepts('coach:set-settings', [{ mode: 'casual' }])).toBe(true)
    expect(
      accepts('game:new', [{ playerColor: 'random', engineLevel: 3, opponent: 'engine' }]),
    ).toBe(true)
    expect(
      accepts('game:new', [
        { playerColor: 'white', engineLevel: 8, opponent: 'coach', fen: START_FEN },
      ]),
    ).toBe(true)
    expect(accepts('game:move', [{ from: 'e7', to: 'e8', promotion: 'q' }])).toBe(true)
    expect(accepts('line:resolve', [START_FEN, ['e2e4', 'e7e5']])).toBe(true)
    expect(accepts('analysis:run', [{ fen: START_FEN, lines: 5 }])).toBe(true)
    expect(accepts('games:list', [])).toBe(true)
  })

  it('refuse anything else', () => {
    expect(
      accepts('game:new', [{ playerColor: 'white', engineLevel: 3, opponent: 'magnus' }]),
    ).toBe(false)
    expect(accepts('coach:set-settings', [{ mode: 'loud' }])).toBe(false)
    expect(
      accepts('game:new', [{ playerColor: 'white', engineLevel: 9, opponent: 'engine' }]),
    ).toBe(false)
    expect(
      accepts('game:new', [{ playerColor: 'green', engineLevel: 3, opponent: 'engine' }]),
    ).toBe(false)
    expect(
      accepts('game:new', [
        { playerColor: 'white', engineLevel: 3, opponent: 'engine', admin: true },
      ]),
    ).toBe(false)
    expect(
      accepts('game:new', [
        { playerColor: 'white', engineLevel: 3, opponent: 'engine', fen: undefined },
      ]),
    ).toBe(false)
    expect(accepts('game:move', [{ from: 'e2', to: 'e9' }])).toBe(false)
    expect(accepts('game:move', [{ from: 'e7', to: 'e8', promotion: 'k' }])).toBe(false)
    expect(accepts('line:resolve', [START_FEN, ['Nf3']])).toBe(false)
    expect(accepts('analysis:run', [{ fen: START_FEN, lines: 6 }])).toBe(false)
    expect(accepts('games:get', [-1])).toBe(false)
    expect(accepts('games:list', ['extra'])).toBe(false)
  })
})
