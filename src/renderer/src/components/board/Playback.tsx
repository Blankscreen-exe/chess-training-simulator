/** Buttons to step through a line of moves. */
export function Playback({
  ply,
  count,
  onGo,
  playing,
  onTogglePlay,
}: {
  ply: number
  count: number
  onGo: (ply: number) => void
  playing?: boolean
  onTogglePlay?: () => void
}) {
  const button =
    'flex h-9 w-12 items-center justify-center rounded-md bg-stone-800 text-stone-200 hover:bg-stone-700 disabled:opacity-30 disabled:hover:bg-stone-800'
  return (
    <div className="flex items-center justify-center gap-1.5" role="group" aria-label="Moves">
      <button
        type="button"
        className={button}
        disabled={ply === 0}
        onClick={() => onGo(0)}
        title="First (Home)"
      >
        ⏮
      </button>
      <button
        type="button"
        className={button}
        disabled={ply === 0}
        onClick={() => onGo(ply - 1)}
        title="Back (←)"
      >
        ◀
      </button>
      {onTogglePlay && (
        <button
          type="button"
          className={button}
          onClick={onTogglePlay}
          title={playing ? 'Pause' : 'Play'}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶︎'}
        </button>
      )}
      <button
        type="button"
        className={button}
        disabled={ply >= count}
        onClick={() => onGo(ply + 1)}
        title="Forward (→)"
      >
        ▶
      </button>
      <button
        type="button"
        className={button}
        disabled={ply >= count}
        onClick={() => onGo(count)}
        title="Last (End)"
      >
        ⏭
      </button>
      <span className="ml-2 w-16 text-xs tabular-nums text-stone-500">
        {ply} / {count}
      </span>
    </div>
  )
}
