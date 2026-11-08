import { describe, expect, it } from 'vitest'
import { addCoachCommand, coachUrl } from './coach'

describe('connecting the coach', () => {
  it('adds the coach for every folder, at the address it listens on', () => {
    expect(coachUrl(8765)).toBe('http://127.0.0.1:8765/mcp')
    expect(addCoachCommand(8799)).toBe(
      'claude mcp add --transport http --scope user chess-coach http://127.0.0.1:8799/mcp',
    )
  })
})
