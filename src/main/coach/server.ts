// The MCP server Claude Code connects to: Streamable HTTP, without sessions, on this computer
// only. Each request gets its own server and transport, so nothing carries over between them
// and Claude Code goes on working if the app restarts.
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { COACH_SERVER_NAME } from '@shared/coach'
import { checkRequest } from './guard'
import { COACH_INSTRUCTIONS } from './instructions'
import { registerCoachTools, type CoachToolDependencies } from './tools'

export interface CoachServerOptions extends CoachToolDependencies {
  /** The port to listen on; 0 for any free one, as in tests. */
  port: number
  version: string
  log?: (message: string, error?: unknown) => void
}

export interface CoachServer {
  /** The port it is listening on. */
  port: number
  close(): Promise<void>
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

/** Starts listening on 127.0.0.1; rejects if it cannot, as when the port is taken. */
export async function startCoachServer(options: CoachServerOptions): Promise<CoachServer> {
  const { version, log = (message, error) => console.error(message, error) } = options
  // The port asked for, until listening says which one it got.
  let port = options.port

  const http: Server = createServer((request, response) => {
    const verdict = checkRequest(
      {
        method: request.method,
        url: request.url,
        host: request.headers.host,
        origin: header(request, 'origin'),
      },
      port,
    )
    if (!verdict.ok) {
      response.writeHead(verdict.status, { 'Content-Type': 'text/plain' }).end(verdict.reason)
      return
    }

    const server = new McpServer(
      { name: COACH_SERVER_NAME, version },
      { instructions: COACH_INSTRUCTIONS },
    )
    registerCoachTools(server, options)
    // No session id generator: stateless, so each request stands alone.
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true })
    response.on('close', () => {
      void transport.close()
      void server.close()
    })
    server
      .connect(transport)
      .then(() => transport.handleRequest(request, response))
      .catch((error: unknown) => {
        log('The coach server could not answer a request', error)
        if (!response.headersSent) response.writeHead(500).end()
      })
  })

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(port, '127.0.0.1', () => {
      http.off('error', reject)
      resolve()
    })
  })
  port = (http.address() as AddressInfo).port

  return {
    port,
    close: () =>
      new Promise((resolve) => {
        http.closeAllConnections()
        http.close(() => resolve())
      }),
  }
}
