// The library the app trains with: the one installed, and installing a new one. An install is
// built in a file of its own and put in place only once complete, so the library in use stays
// usable until then, and a failed or cancelled install leaves it as it was.
import { renameSync } from 'node:fs'
import type { GameRecord, Result } from '@shared/chess'
import { errorMessage } from '@shared/errors'
import type { InstallProgress, LibraryState, Opening } from '@shared/training'
import { Listeners } from '../util/listeners'
import { LibraryStore } from './database'
import { buildLibrary, type Fetch, type LibrarySources } from './installer'
import { positionKey } from './openings'

export interface LibraryServiceOptions {
  /** Where the library is kept. */
  path: string
  fetch: Fetch
  sources?: LibrarySources
  log?: (message: string, error?: unknown) => void
}

export class LibraryService {
  private store: LibraryStore | null
  private install: { abort: AbortController; progress: InstallProgress } | null = null
  private error: string | null = null
  private readonly listeners = new Listeners<LibraryState>()

  constructor(private readonly options: LibraryServiceOptions) {
    this.store = LibraryStore.open(options.path)
  }

  /** The library installed, to read from; null if there is none yet. */
  get installed(): LibraryStore | null {
    return this.store
  }

  /** The named opening a game is in; null if it has none, or there is no library. */
  openingOf(game: Pick<GameRecord, 'initialFen' | 'moves'>): Opening | null {
    return this.openingAt([game.initialFen, ...game.moves.map((move) => move.fenAfter)])
  }

  /** The named opening of a game's positions, given as FEN from its start. */
  openingAt(fens: readonly string[]): Opening | null {
    return this.store?.openingOf(fens.map(positionKey)) ?? null
  }

  state(): LibraryState {
    return {
      contents: this.store?.contents ?? null,
      install: this.install?.progress ?? null,
      error: this.error,
    }
  }

  onChange(listener: (state: LibraryState) => void): () => void {
    return this.listeners.add(listener)
  }

  /** Starts installing the library, or a newer one in place of it; progress comes as changes. */
  startInstall(): Result<{ state: LibraryState }> {
    if (this.install) return { ok: false, error: 'The library is already being installed' }
    const abort = new AbortController()
    this.install = {
      abort,
      progress: { stage: 'puzzles', receivedBytes: 0, totalBytes: null, puzzles: 0 },
    }
    this.error = null
    this.emit()
    void this.run(abort)
    return { ok: true, state: this.state() }
  }

  cancelInstall(): LibraryState {
    this.install?.abort.abort()
    return this.state()
  }

  close(): void {
    this.install?.abort.abort()
    this.store?.close()
    this.store = null
  }

  private async run(abort: AbortController): Promise<void> {
    const building = `${this.options.path}.partial`
    try {
      await buildLibrary({
        path: building,
        fetch: this.options.fetch,
        signal: abort.signal,
        ...(this.options.sources ? { sources: this.options.sources } : {}),
        onProgress: (progress) => {
          if (this.install?.abort !== abort) return
          this.install.progress = progress
          this.emit()
        },
      })
      // The old library must be closed before its file can be replaced, on Windows.
      this.store?.close()
      this.store = null
      renameSync(building, this.options.path)
      this.store = LibraryStore.open(this.options.path)
      if (!this.store) throw new Error('The new library could not be opened')
    } catch (error) {
      if (!abort.signal.aborted) {
        this.options.log?.('Installing the library failed', error)
        this.error = errorMessage(error)
      }
      this.store ??= LibraryStore.open(this.options.path)
    } finally {
      this.install = null
      this.emit()
    }
  }

  private emit(): void {
    this.listeners.emit(this.state())
  }
}
