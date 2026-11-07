import { describe, expect, it } from 'vitest'
import { checkRequest } from './guard'

const PORT = 8765
const claudeCode = { method: 'POST', url: '/mcp', host: `127.0.0.1:${PORT}`, origin: undefined }

describe('checkRequest', () => {
  it('lets Claude Code in, by any of this computer’s names', () => {
    expect(checkRequest(claudeCode, PORT)).toEqual({ ok: true })
    expect(checkRequest({ ...claudeCode, host: `localhost:${PORT}` }, PORT)).toEqual({ ok: true })
    expect(checkRequest({ ...claudeCode, url: '/mcp?x=1' }, PORT)).toEqual({ ok: true })
  })

  it('refuses a site pretending to be this computer (DNS rebinding)', () => {
    expect(checkRequest({ ...claudeCode, host: `evil.example:${PORT}` }, PORT)).toMatchObject({
      ok: false,
      status: 403,
    })
    expect(checkRequest({ ...claudeCode, host: '127.0.0.1:9999' }, PORT)).toMatchObject({
      status: 403,
    })
    expect(checkRequest({ ...claudeCode, host: undefined }, PORT)).toMatchObject({ status: 403 })
  })

  it('refuses anything sent from a web page', () => {
    expect(checkRequest({ ...claudeCode, origin: 'https://example.com' }, PORT)).toMatchObject({
      ok: false,
      status: 403,
    })
    expect(checkRequest({ ...claudeCode, origin: 'null' }, PORT)).toMatchObject({ status: 403 })
  })

  it('answers only the MCP path, and only its methods', () => {
    expect(checkRequest({ ...claudeCode, url: '/' }, PORT)).toMatchObject({ status: 404 })
    expect(checkRequest({ ...claudeCode, method: 'PUT' }, PORT)).toMatchObject({ status: 405 })
  })
})
