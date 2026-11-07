import type { Candidates } from '@shared/coach'

/** The moves the coach is pointing at, numbered as their arrows are on the board. */
export function CandidateList({ candidates }: { candidates: Candidates }) {
  return (
    <section className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
      <h3 className="mb-2 text-xs font-medium text-yellow-200">Moves to consider</h3>
      <ol className="space-y-1.5 text-sm">
        {candidates.moves.map((candidate, index) => (
          <li key={candidate.uci} className="flex gap-2">
            <span className="w-4 shrink-0 text-right tabular-nums text-yellow-300">
              {index + 1}
            </span>
            <span>
              <span className="font-semibold text-stone-100">{candidate.san}</span>
              {candidate.note && <span className="text-stone-300"> — {candidate.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
