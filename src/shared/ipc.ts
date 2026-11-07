// The contract between the renderer and the main process.
//
// Adding a request means three edits, each checked by the compiler against this file: a channel
// in IpcContract, its method in API_CHANNELS, and its argument schema and handler in the main
// process (src/main/ipc.ts, src/main/services.ts).
import type {
  Analysis,
  AnalysisRequest,
  GameRecord,
  GameState,
  GameSummary,
  LineStep,
  MoveInput,
  NewGameOptions,
  Position,
  Result,
} from './chess'
import type { BoardCommand, ChatMessage, CoachSettings, CoachState } from './coach'

/** The app's name, version and the versions of what it runs on. */
export interface AppInfo {
  name: string
  version: string
  /** The operating system, as Node names it: win32, darwin or linux. */
  platform: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
}

type GameChange = Result<{ state: GameState }>

/** Every request the renderer can make: its arguments and what it is answered with. */
export interface IpcContract {
  'app:get-info': { args: []; result: AppInfo }
  'game:get': { args: []; result: GameState | null }
  'game:new': { args: [options: NewGameOptions]; result: GameChange }
  'game:move': { args: [move: MoveInput]; result: GameChange }
  'game:resign': { args: []; result: GameChange }
  'game:abandon': { args: []; result: GameChange }
  'game:retry-opponent': { args: []; result: GameChange }
  'games:list': { args: []; result: GameSummary[] }
  'games:get': { args: [id: number]; result: Result<{ game: GameRecord }> }
  'position:describe': { args: [fen: string]; result: Result<{ position: Position }> }
  'position:play': {
    args: [fen: string, move: MoveInput]
    result: Result<{ san: string; position: Position }>
  }
  'line:resolve': { args: [fen: string, moves: string[]]; result: Result<{ steps: LineStep[] }> }
  'analysis:run': {
    args: [request: AnalysisRequest]
    result: Result<{ analysis: Analysis | null }>
  }
  'coach:get': { args: []; result: CoachState }
  'coach:send': { args: [text: string]; result: Result<{ message: ChatMessage }> }
  'coach:set-settings': { args: [change: Partial<CoachSettings>]; result: CoachState }
}

export type IpcChannel = keyof IpcContract
export type IpcArgs<C extends IpcChannel> = IpcContract[C]['args']
export type IpcResult<C extends IpcChannel> = IpcContract[C]['result']

/** What the main process tells the renderer without being asked. */
export interface IpcEvents {
  'game:state': GameState | null
  'coach:state': CoachState
  /** Something the coach asks the board to do, once. */
  'coach:board': BoardCommand
}

export type IpcEvent = keyof IpcEvents

/** A tree of names whose leaves are channels: the shape of `window.api`. */
export interface ApiTree {
  readonly [name: string]: IpcChannel | ApiTree
}

/** How the page calls each channel, as `window.api.game.move(...)` and so on. */
export const API_CHANNELS = {
  app: { info: 'app:get-info' },
  game: {
    get: 'game:get',
    start: 'game:new',
    move: 'game:move',
    resign: 'game:resign',
    abandon: 'game:abandon',
    retryOpponent: 'game:retry-opponent',
  },
  games: { list: 'games:list', get: 'games:get' },
  position: { describe: 'position:describe', play: 'position:play' },
  line: { resolve: 'line:resolve' },
  analysis: { run: 'analysis:run' },
  coach: { get: 'coach:get', send: 'coach:send', setSettings: 'coach:set-settings' },
} as const satisfies ApiTree

export type ApiOf<T> = {
  readonly [K in keyof T]: T[K] extends IpcChannel
    ? (...args: IpcArgs<T[K]>) => Promise<IpcResult<T[K]>>
    : ApiOf<T[K]>
}

/** What the preload script gives the renderer, as `window.api`. */
export type RendererApi = ApiOf<typeof API_CHANNELS> & {
  /** Calls `listener` whenever the main process sends `event`; returns a function that stops it. */
  on<E extends IpcEvent>(event: E, listener: (payload: IpcEvents[E]) => void): () => void
}

// Fails to compile if a channel in the contract is missing from API_CHANNELS.
type ChannelsIn<T> = { [K in keyof T]: T[K] extends IpcChannel ? T[K] : ChannelsIn<T[K]> }[keyof T]
type MustBeNever<T extends never> = T
export type UnexposedChannels = MustBeNever<Exclude<IpcChannel, ChannelsIn<typeof API_CHANNELS>>>
