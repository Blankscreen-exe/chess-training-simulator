import { useEffect, useRef } from 'react'
import { scoreSheet, type SheetMove } from '../../lib/scoreSheet'

/** Moves on a score sheet; clicking one shows the position after it. */
export function MoveList({
  initialFen,
  moves,
  ply,
  onSelect,
  empty = 'No moves yet.',
}: {
  initialFen: string
  moves: readonly { san: string }[]
  /** How many moves the board is showing; the last of them is highlighted. */
  ply: number
  onSelect: (ply: number) => void
  empty?: string
}) {
  const active = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' })
  }, [ply])

  if (moves.length === 0) return <p className="px-1 py-2 text-sm text-stone-500">{empty}</p>

  const cell = (move: SheetMove | undefined, placeholder: string) => {
    if (!move) return <span className="py-1 pl-2 text-stone-600">{placeholder}</span>
    const current = move.ply === ply
    return (
      <button
        ref={current ? active : undefined}
        type="button"
        onClick={() => onSelect(move.ply)}
        aria-current={current ? 'step' : undefined}
        className={`rounded px-2 py-1 text-left font-medium ${
          current ? 'bg-amber-500/25 text-amber-100' : 'text-stone-200 hover:bg-stone-800'
        }`}
      >
        {move.san}
      </button>
    )
  }

  return (
    <ol className="grid grid-cols-[2.5rem_1fr_1fr] gap-y-0.5 text-sm">
      {scoreSheet(initialFen, moves).map((row) => (
        <li key={row.number} className="contents">
          <span className="py-1 pr-2 text-right tabular-nums text-stone-500">{row.number}.</span>
          {cell(row.white, '…')}
          {cell(row.black, '')}
        </li>
      ))}
    </ol>
  )
}
