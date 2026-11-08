import type { InstallProgress, LibraryState } from '@shared/training'
import { api } from '../../lib/api'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ExternalLink } from '../ui/ExternalLink'

const MEGABYTE = 1024 * 1024

function describeProgress(progress: InstallProgress): { text: string; share: number | null } {
  switch (progress.stage) {
    case 'puzzles': {
      const received = Math.round(progress.receivedBytes / MEGABYTE)
      const total = progress.totalBytes && Math.round(progress.totalBytes / MEGABYTE)
      return {
        text: `Downloading puzzles: ${received}${total ? ` of ${total}` : ''} MB, ${progress.puzzles.toLocaleString()} kept`,
        share: progress.totalBytes ? progress.receivedBytes / progress.totalBytes : null,
      }
    }
    case 'openings':
      return { text: 'Downloading openings…', share: 1 }
    case 'finishing':
      return { text: 'Indexing…', share: 1 }
  }
}

/** The puzzles and openings the app trains with: installing them, and what is installed. */
export function LibraryCard({ library }: { library: LibraryState }) {
  const { contents, install, error } = library

  return (
    <Card title="Library">
      {contents ? (
        <p className="text-stone-300">
          {contents.puzzles.toLocaleString()} puzzles and {contents.openings.toLocaleString()}{' '}
          openings, from{' '}
          <ExternalLink href="https://database.lichess.org/#puzzles">Lichess</ExternalLink>,
          installed {new Date(contents.installedAt).toLocaleDateString()}.
        </p>
      ) : (
        <p className="text-stone-300">
          Puzzles and openings come from Lichess&apos;s free databases. Installing them downloads
          about 300 MB once, which takes a few minutes, and keeps the best 200,000 or so puzzles
          (about 40 MB).
        </p>
      )}

      {install ? (
        <InstallBar progress={install} />
      ) : (
        <Button
          variant={contents ? 'secondary' : 'primary'}
          onClick={() => void api.library.install()}
        >
          {contents ? 'Update library' : 'Install library'}
        </Button>
      )}

      {error && (
        <p className="text-red-300" role="alert">
          The install failed: {error}
        </p>
      )}
    </Card>
  )
}

function InstallBar({ progress }: { progress: InstallProgress }) {
  const { text, share } = describeProgress(progress)
  return (
    <div className="space-y-2">
      <div
        className="h-1.5 overflow-hidden rounded bg-stone-800"
        role="progressbar"
        aria-label="Installing the library"
        {...(share !== null ? { 'aria-valuenow': Math.round(share * 100) } : {})}
      >
        <div
          className={`h-full bg-amber-400 transition-[width] ${share === null ? 'w-1/3 animate-pulse' : ''}`}
          style={share !== null ? { width: `${share * 100}%` } : undefined}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-stone-400">{text}</span>
        <Button onClick={() => void api.library.cancel()}>Cancel</Button>
      </div>
    </div>
  )
}
