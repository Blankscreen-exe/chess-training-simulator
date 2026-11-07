import type { Color, Score } from '@shared/chess'
import { formatScore, whiteShare } from '../../lib/score'

/** How the engine rates the position, as a bar filled from White's side. */
export function EvalBar({ score, orientation }: { score: Score | null; orientation: Color }) {
  const share = score ? whiteShare(score) : 0.5
  const white = `${(share * 100).toFixed(1)}%`
  return (
    <div
      className={`relative flex w-5 shrink-0 overflow-hidden rounded-sm bg-stone-700 ${
        orientation === 'white' ? 'flex-col-reverse' : 'flex-col'
      }`}
      title={score ? `Evaluation ${formatScore(score)}` : 'No evaluation'}
      aria-label={score ? `Evaluation ${formatScore(score)}` : 'No evaluation'}
    >
      <div className="bg-stone-100 transition-[height] duration-500" style={{ height: white }} />
      {score && (
        <span
          className={`absolute left-0 right-0 text-center text-[9px] font-semibold ${
            share >= 0.5 === (orientation === 'white')
              ? 'bottom-1 text-stone-800'
              : 'top-1 text-stone-100'
          }`}
        >
          {formatScore(score).replace(/^[+−]/, '')}
        </span>
      )}
    </div>
  )
}
