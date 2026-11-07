// Builds what the app runs on, and answers the page's requests with it.
import { join } from 'node:path'
import { app } from 'electron'
import { AnalysisService } from './analysis/service'
import { appInfo } from './app-info'
import { describeFen, playMove, resolveLine } from './chess/rules'
import { EngineSlot } from './engine/slot'
import { utilityTransport } from './engine/utility-transport'
import { GameService } from './games/service'
import { GameStore } from './games/store'
import type { IpcHandlers } from './ipc/register'

const DATABASE_FILE = 'games.db'

export interface Services {
  games: GameService
  handlers: IpcHandlers
  close(): void
}

export function startServices(): Services {
  const store = new GameStore(join(app.getPath('userData'), DATABASE_FILE))
  // Two engines, so analysing a position never waits on, or changes the strength of, the one
  // playing the game.
  const opponent = new EngineSlot(() => utilityTransport('Stockfish (opponent)'))
  const analyst = new EngineSlot(() => utilityTransport('Stockfish (analysis)'))

  const games = new GameService({ store, engine: () => opponent.get() })
  const analysis = new AnalysisService(() => analyst.get())

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
  }

  return {
    games,
    handlers,
    close() {
      opponent.close()
      analyst.close()
      store.close()
    },
  }
}
