import type { ReactNode } from 'react'

const TONES = {
  preview: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
  replay: 'border-sky-500/50 bg-sky-500/10 text-sky-200',
  analysis: 'border-violet-500/50 bg-violet-500/10 text-violet-200',
  history: 'border-stone-600 bg-stone-800/60 text-stone-300',
} as const

/** Says plainly that the board is not showing the game being played, and how to go back. */
export function ViewBanner({
  tone,
  children,
  backLabel,
  onBack,
}: {
  tone: keyof typeof TONES
  children: ReactNode
  backLabel: string
  onBack: () => void
}) {
  return (
    <div
      className={`flex h-10 shrink-0 items-center gap-3 rounded-md border px-3 text-sm ${TONES[tone]}`}
      role="status"
    >
      <div className="min-w-0 flex-1 truncate">{children}</div>
      <button
        type="button"
        onClick={onBack}
        className="shrink-0 rounded bg-stone-100/10 px-2.5 py-1 text-xs font-medium hover:bg-stone-100/20"
      >
        {backLabel}
      </button>
    </div>
  )
}
