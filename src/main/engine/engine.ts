// A UCI chess engine, Stockfish here, driven one search at a time.
import type { PlaySettings } from './levels'
import { parseBestMove, parseInfo, type UciInfo } from './uci'

/** How commands reach the engine and its replies come back. */
export interface UciTransport {
  send(command: string): void
  /** Calls `listener` with each line the engine prints; returns a function that stops it. */
  onLine(listener: (line: string) => void): () => void
  /** Calls `listener` if the engine stops by itself; returns a function that stops it. */
  onExit(listener: (reason: string) => void): () => void
  close(): void
}

/** When a search stops: after `movetimeMs` at most, and sooner if it reaches `depth`. */
export interface SearchLimits {
  movetimeMs: number
  depth?: number
}

/** The engine's best lines in a position, from the side to move. */
export interface EngineAnalysis {
  /** The depth every line has reached. */
  depth: number
  /** The best line first. */
  lines: UciInfo[]
}

export interface AnalysisOptions {
  /** How many candidate lines, at least 1. */
  lines: number
  limits: SearchLimits
  /** Asked just before the search starts; if it says no, nothing is searched and null returned. */
  stillWanted?: () => boolean
}

/** How strongly the engine plays: Stockfish's options for it. */
interface Strength {
  limitStrength: boolean
  elo?: number
  skill: number
}

const FULL_STRENGTH: Strength = { limitStrength: false, skill: 20 }

export class Engine {
  private queue: Promise<unknown> = Promise.resolve()
  private listener: ((line: string) => void) | null = null
  private failure: ((reason: Error) => void) | null = null
  private dead: Error | null = null
  private searching = false

  constructor(private readonly transport: UciTransport) {
    transport.onLine((line) => this.listener?.(line))
    transport.onExit((reason) => {
      this.dead = new Error(`The engine stopped: ${reason}`)
      this.failure?.(this.dead)
    })
    void this.exclusive(async () => {
      await this.request(['uci'], (line) => line === 'uciok')
      await this.sync()
    }).catch(() => {
      // Reported to whoever asks the engine for something next.
    })
  }

  /** Whether the engine can still be asked for anything. */
  get alive(): boolean {
    return this.dead === null
  }

  /** The engine's best lines in a position, at full strength. */
  analyse(fen: string, options: AnalysisOptions): Promise<EngineAnalysis | null> {
    return this.exclusive(async () => {
      if (options.stillWanted && !options.stillWanted()) return null
      const count = Math.max(1, options.lines)
      const { infos } = await this.search(fen, count, FULL_STRENGTH, options.limits)
      const lines = rankLines(infos.values(), count)
      const depth = lines.length > 0 ? Math.min(...lines.map((line) => line.depth)) : 0
      return { depth, lines }
    })
  }

  /** The move the engine plays in a position, at a strength; null if it has none. */
  bestMove(fen: string, settings: PlaySettings): Promise<string | null> {
    return this.exclusive(async () => {
      const { elo, skill, movetimeMs, depth } = settings
      const strength: Strength =
        elo !== undefined ? { limitStrength: true, elo, skill } : { limitStrength: false, skill }
      const limits: SearchLimits = depth !== undefined ? { movetimeMs, depth } : { movetimeMs }
      const { bestMove } = await this.search(fen, 1, strength, limits)
      return bestMove
    })
  }

  /** Tells the engine a new game is starting, so it forgets what it learned in the last. */
  newGame(): Promise<void> {
    return this.exclusive(async () => {
      this.transport.send('ucinewgame')
      await this.sync()
    })
  }

  /** Ends the search under way, if any; it finishes with what it has found so far. */
  stop(): void {
    if (this.searching) this.transport.send('stop')
  }

  close(): void {
    this.dead ??= new Error('The engine was closed')
    this.transport.send('quit')
    this.transport.close()
  }

  private async search(
    fen: string,
    multipv: number,
    strength: Strength,
    limits: SearchLimits,
  ): Promise<{ bestMove: string | null; infos: Map<string, UciInfo> }> {
    this.transport.send(`setoption name MultiPV value ${multipv}`)
    this.transport.send(`setoption name UCI_LimitStrength value ${strength.limitStrength}`)
    if (strength.elo !== undefined)
      this.transport.send(`setoption name UCI_Elo value ${strength.elo}`)
    this.transport.send(`setoption name Skill Level value ${strength.skill}`)
    await this.sync()

    // The latest line for each first move. Keyed by move, not by rank: ranks are reported depth
    // by depth, and a move can change rank between depths, so keying by rank could list it twice.
    const infos = new Map<string, UciInfo>()
    this.searching = true
    try {
      const last = await this.request([`position fen ${fen}`, goCommand(limits)], (line) => {
        const info = parseInfo(line)
        const move = info?.pv[0]
        // A bound is a guess made mid-search; keep it only until a real score arrives.
        if (info && move && !(info.bound && infos.has(move))) infos.set(move, info)
        return parseBestMove(line) !== undefined
      })
      return { bestMove: parseBestMove(last) ?? null, infos }
    } finally {
      this.searching = false
    }
  }

  /** Waits until the engine has taken in every command sent so far. */
  private async sync(): Promise<void> {
    await this.request(['isready'], (line) => line === 'readyok')
  }

  /**
   * Sends commands and waits for the line that `matches` says is the answer; earlier lines go to
   * `matches` too. It listens before sending, as an engine may answer before `send` returns.
   */
  private request(commands: string[], matches: (line: string) => boolean): Promise<string> {
    if (this.dead) return Promise.reject(this.dead)
    const answer = new Promise<string>((resolve, reject) => {
      const done = () => {
        this.listener = null
        this.failure = null
      }
      this.listener = (line) => {
        if (!matches(line)) return
        done()
        resolve(line)
      }
      this.failure = (reason) => {
        done()
        reject(reason)
      }
    })
    for (const command of commands) this.transport.send(command)
    return answer
  }

  /** Runs tasks one after another, so searches never overlap. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(() => {
      if (this.dead) throw this.dead
      return task()
    })
    this.queue = run.catch(() => undefined)
    return run
  }
}

/**
 * The best `count` lines, one per first move, ranked from 1: the deepest first, and by the
 * engine's own ranking among those of the same depth.
 */
export function rankLines(infos: Iterable<UciInfo>, count: number): UciInfo[] {
  return [...infos]
    .sort((a, b) => b.depth - a.depth || a.multipv - b.multipv)
    .slice(0, count)
    .map((info, index) => ({ ...info, multipv: index + 1 }))
}

/** The UCI command that starts a search within `limits`. */
export function goCommand(limits: SearchLimits): string {
  return limits.depth !== undefined
    ? `go movetime ${limits.movetimeMs} depth ${limits.depth}`
    : `go movetime ${limits.movetimeMs}`
}
