// Who may talk to the coach's server. It listens only on this computer, but a web page open in a
// browser here could still reach it, by DNS rebinding (a site whose name points at 127.0.0.1) or
// by simply sending a request. So a request must name this computer as its host, and must not
// come from a web page: browsers always say which page sent a request, in its Origin header;
// Claude Code does not send one.
import { COACH_PATH } from '@shared/coach'

const ALLOWED_METHODS = new Set(['GET', 'POST', 'DELETE'])
const LOCAL_HOSTNAMES = ['127.0.0.1', 'localhost', '[::1]']

export type GuardVerdict = { ok: true } | { ok: false; status: number; reason: string }

export function checkRequest(
  request: {
    method: string | undefined
    url: string | undefined
    host: string | undefined
    origin: string | undefined
  },
  port: number,
): GuardVerdict {
  const path = (request.url ?? '').split('?')[0]
  if (path !== COACH_PATH) return { ok: false, status: 404, reason: 'Not found' }
  if (!LOCAL_HOSTNAMES.some((name) => request.host === `${name}:${port}`)) {
    return { ok: false, status: 403, reason: 'Only this computer may connect' }
  }
  if (request.origin !== undefined) {
    return { ok: false, status: 403, reason: 'Requests from web pages are not accepted' }
  }
  if (!ALLOWED_METHODS.has(request.method ?? '')) {
    return { ok: false, status: 405, reason: 'Method not allowed' }
  }
  return { ok: true }
}
