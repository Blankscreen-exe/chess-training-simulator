// Builds what the app runs on, answers the page's requests with it, and tells the page when
// things change.
import { join } from 'node:path'
import { app, net } from 'electron'
import { z } from 'zod'
import {
  COACHING_MODES,
  DEFAULT_COACH_PORT,
  DEFAULT_COACH_SETTINGS,
  PLAYER_LEVELS,
} from '@shared/coach'
import type { IpcEvent, IpcEvents } from '@shared/ipc'
import { AnalysisService } from './analysis/service'
import { appInfo } from './app-info'
import { describeFen, playMove, resolveLine } from './chess/rules'
import { CoachAnalyst } from './coach/analyst'
import { CoachHub, type SettingsKeeper } from './coach/hub'
import { CoachOpponent } from './coach/opponent'
import { startCoachServer, type CoachServer } from './coach/server'
import { CoachSession } from './coach/session'
import { engineOpponent } from './engine/opponent'
import { EngineSlot } from './engine/slot'
import { utilityTransport } from './engine/utility-transport'
import { GameService } from './games/service'
import { GameStore } from './games/store'
import type { IpcHandlers } from './ipc/register'
import { LibraryService } from './library/service'
import { PracticeStore } from './profile/practice'
import { ProfileService } from './profile/service'
import { WeaknessStore } from './profile/weaknesses'
import { AttemptStore } from './puzzles/attempts'
import { PuzzleService } from './puzzles/service'
import { ReviewService } from './reviews/service'
import { ReviewStore } from './reviews/store'
import { openDatabase } from './storage/database'
import { SettingsStore } from './storage/settings'

const DATABASE_FILE = 'games.db'
const LIBRARY_FILE = 'library.db'
/** How often the coach's connection is re-checked, as it lapses with time alone. */
const COACH_CHECK_MS = 5_000
const COACH_SETTINGS_KEY = 'coach'

const CoachSettingsSchema = z.object({
  mode: z.enum(COACHING_MODES),
  playerLevel: z.enum(PLAYER_LEVELS),
})

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
  const log = (message: string, error?: unknown) => console.error(message, error)
  const db = openDatabase(join(app.getPath('userData'), DATABASE_FILE))
  const settings = new SettingsStore(db)
  const keeper: SettingsKeeper = {
    load: () => settings.get(COACH_SETTINGS_KEY, CoachSettingsSchema, DEFAULT_COACH_SETTINGS),
    save: (value) => settings.set(COACH_SETTINGS_KEY, value),
  }

  // Four engines, so that playing, the analysis panel, the coach and reviewing games never wait
  // on, or change the settings of, one another. Each starts when first needed.
  const opponentEngine = new EngineSlot(() => utilityTransport('Stockfish (opponent)'))
  const panelEngine = new EngineSlot(() => utilityTransport('Stockfish (analysis)'))
  const coachEngine = new EngineSlot(() => utilityTransport('Stockfish (coach)'))
  const reviewEngine = new EngineSlot(() => utilityTransport('Stockfish (reviews)'))

  const coach = new CoachHub({ port: coachPort(), settings: keeper })
  const analyst = new CoachAnalyst(() => coachEngine.get())
  const session = new CoachSession(coach, analyst, log)
  const stockfish = engineOpponent(() => opponentEngine.get(), log)
  const coachOpponent = new CoachOpponent(coach, analyst, stockfish)

  const gameStore = new GameStore(db)
  const games = new GameService({
    store: gameStore,
    opponents: { engine: stockfish, coach: coachOpponent },
    log,
  })
  const analysis = new AnalysisService(() => panelEngine.get())
  const library = new LibraryService({
    path: join(app.getPath('userData'), LIBRARY_FILE),
    // Electron's own fetch, which goes through the system's proxy settings.
    fetch: (url, init) => net.fetch(url, init),
    log,
  })
  const attempts = new AttemptStore(db)
  const practice = new PracticeStore(db)
  const reviewStore = new ReviewStore(db)
  const profile = new ProfileService({
    attempts,
    games: gameStore,
    reviews: reviewStore,
    weaknesses: new WeaknessStore(db),
    practice,
    level: () => coach.currentSettings.playerLevel,
  })
  const reviews = new ReviewService({
    store: reviewStore,
    games,
    library,
    analyst: new CoachAnalyst(() => reviewEngine.get()),
    practice,
    log,
  })
  const puzzles = new PuzzleService({
    library,
    attempts,
    practice,
    ratings: () => profile.puzzleRatings(),
    weakSpots: () => profile.weakSpots(),
  })

  games.onChange((state) => {
    session.gameChanged(state)
    reviews.gameChanged(state)
    broadcast('game:state', state)
  })
  puzzles.onChange((state) => {
    session.puzzleChanged(state, puzzles.answer() ?? [])
    broadcast('puzzle:state', state)
  })
  puzzles.onTryEnded(() => profile.changed())
  reviews.onReviewed(() => profile.changed())
  profile.onChange((state) => broadcast('profile:state', state))
  library.onChange((state) => broadcast('library:state', state))
  coach.onChange((state) => broadcast('coach:state', state))
  coach.onBoardCommand((command) => broadcast('coach:board', command))
  const coachCheck = setInterval(() => coach.refresh(), COACH_CHECK_MS)
  reviews.catchUp()

  let coachServer: CoachServer | null = null
  startCoachServer({
    port: coachPort(),
    version: app.getVersion(),
    context: {
      hub: coach,
      session,
      analyst,
      opponent: coachOpponent,
      games,
      library,
      puzzles,
      reviews,
      profile,
    },
    log,
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
    'game:retry-opponent': () => games.retryOpponent(),
    'games:list': () => games.list(),
    'games:get': (id) => games.record(id),
    'position:describe': (fen) => describeFen(fen),
    'position:play': (fen, move) => playMove(fen, move),
    'line:resolve': (fen, moves) => resolveLine(fen, moves),
    'analysis:run': (request) => analysis.analyse(request),
    'coach:get': () => coach.state(),
    'coach:send': (text) => coach.playerMessage(text),
    'coach:set-settings': (change) => {
      coach.updateSettings(change, 'player')
      return coach.state()
    },
    'library:get': () => library.state(),
    'library:install': () => library.startInstall(),
    'library:cancel': () => library.cancelInstall(),
    'opening:of': (positions) => library.openingAt(positions),
    'puzzle:get': () => puzzles.current(),
    'puzzle:start': (request) => puzzles.start(request),
    'puzzle:move': (move) => puzzles.move(move),
    'puzzle:hint': () => puzzles.hint(),
    'puzzle:reveal': () => puzzles.reveal(),
    'puzzle:close': () => {
      puzzles.close()
      return null
    },
    'profile:get': () => profile.profile(),
    'profile:forget-weakness': (id) => profile.forgetWeakness(id),
  }

  return {
    games,
    handlers,
    async close() {
      clearInterval(coachCheck)
      await coachServer?.close()
      opponentEngine.close()
      panelEngine.close()
      coachEngine.close()
      reviewEngine.close()
      // A puzzle still being solved is noted as left.
      puzzles.close()
      library.close()
      db.close()
    },
  }
}
