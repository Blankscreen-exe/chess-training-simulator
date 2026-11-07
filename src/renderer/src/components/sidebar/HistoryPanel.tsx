import { useEffect, useState } from 'react'
import { useQuery } from '../../hooks/useQuery'
import { api } from '../../lib/api'
import { opponentName } from '../../lib/opponent'
import { describeEnding, playerOutcome, type PlayerOutcome } from '../../lib/outcome'

const TONES: Record<PlayerOutcome, string> = {
  won: 'text-emerald-300',
  lost: 'text-red-300',
  drawn: 'text-stone-300',
  unfinished: 'text-stone-400',
  in_progress: 'text-amber-200',
}

/** Past games, newest first; clicking one opens it to step through. */
export function HistoryPanel({ onOpen }: { onOpen: (id: number) => void }) {
  // Each change to the game may change the list, so it is fetched again.
  const [version, setVersion] = useState(0)
  useEffect(() => api.on('game:state', () => setVersion((value) => value + 1)), [])
  const { data: games, error } = useQuery(`history:${version}`, () => api.games.list())

  if (error) return <p className="p-4 text-sm text-red-300">{error}</p>
  if (!games) return <p className="p-4 text-sm text-stone-500">Loading…</p>
  if (games.length === 0) return <p className="p-4 text-sm text-stone-500">No games yet.</p>

  return (
    <ul className="min-h-0 flex-1 divide-y divide-stone-800 overflow-y-auto">
      {games.map((game) => {
        const moves = Math.ceil(game.plies / 2)
        return (
          <li key={game.id}>
            <button
              type="button"
              onClick={() => onOpen(game.id)}
              className="w-full px-4 py-2.5 text-left hover:bg-stone-800/70"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-medium ${TONES[playerOutcome(game)]}`}>
                  {describeEnding(game)}
                </span>
                <span className="shrink-0 text-xs text-stone-500">
                  {new Date(game.startedAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <p className="text-xs text-stone-500">
                {game.playerColor === 'white' ? 'White' : 'Black'} vs {opponentName(game)} · {moves}{' '}
                {moves === 1 ? 'move' : 'moves'}
              </p>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
