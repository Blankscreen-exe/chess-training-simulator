import type { Score } from '@shared/chess'

/** A score as a chess player writes it: +0.35, −1.20, 0.00, #3, #-2. */
export function formatScore(score: Score): string {
  if (score.type === 'mate') {
    return score.value > 0 ? `#${score.value}` : `#-${Math.abs(score.value)}`
  }
  const pawns = score.value / 100
  const sign = pawns > 0 ? '+' : pawns < 0 ? '−' : ''
  return `${sign}${Math.abs(pawns).toFixed(2)}`
}

/** How a centipawn lead turns into a share of the bar; about two pawns fills three quarters. */
const BAR_SCALE_CP = 250

/** How far the score favours White, from 0 (Black winning) to 1 (White winning). */
export function whiteShare(score: Score): number {
  if (score.type === 'mate') return score.value > 0 ? 1 : 0
  return 1 / (1 + Math.exp(-score.value / BAR_SCALE_CP))
}
