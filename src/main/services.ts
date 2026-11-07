// Builds what the app runs on, answers the page's requests with it, and tells the page when
// things change.
import { join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_COACH_PORT } from '@shared/coach'
import type { IpcEvent, IpcEvents } from '@shared/ipc'
import { AnalysisService } from './analysis/service'
import { appInfo } from './app-info'
import { describeFen, playMove, resolveLine } from './chess/rules'
import { CoachHub } from './coach/hub'
import { startCoachServer, type CoachServer } from './coach/server'
import { EngineSlot } from './engine/slot'
import { utilityTransport } from './engine/utility-transport'
import { GameService } from './games/service'
import { GameStore } from './games/store'
import type { IpcHandlers } from './ipc/register'

const DATABASE_FILE = 'games.db'
/** How often the coach's connection is re-checked, as it lapses with time alone. */
const COACH_CHECK_MS = 5_000

/** Sends an event to every page of the app. */
export type Broadcast = <E extends IpcEvent>(event: E, payload: IpcEvents[E]) => void

export interface Services {
  games: GameService
  handlers: IpcHandlers
  close(): Promise<void>
}

/** The port the coach listens on: CHESS_COACH_PORT if set, for running two copies in development. */
function coachPort(): number {
  const configured = Number(process.env['CHESS_COACH_PORT'])
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_COACH_PORT
}

export function startServices(broadcast: Broadcast): Services {
  const store = new GameStore(join(app.getPath('userData'), DATABASE_FILE))
  // Two engines, so analysing a position never waits on, or changes the strength of, the one
  // playing the game.
  const opponent = new EngineSlot(() => utilityTransport('Stockfish (opponent)'))
  const analyst = new EngineSlot(() => utilityTransport('Stockfish (analysis)'))

  const games = new GameService({ store, engine: () => opponent.get() })
  const analysis = new AnalysisService(() => analyst.get())
  const coach = new CoachHub({ port: coachPort() })

  games.onChange((state) => {
    coach.gameChanged(state)
    broadcast('game:state', state)
  })
  coach.onChange((state) => broadcast('coach:state', state))
  const coachCheck = setInterval(() => coach.refresh(), COACH_CHECK_MS)

  let coachServer: CoachServer | null = null
  startCoachServer({
    port: coachPort(),
    version: app.getVersion(),
    hub: coach,
    currentGame: () => games.current(),
  }).then(
    (server) => {
      coachServer = server
    },
    (error: unknown) => {
      const taken = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
      coach.setUnavailable(
        taken
          ? `Port ${coachPort()} is in use by another program, so Claude Code cannot connect.`
          : `The coach's server could not start: ${String(error)}`,
      )
    },
  )

  const handlers: IpcHandlers = {
    'app:get-info': () => appInfo(app, process),
    'game:get': () => games.current(),
    'game:new': (options) => games.newGame(options),
    'game:move': (move) => games.move(move),
    'game:resign': () => games.resign(),
    'game:abandon': () => games.abandon(),
    'game:retry-engine': () => games.retryEngine(),
    'games:list': () => games.list(),
    'games:get': (id) => games.record(id),
    'position:describe': (fen) => describeFen(fen),
    'position:play': (fen, move) => playMove(fen, move),
    'line:resolve': (fen, moves) => resolveLine(fen, moves),
    'analysis:run': (request) => analysis.analyse(request),
    'coach:get': () => coach.state(),
    'coach:send': (text) => coach.playerMessage(text),
  }

  return {
    games,
    handlers,
    async close() {
      clearInterval(coachCheck)
      await coachServer?.close()
      opponent.close()
      analyst.close()
      store.close()
    },
  }
}
