// The file that lets Claude Code, started in this repository, find the coach. It is written by
// hand, so this test keeps it in step with the code.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { coachUrl, COACH_SERVER_NAME, DEFAULT_COACH_PORT } from '@shared/coach'

describe('repository configuration for Claude Code', () => {
  it('points .mcp.json at the coach server', () => {
    expect(JSON.parse(readFileSync('.mcp.json', 'utf8'))).toEqual({
      mcpServers: { [COACH_SERVER_NAME]: { type: 'http', url: coachUrl(DEFAULT_COACH_PORT) } },
    })
  })
})
